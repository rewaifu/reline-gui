import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createProjection,
  createSignal,
} from "solid-js";
import { MIN_RIGHT_WIDTH, MIN_SIDE_WIDTH } from "~/constants";
import { NodesList } from "~/components/nodes-list/nodes-list";
import { NodeStack } from "~/components/node-card/node-card";
import { ConfigPanel } from "~/components/config-panel/config-panel";
import { StackToolbar } from "~/components/stack-toolbar/stack-toolbar";
import { createMediaQuery } from "~/hooks/use-media-query";
import {
  COLUMN_KEYS,
  createColumnsLayout,
  type ColumnKey,
  type ResizableSide,
} from "~/hooks/use-columns-layout";
import { t, type MessageKey } from "~/lib/i18n";
import styles from "./workspace.module.scss";

// Keys, not text: the panel names are formatted where they render, so the
// language switcher rewrites them without a second source of truth.
const COLUMN_LABEL_KEYS: Record<ColumnKey, MessageKey> = {
  left: "chrome.columns.left",
  middle: "chrome.columns.middle",
  right: "chrome.columns.right",
};

/**
 * Phones: one panel at a time with the switcher pinned to the bottom edge.
 * Side-by-side columns are unusable there — three stacked panels turned the
 * page into a 2000px scroll, and every panel lost its own scroll context.
 */
const PHONE_QUERY =
  "(max-width: 700px), (pointer: coarse) and (max-height: 500px)";

/**
 * A phone shows the stack and the settings, nothing else: the node list is a
 * second view of the same stack, and its only unique controls (the enable
 * switch, add-node) moved onto the stack panel. Fewer, bigger targets beat a
 * third panel on a 390px screen.
 */
const PHONE_COLUMN_KEYS: readonly ColumnKey[] = ["middle", "right"];

const Workspace: Component = () => {
  const [selectedUid, setSelectedUid] = createSignal<string | null>(null);
  // Keyed selection projection: on every click only the entering and
  // leaving rows recompute (1–2 class updates total) instead of every card
  // re-comparing its id against the selected one (n per click).
  const isSelected = createProjection<Record<string, boolean>>((draft) => {
    for (const key of Object.keys(draft)) delete draft[key];
    const uid = selectedUid();
    if (uid !== null) draft[uid] = true;
  }, {});
  const {
    layout,
    resizing,
    visibleColumns,
    toggleHidden,
    startResize,
    moveResize,
    endResize,
    nudge,
    resetWidth,
  } = createColumnsLayout();

  const columns = visibleColumns;
  const phone = createMediaQuery(PHONE_QUERY);
  /** Which panel the phone shows — the desktop layout keeps all three. */
  const [phonePanel, setPhonePanel] = createSignal<ColumnKey>("middle");
  const shown = () => (phone() ? [phonePanel()] : columns());
  const hidden = (key: ColumnKey) =>
    phone() ? key !== phonePanel() : layout().hidden[key];
  /** Column that eats the remaining space: always the stack on a desktop (it is
   * never hidden), the single visible panel on a phone. */
  const flexKey = (): ColumnKey => (phone() ? phonePanel() : "middle");
  /** The divider left of `key` resizes the stack's neighbour: the settings
   * column's divider moves the right panel, the stack's moves the left one. */
  const neighbourOf = (key: ColumnKey): ColumnKey =>
    key === "right" ? "middle" : "left";
  const sideOf = (key: ColumnKey): ResizableSide =>
    neighbourOf(key) === "middle" ? "right" : "left";
  /** Columns are kept mounted (only hidden) — unmounting Kobalte tabs halts Solid's reactive graph. */
  const splitterActive = (key: ColumnKey) =>
    !phone() && !hidden(key) && shown().indexOf(key) > 0;

  /** The splitter's line points at the pointer: its height within the gap. */
  const followPointer = (e: PointerEvent & { currentTarget: HTMLElement }) => {
    const gap = e.currentTarget;
    gap.style.setProperty(
      "--handle-y",
      `${e.clientY - gap.getBoundingClientRect().top}px`,
    );
  };

  return (
    <div class={styles.workspace}>
      {/* A phone has no room for a toolbar of panel toggles: one panel at a
          time, switched from a bar pinned to the bottom edge. Everywhere else
          the toggles live in the stack's own toolbar and nothing spans the
          window above the columns. */}
      <Show when={phone()}>
        <div
          class={styles.viewToggles}
          role="group"
          aria-label={t("chrome.panels")}
        >
          <For each={PHONE_COLUMN_KEYS}>
            {(key) => (
              <button
                type="button"
                class={styles.toggle}
                aria-pressed={!hidden(key) ? "true" : "false"}
                onClick={() => setPhonePanel(key)}
              >
                {t(COLUMN_LABEL_KEYS[key])}
              </button>
            )}
          </For>
        </div>
      </Show>

      <div class={[styles.columns, resizing() && styles.resizing]}>
        <For each={COLUMN_KEYS}>
          {(key, index) => (
            <>
              <Show when={index() > 0}>
                <div
                  class={[
                    styles.splitter,
                    !splitterActive(key) && styles.hidden,
                  ]}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t("chrome.resizeColumn", {
                    label: t(COLUMN_LABEL_KEYS[neighbourOf(key)]),
                  })}
                  tabindex="0"
                  onPointerDown={(e) => startResize(sideOf(key), e)}
                  onPointerMove={(e) => {
                    followPointer(e);
                    moveResize(e);
                  }}
                  onPointerLeave={(e) => {
                    // a drag keeps the pointer captured, so this only fires for a
                    // plain hover: the line goes back to the middle
                    if (e.buttons === 0)
                      e.currentTarget.style.removeProperty("--handle-y");
                  }}
                  onPointerUp={endResize}
                  onLostPointerCapture={endResize}
                  onDblClick={() => resetWidth(sideOf(key))}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    nudge(sideOf(key), e.key === "ArrowRight" ? 1 : -1);
                  }}
                />
              </Show>
              <div
                class={[
                  styles.column,
                  hidden(key) && styles.hidden,
                  key === flexKey() && styles.flex,
                ]}
                style={
                  key === "middle"
                    ? undefined
                    : {
                        "--col-width": `${layout()[key]}px`,
                        "--col-min-width": `${
                          key === "right" ? MIN_RIGHT_WIDTH : MIN_SIDE_WIDTH
                        }px`,
                      }
                }
              >
                <Switch>
                  <Match when={key === "left"}>
                    <NodesList
                      selectedUid={selectedUid}
                      isSelected={isSelected}
                      onSelect={setSelectedUid}
                    />
                  </Match>
                  <Match when={key === "middle"}>
                    <StackToolbar
                      phone={phone()}
                      leftOpen={!layout().hidden.left}
                      rightOpen={!layout().hidden.right}
                      onToggleLeft={() => toggleHidden("left")}
                      onToggleRight={() => toggleHidden("right")}
                      onSelect={setSelectedUid}
                    />
                    <NodeStack
                      selectedUid={selectedUid}
                      isSelected={isSelected}
                      onSelect={setSelectedUid}
                      phone={phone()}
                    />
                  </Match>
                  <Match when={key === "right"}>
                    <ConfigPanel selectedUid={selectedUid} />
                  </Match>
                </Switch>
              </div>
            </>
          )}
        </For>
      </div>
    </div>
  );
};

export { Workspace };
