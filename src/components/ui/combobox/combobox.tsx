import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  omit,
  untrack,
  type Component,
} from "solid-js";
import { Portal } from "@solidjs/web";
import { Icon } from "../icon";
import styles from "./combobox.module.scss";
import { createDismissOnOutside } from "../create-dismiss-on-outside";
import { createMenuPosition, type MenuPlacement } from "../menu-position";
import { t } from "~/lib/i18n";

export interface UiComboboxProps {
  value: string;
  onChange: (value: string) => void;
  items: readonly string[];
  placeholder?: string;
  /** Accessible name for the input — use when the visible label lives outside. */
  ariaLabel?: string;
  id?: string;
  class?: string;
  placement?: MenuPlacement;
  /** When the option list opens. "focus" suits small fixed registries. */
  triggerMode?: "focus" | "input" | "manual";
  /** Enter with no highlighted option: submit the first match for the typed text. */
  onEnterMatch?: (value: string) => void;
}

/** Text input with a filtered dropdown of allowed values. Opening (focus,
 * click, chevron) shows the whole list; filtering starts with the first
 * keystroke. Focus stays in the input while the menu is open. */
export const UiCombobox: Component<UiComboboxProps> = (props) => {
  const rest = omit(
    props,
    "onChange",
    "value",
    "items",
    "placeholder",
    "ariaLabel",
    "id",
    "placement",
    "onEnterMatch",
    "triggerMode",
  );
  const [open, setOpen] = createSignal(false);
  const [edited, setEdited] = createSignal(false);
  const [highlight, setHighlight] = createSignal(-1);
  const [text, setText] = createSignal(untrack(() => props.value));
  const [focused, setFocused] = createSignal(false);
  const listId = `${createUniqueId()}-listbox`;
  let controlEl: HTMLDivElement | undefined;
  let contentEl: HTMLDivElement | undefined;
  let inputEl: HTMLInputElement | undefined;
  let listEl: HTMLUListElement | undefined;

  createDismissOnOutside(open, setOpen, () => [controlEl, contentEl]);
  createMenuPosition(
    open,
    () => controlEl,
    () => contentEl,
    () => props.placement ?? "bottom-start",
  );
  // an outside change (preset applied, option picked elsewhere) lands in the
  // field unless the user is editing it right now
  createEffect(
    () => [props.value, focused()] as const,
    ([value, isFocused]) => {
      if (!isFocused) setText(value);
    },
  );

  // options are the raw wire values (`slinear4`, `dpid_0.25`): the input
  // shows what the runner parses, as the original editor did, and typing
  // `lanczos` matches `lanczos`
  const visible = createMemo(() => {
    if (!edited()) return props.items;
    const query = text().toLowerCase();
    return props.items.filter((item) => item.toLowerCase().includes(query));
  });

  const scrollHighlight = () => {
    requestAnimationFrame(() => {
      listEl
        ?.querySelector("[data-highlighted]")
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const openMenu = (fromTop = true) => {
    if (props.items.length === 0) return;
    const list = visible();
    const selected = list.indexOf(props.value);
    setHighlight(selected >= 0 ? selected : fromTop ? 0 : list.length - 1);
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);
    setHighlight(-1);
  };

  const commitIndex = (index: number) => {
    const value = visible()[index];
    if (value === undefined) return;
    setText(value);
    closeMenu();
    props.onChange(value);
  };

  const submitMatch = () => {
    if (props.onEnterMatch === undefined) {
      closeMenu();
      return;
    }
    const typed = text().trim().toLowerCase();
    if (typed === "") return;
    const match = props.items.find((item) =>
      item.toLowerCase().includes(typed),
    );
    if (match === undefined) return;
    setText(match);
    closeMenu();
    props.onEnterMatch(match);
  };

  const onEnter = () => {
    const list = visible();
    const at = highlight();
    if (at >= 0 && at < list.length) commitIndex(at);
    else submitMatch();
  };

  const move = (delta: number) => {
    const count = visible().length;
    if (count === 0) return;
    // clamp, not wrap: wrapping teleports the highlight across the whole list
    setHighlight(Math.min(count - 1, Math.max(0, highlight() + delta)));
    scrollHighlight();
  };

  const mode = () => props.triggerMode ?? "focus";

  const onFocus = () => {
    setFocused(true);
    if (mode() !== "focus" || open()) return;
    // entering the field lists the whole registry; the typed text filters
    // only once the user starts editing
    setEdited(false);
    openMenu(true);
  };

  const onInputClick = () => {
    if (mode() !== "focus" || open()) return;
    setEdited(false);
    openMenu(true);
  };

  const onTextInput = (e: { currentTarget: HTMLInputElement }) => {
    setText(e.currentTarget.value);
    setEdited(true);
    if (mode() === "manual") return;
    if (!open()) {
      openMenu(true);
      return;
    }
    if (highlight() >= visible().length) setHighlight(0);
  };

  const onInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      closeMenu();
      setText(props.value);
      return;
    }
    if (e.key === "Escape") {
      closeMenu();
      setText(props.value);
      return;
    }
    if (e.key === "Enter") {
      if (!open()) return;
      e.preventDefault();
      onEnter();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open()) {
        if (mode() === "manual") return;
        setEdited(false);
        openMenu(e.key === "ArrowDown");
        return;
      }
      move(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (!open()) return;
    if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
      scrollHighlight();
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlight(visible().length - 1);
      scrollHighlight();
    }
  };

  const onBlur = () => {
    setFocused(false);
    // option picks preventDefault their pointerdown, so a blur is always a
    // genuine leave: discard the draft and show the committed value again
    if (!open()) return;
    closeMenu();
    setText(props.value);
  };

  const onTriggerClick = () => {
    inputEl?.focus();
    if (open()) {
      closeMenu();
      return;
    }
    setEdited(false);
    openMenu(true);
  };

  return (
    <div {...rest} class={[styles.combobox, props.class]}>
      <div ref={controlEl} class={styles.control}>
        <input
          ref={inputEl}
          id={props.id}
          role="combobox"
          aria-label={props.ariaLabel}
          aria-expanded={open() ? "true" : "false"}
          aria-controls={open() ? listId : undefined}
          aria-activedescendant={
            open() && highlight() >= 0 ? `${listId}-${highlight()}` : undefined
          }
          aria-autocomplete="list"
          autocomplete="off"
          autocorrect="off"
          spellcheck={false}
          class={styles.input}
          placeholder={props.placeholder ?? t("ui.select")}
          value={text()}
          onFocus={onFocus}
          onClick={onInputClick}
          onInput={onTextInput}
          onKeyDown={onInputKeyDown}
          onBlur={onBlur}
        />
        <button
          type="button"
          class={styles.trigger}
          aria-label={props.ariaLabel ?? t("ui.openOptions")}
          aria-expanded={open() ? "true" : "false"}
          onPointerDown={(e) => e.preventDefault()}
          onClick={onTriggerClick}
        >
          <Icon name="chevron-down" size={16} />
        </button>
      </div>
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
              <For each={visible()}>
                {(item, index) => (
                  <li
                    id={`${listId}-${index()}`}
                    role="option"
                    aria-selected={item === props.value ? "true" : "false"}
                    data-selected={item === props.value ? "" : undefined}
                    data-highlighted={index() === highlight() ? "" : undefined}
                    class={styles.item}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => commitIndex(index())}
                    onPointerMove={() => setHighlight(index())}
                  >
                    {item}
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
