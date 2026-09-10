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
import { createMediaQuery } from "~/instructions/hooks/use-media-query";
import {
  COLUMN_KEYS,
  createColumnsLayout,
  type ColumnKey,
  type ResizableSide,
} from "~/instructions/hooks/use-columns-layout";
import styles from "./workspace.module.scss";

const COLUMN_LABELS: Record<ColumnKey, string> = {
  left: "Узлы",
  middle: "Стек",
  right: "Настройки",
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
  const sole = () => shown().length === 1;
  /** Column that eats the remaining space: the stack, or the last one when it is hidden. */
  const flexKey = () =>
    phone() || hidden("middle") ? shown()[shown().length - 1]! : "middle";
  /** The divider left of `key` resizes the stack's neighbour — right column, or left when the stack is hidden. */
  const neighbourOf = (key: ColumnKey): ColumnKey =>
    key === "right" && !hidden("middle") ? "middle" : "left";
  const sideOf = (key: ColumnKey): ResizableSide =>
    neighbourOf(key) === "middle" ? "right" : "left";
  /** Columns are kept mounted (only hidden) — unmounting Kobalte tabs halts Solid's reactive graph. */
  const splitterActive = (key: ColumnKey) =>
    !phone() && !hidden(key) && shown().indexOf(key) > 0;

  return (
    <div class={styles.workspace}>
      <header class={styles.topbar}>
        <span class={styles.logo}>Reline</span>
        <div class={styles.viewToggles} role="group" aria-label="Панели">
          <For each={phone() ? PHONE_COLUMN_KEYS : COLUMN_KEYS}>
            {(key) => (
              <button
                type="button"
                class={styles.toggle}
                aria-pressed={!hidden(key) ? "true" : "false"}
                // on a phone the group is a switcher: one panel is always
                // active, so nothing may look disabled
                disabled={!phone() && !hidden(key) && sole()}
                onClick={() =>
                  phone() ? setPhonePanel(key) : toggleHidden(key)
                }
              >
                {COLUMN_LABELS[key]}
              </button>
            )}
          </For>
        </div>
      </header>

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
                  aria-label={`Изменить ширину: ${
                    COLUMN_LABELS[neighbourOf(key)]
                  }`}
                  tabindex="0"
                  onPointerDown={(e) => startResize(sideOf(key), e)}
                  onPointerMove={moveResize}
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
