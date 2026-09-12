import { omit, type Component } from "solid-js";
import { Switch } from "@rebase-ui/solid/switch";
import styles from "./switch.module.scss";

export interface UiSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible text rendered next to the control. */
  label?: string;
  /** Accessible name for the control — use when the label is rendered outside. */
  ariaLabel?: string;
  /** Set to link an external <label for> to this control. */
  id?: string;
  class?: string;
}

/** Toggle switch. */
export const UiSwitch: Component<UiSwitchProps> = (props) => {
  const rest = omit(
    props,
    "checked",
    "onChange",
    "label",
    "ariaLabel",
    "id",
    "class",
  );

  return (
    <span class={[styles.switch, props.class]}>
      <Switch.Root
        class={styles.track}
        checked={props.checked}
        onCheckedChange={(checked) => props.onChange(checked)}
        id={props.id}
        aria-label={props.ariaLabel}
        {...rest}
      >
        <Switch.Thumb class={styles.thumb} />
      </Switch.Root>
      {props.label && <span class={styles.label}>{props.label}</span>}
    </span>
  );
};
