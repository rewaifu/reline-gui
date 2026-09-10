import { createEffect, createSignal } from "solid-js";
import {
  LAYOUT_STORAGE_KEY,
  MIN_MIDDLE_WIDTH,
  MIN_RIGHT_WIDTH,
  MIN_SIDE_WIDTH,
  SPLITTER_WIDTH,
} from "~/constants";

export type ColumnKey = "left" | "middle" | "right";
/** Side columns have a fixed width; the middle one takes the remaining space. */
export type ResizableSide = "left" | "right";

export interface LayoutState {
  left: number;
  right: number;
  hidden: Record<ColumnKey, boolean>;
}

export const DEFAULT_LAYOUT: LayoutState = {
  left: 260,
  right: 380,
  hidden: { left: false, middle: false, right: false },
};

export const COLUMN_KEYS: readonly ColumnKey[] = [
  "left",
  "middle",
  "right",
] as const;

const MAX_SIDE_WIDTH = 720;
const KEY_STEP = 24;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const readNumber = (value: unknown, fallback: number, min: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? clamp(Math.round(value), min, MAX_SIDE_WIDTH)
    : fallback;

const loadLayout = (): LayoutState => {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LayoutState> & {
        hidden?: Partial<Record<ColumnKey, boolean>>;
      };
      const hidden = { ...DEFAULT_LAYOUT.hidden, ...parsed.hidden };
      // never restore an empty workspace
      if (COLUMN_KEYS.some((key) => !hidden[key])) {
        return {
          left: readNumber(parsed.left, DEFAULT_LAYOUT.left, MIN_SIDE_WIDTH),
          right: readNumber(
            parsed.right,
            DEFAULT_LAYOUT.right,
            MIN_RIGHT_WIDTH,
          ),
          hidden,
        };
      }
    }
  } catch {
    // corrupted storage — fall through to defaults
  }
  return { ...DEFAULT_LAYOUT, hidden: { ...DEFAULT_LAYOUT.hidden } };
};

interface ActiveResize {
  side: ResizableSide;
  rect: DOMRect;
  max: number;
}

/**
 * Widths + visibility of the three workspace columns.
 *
 * Widths are kept in a plain signal (not a store) because every change
 * replaces the whole object; persistence rides on the same value.
 * Resizing uses pointer capture so the gesture survives fast drags and
 * leaves the pointer over iframes/other nodes.
 */
export const createColumnsLayout = () => {
  const [layout, setLayout] = createSignal<LayoutState>(loadLayout());
  const [resizing, setResizing] = createSignal(false);

  // Layout changes stream in per pointermove frame during a column drag —
  // a synchronous localStorage write per frame would stutter the gesture.
  let saveTimer: number | undefined;
  createEffect(
    () => JSON.stringify(layout()),
    (json) => {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try {
          localStorage.setItem(LAYOUT_STORAGE_KEY, json);
        } catch {
          // storage full or unavailable — layout just won't persist
        }
      }, 300);
      return () => clearTimeout(saveTimer);
    },
  );

  let active: ActiveResize | null = null;

  const minWidthOf = (side: ResizableSide) =>
    side === "right" ? MIN_RIGHT_WIDTH : MIN_SIDE_WIDTH;

  const setWidth = (side: ResizableSide, width: number) =>
    setLayout((state) => {
      const next = clamp(Math.round(width), minWidthOf(side), MAX_SIDE_WIDTH);
      return side === "left"
        ? { ...state, left: next }
        : { ...state, right: next };
    });

  const toggleHidden = (key: ColumnKey) =>
    setLayout((state) => {
      const hidden = { ...state.hidden, [key]: !state.hidden[key] };
      const visible = COLUMN_KEYS.filter((column) => !hidden[column]);
      // at least one column has to stay on screen
      if (visible.length === 0) return state;
      return { ...state, hidden };
    });

  const startResize = (side: ResizableSide, event: PointerEvent) => {
    const handle = event.currentTarget;
    if (!(handle instanceof HTMLElement)) return;
    const row = handle.parentElement;
    if (!row) return;

    const rect = row.getBoundingClientRect();
    // one-time snapshot: the drag bounds are computed once, on grab
    const staticLayout = layout();
    const visibleCount = COLUMN_KEYS.filter(
      (column) => !staticLayout.hidden[column],
    ).length;
    const otherWidth =
      side === "left"
        ? staticLayout.hidden.right
          ? 0
          : staticLayout.right
        : staticLayout.hidden.left
          ? 0
          : staticLayout.left;
    const reserved =
      otherWidth +
      (staticLayout.hidden.middle ? 0 : MIN_MIDDLE_WIDTH) +
      Math.max(visibleCount - 1, 0) * SPLITTER_WIDTH;

    active = {
      side,
      rect,
      max: Math.max(minWidthOf(side), rect.width - reserved),
    };
    setResizing(true);
    handle.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: PointerEvent) => {
    if (!active) return;
    const { side, rect, max } = active;
    const raw =
      side === "left" ? event.clientX - rect.left : rect.right - event.clientX;
    setWidth(side, Math.min(raw, max));
  };

  const endResize = () => {
    if (!active) return;
    active = null;
    setResizing(false);
  };

  const nudge = (side: ResizableSide, direction: -1 | 1) =>
    setWidth(side, layout()[side] + direction * KEY_STEP);

  const resetWidth = (side: ResizableSide) =>
    setWidth(side, DEFAULT_LAYOUT[side]);

  const visibleColumns = () =>
    COLUMN_KEYS.filter((key) => !layout().hidden[key]);

  return {
    layout,
    resizing,
    visibleColumns,
    toggleHidden,
    startResize,
    moveResize,
    endResize,
    nudge,
    resetWidth,
  };
};
