import {
  type Component,
  For,
  Show,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";
import type { Store } from "solid-js";
import { NodesContext, NodesDispatchContext } from "~/context/contexts";
import { NodesActionType } from "~/types/actions";
import type { StackNode } from "~/types/node";
import {
  createDragReorder,
  type DragHandlers,
} from "~/instructions/hooks/use-drag-reorder";
import { flipReorder } from "~/instructions/hooks/use-flip-reorder";
import {
  useAddNode,
  useToggleEnabled,
} from "~/instructions/hooks/use-node-actions";
import { nodeLabel } from "~/components/nodes/registry";
import { NodeOptionsForm } from "~/components/nodes/node-options-form";
import { AddNodeMenu } from "~/components/nodes-list/add-node-menu";
import { Icon, UiSwitch } from "~/components/ui";
import { t } from "~/lib/i18n";
import styles from "./node-card.module.scss";

interface NodeCardProps {
  /** The row's node object, handed straight down from <For> — no re-find by id. */
  node: StackNode;
  /** Position in the stack — drag state is index-based. */
  index: number;
  /** Keyed projection: only the entering/leaving rows recompute on a click. */
  selected: boolean;
  onSelect: (uid: string) => void;
  dragIndex: () => number | null;
  dropIndex: () => number | null;
  handlers: (index: number) => DragHandlers;
  /** Phone: the node list is hidden, so its enable switch lives on the card. */
  phone: boolean;
}

const NodeCard: Component<NodeCardProps> = (props) => {
  const dispatch = useContext(NodesDispatchContext);
  const toggleEnabled = useToggleEnabled();
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  let renameInput: HTMLInputElement | undefined;
  // the rename input mounts on demand — grab focus and select the text so
  // typing replaces the name right away
  createEffect(
    () => editing(),
    (isEditing) => {
      if (!isEditing) return;
      renameInput?.focus();
      renameInput?.select();
    },
  );

  const node = () => props.node;

  const change = (patch: Partial<StackNode>) => {
    dispatch({
      type: NodesActionType.CHANGE,
      payload: { uid: node().uid, ...patch },
    });
  };

  const startRename = () => {
    setDraft(node().name ?? "");
    setEditing(true);
  };

  const commitRename = () => {
    const value = draft().trim();
    change({ name: value === "" ? undefined : value });
    setEditing(false);
  };

  return (
    <>
      <div
        class={{
          [styles.dropPlaceholder]: true,
          [styles.visible]: props.dropIndex() === props.index,
        }}
      />
      <section
        data-node-id={node().uid}
        data-flip-key={node().uid}
        class={{
          [styles.card]: true,
          [styles.selected]: props.selected,
          [styles.dragging]: props.dragIndex() === props.index,
        }}
        onClick={() => props.onSelect(node().uid)}
      >
        <header
          class={styles.header}
          onClick={(e) => {
            props.onSelect(node().uid);
            // A single click anywhere on the strip folds the node — the name
            // included. It used to be excluded because the title is a span
            // with its own handler, which also stopped the event: the wide
            // empty stretch beside the name (the title is `flex: 1`, so that
            // stretch is *inside* it) swallowed the first click and the card
            // opened only on the second. Only the grip is left out: a press
            // there is a drag, and a drop would otherwise fold the card it
            // just dropped.
            if (
              e.target instanceof Element &&
              e.target.closest("[data-drag-handle]") !== null
            )
              return;
            change({ collapsed: !node().collapsed });
          }}
        >
          <span
            class={styles.dragHandle}
            data-drag-handle
            role="button"
            tabindex="0"
            aria-label={t("chrome.reorder")}
            title={t("chrome.reorderTitle")}
            {...props.handlers(props.index)}
          >
            <Icon name="drag-drop" size={18} />
          </span>
          <button
            type="button"
            class={styles.iconBtn}
            aria-label={t("chrome.rename")}
            title={t("chrome.rename")}
            onClick={(e) => {
              e.stopPropagation();
              startRename();
            }}
          >
            <Icon name="pencil" size={13} />
          </button>
          <Show when={!props.phone}>
            <button
              type="button"
              class={styles.iconBtn}
              aria-label={t("chrome.remove")}
              title={t("chrome.remove")}
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: NodesActionType.DELETE, payload: node().uid });
              }}
            >
              <Icon name="trash" size={13} />
            </button>
          </Show>
          <Show when={props.phone}>
            {/* The node list carries this switch on wider screens; on a phone
                it is the only way to take a node out of the run. */}
            <span
              class={styles.enable}
              onClick={(e) => e.stopPropagation()}
              onDblClick={(e) => e.stopPropagation()}
            >
              <UiSwitch
                checked={node().enabled !== false}
                onChange={(enabled) => toggleEnabled(node(), enabled)}
                ariaLabel={t("chrome.enable", {
                  name: node().name ?? nodeLabel(node().type),
                })}
              />
            </span>
          </Show>
          <Show
            when={!editing()}
            fallback={
              <input
                ref={(el) => (renameInput = el)}
                class={styles.renameInput}
                value={draft()}
                placeholder={node().name ?? nodeLabel(node().type)}
                aria-label={t("chrome.nodeName")}
                onClick={(e) => e.stopPropagation()}
                onInput={(e) => setDraft(e.currentTarget.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  else if (e.key === "Escape") setEditing(false);
                }}
              />
            }
          >
            {/* No handler of its own: selecting and folding are the header's
                job, and a handler here would have to stop the event to keep
                its own zone — which is exactly what broke the first click. */}
            <span class={styles.title}>
              <span class={styles.titleText}>
                {node().name ?? nodeLabel(node().type)}
              </span>
              <Show when={node().name}>
                <span class={styles.typeHint}>{nodeLabel(node().type)}</span>
              </Show>
            </span>
          </Show>
          <button
            type="button"
            class={styles.chevron}
            aria-label={t("chrome.collapse")}
            aria-expanded={node().collapsed === false ? "true" : "false"}
            onClick={(e) => {
              e.stopPropagation();
              change({ collapsed: !node().collapsed });
            }}
          >
            <Icon
              name={
                node().collapsed === false ? "chevron-down" : "chevron-right"
              }
              size={14}
            />
          </button>
        </header>
        <Show when={node().collapsed === false}>
          <div class={styles.separator} role="separator" />
          {/* Destructive action, phone edition: out of the always-visible
              strip (where a stray thumb costs a node) and into the expanded
              body, with a label that says what it deletes. */}
          <Show when={props.phone}>
            <div class={styles.cardActions}>
              <button
                type="button"
                class={styles.deleteBtn}
                aria-label={t("chrome.remove")}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({
                    type: NodesActionType.DELETE,
                    payload: node().uid,
                  });
                }}
              >
                <Icon name="trash" size={16} />
                {t("chrome.remove")}
              </button>
            </div>
          </Show>
          <NodeOptionsForm node={node()} />
        </Show>
      </section>
    </>
  );
};

