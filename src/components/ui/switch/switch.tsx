import { omit, type Component } from "solid-js";
import { Switch } from "@kobalte/core/switch";
import styles from "./switch.module.scss";

export interface UiSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible text rendered next to the control by Kobalte (<Switch.Label>). */
  label?: string;
  /** Accessible name for the hidden input — use when the label is rendered outside. */
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
    <Switch
      class={[styles.switch, props.class]}
      checked={props.checked}
      onChange={props.onChange}
      {...rest}
    >
      <Switch.Input id={props.id} aria-label={props.ariaLabel} />
      <Switch.Control class={styles.track}>
        <Switch.Thumb class={styles.thumb} />
      </Switch.Control>
      {props.label && (
        <Switch.Label class={styles.label}>{props.label}</Switch.Label>
      )}
    </Switch>
  );
};
