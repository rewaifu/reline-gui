import { type Component, Show, useContext } from "solid-js";
import { Icon } from "~/components/ui";
import { AddNode } from "~/components/nodes-list/add-node-menu";
import { Slot } from "~/components/slot/slot";
import { NodesContext, NodesDispatchContext } from "~/context/contexts";
import { useAddNode } from "~/hooks/use-node-actions";
import { t } from "~/lib/i18n";
import { NodesActionType } from "~/types/actions";
import styles from "./stack-toolbar.module.scss";

export interface StackToolbarProps {
  /** A phone switches panels from the bottom bar, so no panel toggles here. */
  phone: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  /** Told the uid of a node the "+" just added, to select it. */
  onSelect: (uid: string) => void;
}

/**
 * The strip above the stack — what the top bar used to hold, next to the thing
 * it acts on. Left: how many nodes there are, fold-all and the "+" that adds one — what a large
 * config needs most. Right: plugin contributions and the two side-panel toggles
 * (the node outline and the settings, where the language is chosen).
 *
 * It sits inside the stack panel instead of a bar of its own: one less line
 * across the whole window, and the controls scroll no further away than the
 * nodes they belong to.
 */
export const StackToolbar: Component<StackToolbarProps> = (props) => {
  const nodes = useContext(NodesContext);
  const dispatch = useContext(NodesDispatchContext);
  // the arrow defers the props read to selection time (not a reactive scope)
  const addNode = useAddNode((uid) => props.onSelect(uid));
  const enabledCount = () => nodes.filter((n) => n.enabled !== false).length;
  const anyOpen = () => nodes.some((n) => n.collapsed === false);

  // one button: fold everything while something is open, unfold when all are
  // folded — the icon always shows what a click does next
  const toggleAll = () => {
    const collapsed = anyOpen();
    for (const node of nodes)
      if ((node.collapsed === true) !== collapsed)
        dispatch({
          type: NodesActionType.CHANGE,
          payload: { uid: node.uid, collapsed },
        });
  };

  return (
    <div class={styles.toolbar}>
      <Show when={!props.phone}>
        <button
          type="button"
          class={styles.tool}
          aria-pressed={props.leftOpen ? "true" : "false"}
          aria-label={t("chrome.stack.togglePanel", {
            label: t("chrome.columns.left"),
          })}
          title={t("chrome.columns.left")}
          onClick={() => props.onToggleLeft()}
        >
          <Icon name="layout-sidebar" size={16} />
        </button>
      </Show>
      <p class={styles.summary}>
        {t("chrome.stack.summary", {
          count: nodes.length,
          on: enabledCount(),
        })}
      </p>
      <button
        type="button"
        class={styles.tool}
        disabled={nodes.length === 0}
        aria-label={t(
          anyOpen() ? "chrome.stack.collapseAll" : "chrome.stack.expandAll",
        )}
        title={t(
          anyOpen() ? "chrome.stack.collapseAll" : "chrome.stack.expandAll",
        )}
        onClick={toggleAll}
      >
        <Icon name={anyOpen() ? "chevrons-up" : "chevrons-down"} size={16} />
      </button>
      <AddNode onAdd={addNode} />
      <div class={styles.end}>
        <Slot name="topbar" />
        <Show when={!props.phone}>
          <button
            type="button"
            class={styles.tool}
            aria-pressed={props.rightOpen ? "true" : "false"}
            aria-label={t("chrome.stack.togglePanel", {
              label: t("chrome.columns.right"),
            })}
            title={t("chrome.columns.right")}
            onClick={() => props.onToggleRight()}
          >
            <Icon name="layout-sidebar-right" size={16} />
          </button>
        </Show>
      </div>
    </div>
  );
};