export interface NodeCardsProps {
  selectedUid: () => string | null;
  isSelected: Store<Record<string, boolean>>;
  onSelect: (uid: string) => void;
  /** Phone: the node list is hidden — the stack adds nodes itself. */
  phone: boolean;
}
export const NodeStack: Component<NodeCardsProps> = (props) => {
  const nodes = useContext(NodesContext);
  const dispatch = useContext(NodesDispatchContext);
  // the arrow defers the props read to selection time (not a reactive scope)
  const addNode = useAddNode((uid) => props.onSelect(uid));
  let stack: HTMLDivElement | undefined;
  const { dragIndex, dropIndex, handlers } = createDragReorder(
    () => stack,
    (from, to) => {
      flipReorder(
        stack,
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

  // selecting a node in the left list scrolls its card into view
  createEffect(
    () => props.selectedUid(),
    (uid) => {
      if (uid === null) return;
      if (stack === undefined) return;
      const card = stack.querySelector(`[data-node-id="${uid}"]`);
      if (card === null) return;
      // a click on the card itself selects too — scrolling a visible card
      // would glide the layout mid double-click and kill the rename; reveal
      // only cards that are (partially) outside the stack viewport
      const rect = card.getBoundingClientRect();
      const box = stack.getBoundingClientRect();
      if (rect.top >= box.top && rect.bottom <= box.bottom) return;
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
  );

  return (
    <>
      <div class={styles.stack} ref={stack}>
        <For each={nodes}>
          {(node, index) => (
            <NodeCard
              node={node}
              index={index()}
              selected={props.isSelected[node.uid] === true}
              onSelect={props.onSelect}
              dragIndex={dragIndex}
              dropIndex={dropIndex}
              handlers={handlers}
              phone={props.phone}
            />
          )}
        </For>
        <div
          class={{
            [styles.dropPlaceholder]: true,
            [styles.visible]: dropIndex() === nodes.length,
          }}
        />
      </div>
      {/* Pinned below the scroll area, not inside it: adding a node is the
          most common action on a phone and must never need a scroll. */}
      <Show when={props.phone}>
        <AddNodeMenu onAdd={addNode} />
      </Show>
    </>
  );
};
