import { For, Show, type Component } from "solid-js";
import { render } from "~/lib/i18n";
import type { Diagnostic } from "~/lib/pipeline";
import styles from "./diagnostic-list.module.scss";

export interface DiagnosticListProps {
  items: readonly Diagnostic[];
  class?: string;
  /** Names the node a finding is about, for lists that span nodes. */
  nameOf?: (uid: string) => string | undefined;
}

/** The findings of the validator, errors first. Severity is carried by a
 * data attribute and by a text marker, never by colour alone. */
export const DiagnosticList: Component<DiagnosticListProps> = (props) => {
  const sorted = () =>
    [...props.items].sort(
      (a, b) => Number(b.severity === "error") - Number(a.severity === "error"),
    );
  return (
    <Show when={props.items.length > 0}>
      <ul class={[styles.list, props.class]} role="list">
        <For each={sorted()}>
          {(item) => (
            <li class={styles.item} data-severity={item.severity}>
              <span class={styles.mark} aria-hidden="true">
                {item.severity === "error" ? "✕" : "!"}
              </span>
              <span class={styles.text}>
                <Show when={item.uid !== undefined && props.nameOf?.(item.uid)}>
                  {(name) => <strong class={styles.node}>{name()}: </strong>}
                </Show>
                {render(item.message)}
              </span>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
};
