import { type Component, For, Show, useContext } from "solid-js";
import type { Store } from "solid-js";
import { createDragReorder } from "~/instructions/hooks/use-drag-reorder";
import { flipReorder } from "~/instructions/hooks/use-flip-reorder";
import {
  useAddNode,
  useToggleEnabled,
} from "~/instructions/hooks/use-node-actions";
import { nodeLabel } from "~/components/nodes/registry";
import { NodeSwap } from "~/components/node-swap/node-swap";
import { Icon, UiSwitch } from "~/components/ui";
import { NodesContext, NodesDispatchContext } from "~/context/contexts";
import { NodesActionType } from "~/types/actions";
import { AddNodeMenu } from "~/components/nodes-list/add-node-menu";
import { t } from "~/lib/i18n";
import styles from "./nodes-list.module.scss";

export interface NodesListProps {
  selectedUid: () => string | null;
  /** Keyed projection: only the entering/leaving rows recompute on a click. */
  isSelected: Store<Record<string, boolean>>;
  onSelect: (uid: string) => void;
}

export const NodesList: Component<NodesListProps> = (props) => {
  const nodes = useContext(NodesContext);
  const dispatch = useContext(NodesDispatchContext);

  let itemsEl: HTMLDivElement | undefined;
  const { dragIndex, dropIndex, handlers } = createDragReorder(
    () => itemsEl,
    (from, to) => {
      flipReorder(
        itemsEl,
        "[data-flip-key]",
        () => {
          dispatch({ type: NodesActionType.MOVE, payload: { from, to } });
          // uid is the identity: the moved node keeps it, selection follows
          // automatically and no row remounts
        },
        (el) => el.getAttribute("data-flip-key"),
      );
    },
  );

  // the arrow defers the props read to selection time (not a reactive scope)
  const addNode = useAddNode((uid) => props.onSelect(uid));
  const toggleEnabled = useToggleEnabled();

  const count = () => nodes.length;

  return (
    <aside class={styles.panel}>
      <div class={styles.items} ref={itemsEl}>
        <For each={nodes}>
          {(node, index) => (
            <>
              <div
                class={{
                  [styles.dropPlaceholder]: true,
                  [styles.visible]: dropIndex() === index(),
                }}
              />
              <div
                data-node-id={node.uid}
                data-flip-key={node.uid}
                class={{
                  [styles.item]: true,
                  [styles.active]: props.isSelected[node.uid] === true,
                  [styles.dragging]: dragIndex() === index(),
                }}
                onClick={() => props.onSelect(node.uid)}
                // The whole row drags: the grip icon cost a slot in every row
                // and said less than the cursor does. Keyboard reordering stays
                // (↑/↓ on the focused row), and a press on the switch or the ×
                // stays with that control — the hook refuses those itself.
                tabindex="0"
                title={t("chrome.reorderNamed", {
                  name: node.name ?? nodeLabel(node.type),
                })}
                {...handlers(index())}
              >
                <UiSwitch
                  checked={node.enabled !== false}
                  onChange={(checked) => toggleEnabled(node, checked)}
                  ariaLabel={t("chrome.enable", {
                    name: node.name ?? nodeLabel(node.type),
                  })}
                />
                <span class={styles.name}>
                  <span class={styles.nameText}>
                    {node.name ?? nodeLabel(node.type)}
                  </span>
                  <Show when={node.name}>
                    <span class={styles.typeHint}>{nodeLabel(node.type)}</span>
                  </Show>
                </span>
                <NodeSwap node={node} />
                <button
                  type="button"
                  class={styles.remove}
                  aria-label={t("chrome.removeNamed", {
                    name: node.name ?? nodeLabel(node.type),
                  })}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({
                      type: NodesActionType.DELETE,
                      payload: node.uid,
                    });
                  }}
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            </>
          )}
        </For>
        <div
          class={{
            [styles.dropPlaceholder]: true,
            [styles.visible]: dropIndex() === count(),
          }}
        />
      </div>
      <AddNodeMenu onAdd={addNode} />
    </aside>
  );
};
