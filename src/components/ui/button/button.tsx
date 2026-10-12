import { omit, type Component } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import { Icon, type IconName } from "../icon";
import styles from "./button.module.scss";

export interface UiButtonProps extends ComponentProps<"button"> {
  /** `primary`: the accent border of the main action on a screen (Run). */
  variant?: "default" | "primary";
}

/** Text button. Always `type="button"` unless told otherwise: a button inside a
 * form that submits by accident is the more expensive mistake. */
export const UiButton: Component<UiButtonProps> = (props) => {
  const rest = omit(props, "class", "variant", "type");
  return (
    <button
      {...rest}
      type={props.type ?? "button"}
      class={[styles.button, props.class]}
      data-variant={props.variant === "primary" ? "primary" : undefined}
    />
  );
};

export interface UiIconButtonProps extends Omit<
  ComponentProps<"button">,
  "children" | "aria-label" | "title"
> {
  icon: IconName;
  /** Accessible name and tooltip — an icon alone says nothing to a screen reader. */
  label: string;
}

/** Square icon button, the size of the editor's own toolbar buttons. */
export const UiIconButton: Component<UiIconButtonProps> = (props) => {
  const rest = omit(props, "class", "icon", "label", "type");
  return (
    <button
      {...rest}
      type={props.type ?? "button"}
      class={[styles.icon, props.class]}
      aria-label={props.label}
      title={props.label}
    >
      <Icon name={props.icon} size={15} />
    </button>
  );
};
