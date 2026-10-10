import {
  For,
  Show,
  createSignal,
  createUniqueId,
  onCleanup,
  omit,
  type Component,
} from "solid-js";
import { Portal } from "@solidjs/web";
import { Icon } from "../icon";
import styles from "./select.module.scss";
import { createDismissOnOutside } from "../create-dismiss-on-outside";
import { createMenuPosition } from "../menu-position";
import { t } from "~/lib/i18n";

export interface UiSelectProps {
  value: string | null;
  onChange: (value: string) => void;
  items: readonly string[];
  placeholder?: string;
  /** Accessible name for the trigger — use when the visible label lives outside. */
  ariaLabel?: string;
  /** Set to link an external <label for> to this trigger. */
  id?: string;
  class?: string;
  /** Pale, non-interactive trigger (the switch next to it owns the row). */
  disabled?: boolean;
}

/** Single-value dropdown over the raw wire strings. Focus stays on the
 * trigger while the menu is open (roving `aria-activedescendant`); arrows
 * move, Enter commits, Escape closes, printable characters typeahead. */
export const UiSelect: Component<UiSelectProps> = (props) => {
  const rest = omit(
    props,
    "onChange",
    "value",
    "items",
    "placeholder",
    "ariaLabel",
    "id",
    "class",
    "disabled",
  );
  const [open, setOpen] = createSignal(false);
  const [highlight, setHighlight] = createSignal(-1);
  const listId = `${createUniqueId()}-listbox`;
  let triggerEl: HTMLButtonElement | undefined;
  let contentEl: HTMLDivElement | undefined;
  let listEl: HTMLUListElement | undefined;
  let typeTimer: number | undefined;
  let typeBuf = "";
  onCleanup(() => clearTimeout(typeTimer));

  createDismissOnOutside(open, setOpen, () => [triggerEl, contentEl]);
  createMenuPosition(
    open,
    () => triggerEl,
    () => contentEl,
    () => "bottom-start",
  );

  const scrollHighlight = () => {
    requestAnimationFrame(() => {
      listEl
        ?.querySelector("[data-highlighted]")
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const openMenu = (fromTop = true) => {
    if (props.items.length === 0) return;
    typeBuf = "";
    const selected = props.items.indexOf(props.value ?? "");
    setHighlight(
      selected >= 0 ? selected : fromTop ? 0 : props.items.length - 1,
    );
    setOpen(true);
  };

  const closeMenu = (refocus = false) => {
    setOpen(false);
    setHighlight(-1);
    typeBuf = "";
    if (refocus) triggerEl?.focus();
  };

  const commit = (index: number) => {
    const value = props.items[index];
    if (value === undefined) return;
    closeMenu();
    triggerEl?.focus();
    props.onChange(value);
  };

  const move = (delta: number) => {
    const count = props.items.length;
    if (count === 0) return;
    // clamp, not wrap: wrapping teleports the highlight across the whole list
    setHighlight(Math.min(count - 1, Math.max(0, highlight() + delta)));
    scrollHighlight();
  };

  const typeahead = (key: string) => {
    typeBuf = (typeBuf + key).toLowerCase();
    clearTimeout(typeTimer);
    typeTimer = window.setTimeout(() => {
      typeBuf = "";
    }, 500);
    const at = props.items.findIndex((item) =>
      item.toLowerCase().startsWith(typeBuf),
    );
    if (at >= 0) {
      setHighlight(at);
      scrollHighlight();
    }
  };

  const onTriggerClick = () => {
    if (props.disabled) return;
    if (open()) closeMenu();
    else openMenu(true);
  };

  const onTriggerKeyDown = (e: KeyboardEvent) => {
    if (props.disabled) return;
    if (e.key === "Tab") {
      closeMenu();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open()) openMenu(e.key === "ArrowDown");
      else move(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (!open()) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu(true);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        openMenu(true);
        typeahead(e.key);
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(highlight());
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
      scrollHighlight();
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlight(props.items.length - 1);
      scrollHighlight();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      typeahead(e.key);
    }
  };

  return (
    <>
      <button
        {...rest}
        ref={triggerEl}
        type="button"
        id={props.id}
        class={[styles.trigger, props.class]}
        disabled={props.disabled}
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open() ? "true" : "false"}
        aria-controls={open() ? listId : undefined}
        aria-activedescendant={
          open() && highlight() >= 0 ? `${listId}-${highlight()}` : undefined
        }
        onClick={onTriggerClick}
        onKeyDown={onTriggerKeyDown}
      >
        <span
          class={styles.value}
          data-placeholder-shown={props.value == null ? "" : undefined}
        >
          {props.value ?? props.placeholder ?? t("ui.select")}
        </span>
        <span class={styles.icon} aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      <Show when={open()}>
        <Portal>
          <div
            ref={contentEl}
            class={styles.content}
            style={{ position: "fixed", left: "0px", top: "0px" }}
          >
            <ul
              ref={listEl}
              id={listId}
              role="listbox"
              class={styles.listbox}
              aria-label={props.ariaLabel}
            >
              <For each={props.items}>
                {(item, index) => (
                  <li
                    role="option"
                    id={`${listId}-${index()}`}
                    aria-selected={item === props.value ? "true" : "false"}
                    data-selected={item === props.value ? "" : undefined}
                    data-highlighted={index() === highlight() ? "" : undefined}
                    class={styles.item}
                    onClick={() => commit(index())}
                    onPointerMove={() => setHighlight(index())}
                    onPointerDown={(e) => e.preventDefault()}
                  >
                    {item}
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Portal>
      </Show>
    </>
  );
};
