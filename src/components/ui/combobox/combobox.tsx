import { omit, type Component, createEffect, createSignal } from "solid-js";
import { Combobox } from "@kobalte/core/combobox";
import { Icon } from "../icon";
import styles from "./combobox.module.scss";

export interface UiComboboxProps {
  value: string;
  onChange: (value: string) => void;
  items: readonly string[];
  placeholder?: string;
  /** Accessible name for the input — use when the visible label lives outside. */
  ariaLabel?: string;
  id?: string;
  class?: string;
  placement?: "bottom-start" | "top-start";
  /** When the option list opens. "focus" suits small fixed registries. */
  triggerMode?: "focus" | "input" | "manual";
  /** Enter with no highlighted option: submit the first match for the typed text. */
  onEnterMatch?: (value: string) => void;
}

/** Text input with a filtered dropdown of allowed values. */
export const UiCombobox: Component<UiComboboxProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  const rest = omit(
    props,
    "onChange",
    "value",
    "items",
    "placeholder",
    "ariaLabel",
    "id",
    "class",
    "placement",
    "onEnterMatch",
    "triggerMode"
  );
  let controlEl: HTMLDivElement | undefined;
  let contentEl: HTMLDivElement | undefined;
  let inputEl: HTMLInputElement | undefined;

  // The alpha's Input merges handler props in a way that drops onKeyDown,
  // so Enter-to-commit is attached natively through the ref instead.
  const onEnter = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !props.onEnterMatch || !open()) return;
    // Kobalte only commits a HIGHLIGHTED option on Enter and the alpha
    // never auto-highlights the first match — pick it ourselves.
    if (document.querySelector('[role="option"][data-highlighted]')) return;
    const typed = inputEl?.value.trim().toLowerCase();
    if (!typed) return;
    const match = props.items.find((i) => i.toLowerCase().includes(typed));
    if (!match) return;
    e.preventDefault();
    setOpen(false);
    props.onEnterMatch(match);
  };
  const refInput = (el: HTMLInputElement) => {
    inputEl = el;
    el.addEventListener("keydown", onEnter);
  };
  // Kobalte's dismissable layer does not close the listbox on outside
  // interaction under solid 2 rc — close it ourselves: any pointer down
  // that lands outside the input block and the portaled listbox.
  createEffect(
    () => open(),
    (isOpen) => {
      if (!isOpen) return;

      const onPointerDown = (e: PointerEvent) => {
        const target = e.target;
        if (
          target instanceof Node &&
          (controlEl?.contains(target) || contentEl?.contains(target))
        )
          return;
        setOpen(false);
      };
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };

      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown);
      };
    }
  );

  return (
    <Combobox
      class={[styles.combobox, props.class]}
      open={open()}
      onOpenChange={setOpen}
      value={props.value}
      onChange={(value) => value !== null && props.onChange(value)}
      triggerMode={props.triggerMode ?? "focus"}
      options={props.items as string[]}
      placeholder={props.placeholder ?? "Select…"}
      itemComponent={(item) => (
        <Combobox.Item item={item.item} class={styles.item}>
          {item.item.rawValue}
        </Combobox.Item>
      )}
      gutter={4}
      {...rest}
    >
      <Combobox.Control ref={controlEl} class={styles.control}>
        <Combobox.Input
          ref={refInput}
          id={props.id}
          aria-label={props.ariaLabel}
          class={styles.input}
        />
        <Combobox.Trigger
          class={styles.trigger}
          aria-label={props.ariaLabel ?? "Open options"}
        >
          <Icon name="chevron-down" size={16} />
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Portal>
        <Combobox.Content ref={contentEl} class={styles.content}>
          <Combobox.Listbox class={styles.listbox} />
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox>
  );
};
