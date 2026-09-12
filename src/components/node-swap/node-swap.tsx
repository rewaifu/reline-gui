import {
  For,
  Show,
  createMemo,
  createSignal,
  useContext,
  type Component,
} from "solid-js";
import { Portal } from "@solidjs/web";
import { NODE_ORDER, nodeLabel } from "~/components/nodes/registry";
import { Icon } from "~/components/ui/icon";
import { createDismissOnOutside } from "~/components/ui/create-dismiss-on-outside";
import { createMenuPosition } from "~/components/ui/menu-position";
import { NodesDispatchContext } from "~/context/contexts";
import { NodesActionType } from "~/types/actions";
import type { StackNode } from "~/types/node";
import { t } from "~/lib/i18n";
import styles from "./node-swap.module.scss";

export interface NodeSwapProps {
  node: StackNode;
  class?: string;
}

/** Swap button + a portaled filter menu: replaces the node's type in place —
 * uid, position and enabled state survive, options reset to the new type's
 * defaults. The option list renders inline in the popover (a nested portaled
 * combobox would die to this popover's own outside-dismiss on option
 * pointerdown, and the click would fall through onto the card underneath).
 * Used by the node list row, the stack card header and the settings panel. */
export const NodeSwap: Component<NodeSwapProps> = (props) => {
  const dispatch = useContext(NodesDispatchContext);
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  let btnEl: HTMLButtonElement | undefined;
  let popEl: HTMLDivElement | undefined;
  let inputEl: HTMLInputElement | undefined;
  let listEl: HTMLUListElement | undefined;

  createDismissOnOutside(open, setOpen, () => [btnEl, popEl]);
  createMenuPosition(
    open,
    () => btnEl,
    () => popEl,
    () => "bottom-start",
  );

  // the current type is meaningless as a replacement
  const candidates = () =>
    NODE_ORDER.filter((type) => type !== props.node.type).map(nodeLabel);

  const matches = createMemo(() => {
    const q = query().trim().toLowerCase();
    const all = candidates();
    if (q === "") return all;
    return all.filter((label) => label.toLowerCase().includes(q));
  });

  const openMenu = () => {
    setQuery("");
    setActive(0);
    setOpen(true);
    requestAnimationFrame(() => inputEl?.focus());
  };

  const closeMenu = () => {
    setOpen(false);
    btnEl?.focus();
  };

  const swap = (label: string | undefined) => {
    if (label === undefined) return;
    const type = NODE_ORDER.find((candidate) => nodeLabel(candidate) === label);
    if (type === undefined || type === props.node.type) return;
    dispatch({
      type: NodesActionType.SWAP,
      payload: { uid: props.node.uid, nodeType: type },
    });
    setOpen(false);
  };

  const scrollActive = () => {
    requestAnimationFrame(() => {
      listEl
        ?.querySelector("[data-active]")
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const onInputKeyDown = (e: KeyboardEvent) => {
    const list = matches();
    if (e.key === "Escape") {
      closeMenu();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length === 0) return;
      setActive(
        Math.min(
          list.length - 1,
          Math.max(0, active() + (e.key === "ArrowDown" ? 1 : -1)),
        ),
      );
      scrollActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      swap(list[active()] ?? list[0]);
    }
  };

  return (
    <div class={[styles.swap, props.class]}>
      <button
        ref={btnEl}
        type="button"
        class={styles.button}
        aria-label={t("chrome.swapNamed", {
          name: props.node.name ?? nodeLabel(props.node.type),
        })}
        title={t("chrome.swap")}
        aria-expanded={open() ? "true" : "false"}
        aria-haspopup="listbox"
        onPointerDown={(e) => e.preventDefault()}
        onClick={(e) => {
          // the list row and the card header fold/select on click — the swap
          // button keeps its own zone, like rename and remove do
          e.stopPropagation();
          if (open()) closeMenu();
          else openMenu();
        }}
      >
        <Icon name="swap" size={13} />
      </button>
      <Show when={open()}>
        <Portal>
          <div
            ref={popEl}
            class={styles.popover}
            style={{ position: "fixed", left: "0px", top: "0px" }}
          >
            <input
              ref={inputEl}
              class={styles.filter}
              type="text"
              role="combobox"
              aria-label={t("chrome.swap")}
              aria-expanded="true"
              aria-controls={`${props.node.uid}-swap-list`}
              aria-activedescendant={`${props.node.uid}-swap-list-${active()}`}
              autocomplete="off"
              placeholder={t("chrome.swapPick")}
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
            />
            <ul
              ref={listEl}
              id={`${props.node.uid}-swap-list`}
              role="listbox"
              class={styles.list}
            >
              <For each={matches()}>
                {(label, index) => (
                  <li>
                    <button
                      id={`${props.node.uid}-swap-list-${index()}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      data-active={index() === active() ? "" : undefined}
                      class={styles.item}
                      onPointerDown={(e) => e.preventDefault()}
                      onPointerMove={() => setActive(index())}
                      onClick={() => swap(label)}
                    >
                      {label}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Portal>
      </Show>
    </div>
  );
};
