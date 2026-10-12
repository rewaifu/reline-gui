import {
  For,
  Show,
  createMemo,
  createSignal,
  createUniqueId,
  type Component,
} from "solid-js";
import { Portal } from "@solidjs/web";
import { t } from "~/lib/i18n";
import { UiIconButton } from "../button/button";
import { createDismissOnOutside } from "../create-dismiss-on-outside";
import type { IconName } from "../icon";
import { createMenuPosition, type MenuPlacement } from "../menu-position";
import styles from "./search-menu.module.scss";

export interface UiSearchMenuProps {
  /** What the list offers, as the text shown and searched. */
  items: readonly string[];
  onPick: (item: string) => void;
  /** The button's icon. */
  icon: IconName;
  /** The button's name and tooltip, and the search field's accessible name. */
  label: string;
  placeholder?: string;
  placement?: MenuPlacement;
  class?: string;
}

/**
 * An icon button that opens a searchable list. Opening moves focus straight
 * into the search field, so the whole interaction is: click, type, Enter. The
 * list is an action menu, not a field: it has no selected value, and a pick
 * closes it and hands the item back.
 */
export const UiSearchMenu: Component<UiSearchMenuProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [highlight, setHighlight] = createSignal(0);
  const listId = `${createUniqueId()}-listbox`;
  let triggerEl: HTMLButtonElement | undefined;
  let contentEl: HTMLDivElement | undefined;
  let inputEl: HTMLInputElement | undefined;
  let listEl: HTMLUListElement | undefined;

  createDismissOnOutside(open, setOpen, () => [triggerEl, contentEl]);
  createMenuPosition(
    open,
    () => triggerEl,
    () => contentEl,
    () => props.placement ?? "bottom-end",
    4,
    () => inputEl?.focus(),
  );

  const visible = createMemo(() => {
    const words = query().toLowerCase().split(/\s+/).filter(Boolean);
    return props.items.filter((item) => {
      const text = item.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  });

  const scrollHighlight = () => {
    requestAnimationFrame(() => {
      listEl
        ?.querySelector("[data-highlighted]")
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerEl?.focus();
  };

  const toggle = () => {
    if (open()) {
      close(false);
      return;
    }
    setQuery("");
    setHighlight(0);
    setOpen(true);
  };

  const pick = (index: number) => {
    const item = visible()[index];
    if (item === undefined) return;
    close(true);
    props.onPick(item);
  };

  const move = (to: number) => {
    const count = visible().length;
    if (count === 0) return;
    // clamp, not wrap: wrapping teleports the highlight across the whole list
    setHighlight(Math.min(count - 1, Math.max(0, to)));
    scrollHighlight();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        pick(highlight());
        break;
      case "ArrowDown":
        e.preventDefault();
        move(highlight() + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(highlight() - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(visible().length - 1);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  return (
    <>
      <UiIconButton
        ref={triggerEl}
        class={props.class}
        icon={props.icon}
        label={props.label}
        aria-haspopup="listbox"
        aria-expanded={open() ? "true" : "false"}
        aria-controls={open() ? listId : undefined}
        onClick={toggle}
      />
      <Show when={open()}>
        <Portal>
          <div
            ref={contentEl}
            class={styles.content}
            style={{ position: "fixed", left: "0px", top: "0px" }}
          >
            <input
              ref={inputEl}
              type="text"
              role="combobox"
              class={styles.search}
              aria-label={props.label}
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={
                visible().length > 0 ? `${listId}-${highlight()}` : undefined
              }
              aria-autocomplete="list"
              autocomplete="off"
              autocorrect="off"
              spellcheck={false}
              placeholder={props.placeholder ?? props.label}
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
            />
            <Show
              when={visible().length > 0}
              fallback={<p class={styles.empty}>{t("ui.noMatches")}</p>}
            >
              <ul
                ref={listEl}
                id={listId}
                role="listbox"
                class={styles.listbox}
                aria-label={props.label}
              >
                <For each={visible()}>
                  {(item, index) => (
                    <li
                      id={`${listId}-${index()}`}
                      role="option"
                      aria-selected="false"
                      data-highlighted={
                        index() === highlight() ? "" : undefined
                      }
                      class={styles.item}
                      // keeps focus in the search field through a click
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => pick(index())}
                      onPointerMove={() => setHighlight(index())}
                    >
                      {item}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </Portal>
      </Show>
    </>
  );
};
