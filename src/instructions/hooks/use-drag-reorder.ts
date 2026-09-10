import { createSignal, type Accessor } from "solid-js";

export interface DragHandlers {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

export interface DragReorder {
  dragIndex: Accessor<number | null>;
  /** insertion position (0..n) — placeholder is rendered before item at this index */
  dropIndex: Accessor<number | null>;
  handlers: (index: number) => DragHandlers;
}

/**
 * Movement a press may travel before it becomes a drag. Without it every tap
 * on a row would start a reorder and the row would never select.
 */
const DRAG_THRESHOLD_PX = 6;

/**
 * Pointer-driven reorder. HTML5 drag-and-drop never fires on touch screens,
 * so the gesture is built from pointer events with capture on the handle: the
 * handle owns the whole gesture, works for mouse, finger and pen alike, and
 * the `touch-action: none` it needs lives on the handle only — the list keeps
 * scrolling normally everywhere else.
 *
 * `onMove` receives (from, to) where `to` is the final index after removal —
 * matches MOVE reducer splice semantics. Arrow keys on a focused handle move
 * the row too, so reordering does not require a pointing device at all.
 */
export const createDragReorder = (
  container: () => HTMLElement | undefined,
  onMove: (from: number, to: number) => void,
): DragReorder => {
  const [dragIndex, setDragIndex] = createSignal<number | null>(null);
  const [dropIndex, setDropIndex] = createSignal<number | null>(null);
  let pressed: { index: number; id: number; x: number; y: number } | null =
    null;

  const rows = (): HTMLElement[] => {
    const root = container();
    return root === undefined
      ? []
      : Array.from(root.querySelectorAll<HTMLElement>("[data-flip-key]"));
  };

  /** insertion index from a Y coordinate over the rows of the container */
  const insertionIndex = (clientY: number): number => {
    const items = rows();
    for (let i = 0; i < items.length; i++) {
      const rect = items[i]!.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return items.length;
  };

  const reset = () => {
    pressed = null;
    setDragIndex(null);
    setDropIndex(null);
  };

  // Dropping right before or right after the dragged row keeps the order, so
  // no placeholder is shown there — the gap must not promise a no-op move.
  const track = (clientY: number) => {
    const from = dragIndex();
    if (from === null) return;
    const next = insertionIndex(clientY);
    setDropIndex(next === from || next === from + 1 ? null : next);
  };

  const commit = (clientY: number) => {
    const from = dragIndex();
    const drop = from === null ? null : insertionIndex(clientY);
    reset();
    if (from === null || drop === null) return;
    const to = drop > from ? drop - 1 : drop;
    if (to !== from) onMove(from, to);
  };

  const step = (from: number, to: number) => {
    if (to < 0 || to >= rows().length) return;
    onMove(from, to);
  };

  const handlers = (index: number): DragHandlers => ({
    onPointerDown: (e) => {
      // primary button only: right/middle click stays native
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pressed = { index, id: e.pointerId, x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      if (pressed === null || pressed.id !== e.pointerId) return;
      if (dragIndex() === null) {
        const travelled = Math.hypot(
          e.clientX - pressed.x,
          e.clientY - pressed.y,
        );
        if (travelled < DRAG_THRESHOLD_PX) return;
        setDragIndex(pressed.index);
      }
      track(e.clientY);
    },
    onPointerUp: (e) => {
      if (pressed === null || pressed.id !== e.pointerId) return;
      // a press that never travelled is a tap: release without reordering so
      // the click below it still selects the row
      if (dragIndex() === null) reset();
      else commit(e.clientY);
    },
    onPointerCancel: (e) => {
      if (pressed === null || pressed.id !== e.pointerId) return;
      reset();
    },
    onKeyDown: (e) => {
      if (dragIndex() !== null) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      step(index, e.key === "ArrowUp" ? index - 1 : index + 1);
    },
  });

  return { dragIndex, dropIndex, handlers };
};
