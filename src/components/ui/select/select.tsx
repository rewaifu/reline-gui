import { omit, type Component, createSignal } from "solid-js";
import { Select } from "@kobalte/core/select";
import { Icon } from "../icon";
import styles from "./select.module.scss";
import { createDismissOnOutside } from "../create-dismiss-on-outside";
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
}

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
  );
  const [open, setOpen] = createSignal(false);
  let rootEl: HTMLDivElement | undefined;
  let contentEl: HTMLDivElement | undefined;

  createDismissOnOutside(open, setOpen, () => [rootEl, contentEl]);

  return (
    <Select
      open={open()}
      onOpenChange={setOpen}
      value={props.value}
      onChange={(value) => value !== null && props.onChange(value)}
      options={props.items as string[]}
      placeholder={props.placeholder ?? t("ui.select")}
      // options are the raw wire values (`no_tiling`, `slinear4`): the same
      // strings the runner parses, as the original editor showed them, so the
      // list never mixes a translated word with a library name
      itemComponent={(item) => (
        <Select.Item item={item.item} class={styles.item}>
          {item.item.rawValue}
        </Select.Item>
      )}
      gutter={4}
      placement="bottom-start"
      {...rest}
    >
      <div ref={rootEl} style={{ display: "contents" }}>
        <Select.Trigger
          id={props.id}
          class={[styles.trigger, props.class]}
          aria-label={props.ariaLabel}
        >
          <Select.Value class={styles.value}>
            {(state) => {
              // items are strings (UiSelectProps.items: readonly string[]),
              // but Kobalte types the selected option as unknown
              const selected = state.selectedOption() as string | undefined;
              return selected ?? props.placeholder ?? "";
            }}
          </Select.Value>
          <Select.Icon class={styles.icon} aria-hidden="true">
            <Icon name="chevron-down" size={14} />
          </Select.Icon>
        </Select.Trigger>
      </div>
      <Select.Portal>
        <Select.Content ref={contentEl} class={styles.content}>
          <Select.Listbox class={styles.listbox} />
        </Select.Content>
      </Select.Portal>
    </Select>
  );
};
