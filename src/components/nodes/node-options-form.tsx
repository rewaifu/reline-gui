import { type Accessor, type Component, Errored, Show } from "solid-js";
import { Dynamic } from "@solidjs/web";
import type { StackNode } from "~/types/node";
import { nodeRegistry } from "~/lib/nodes";
import { pipeline } from "~/lib/pipeline/hooks";
import { t } from "~/lib/i18n";
import "~/nodes/builtin-ui";
import styles from "./forms/forms.module.scss";

export interface NodeFormProps {
  /** The row's node object, handed down from <For> via NodeCard. */
  node: StackNode;
}

/** The body of an expanded card: the form its type's definition carries. An
 * orphan node (its type is not defined — a plugin that is off) and a type
 * without a form get a note instead; the options stay in the tree untouched. */
export const NodeOptionsForm: Component<NodeFormProps> = (props) => {
  const form = () => nodeRegistry.get(props.node.type)?.Form;
  return (
    <Show
      when={form()}
      fallback={
        <p class={styles.orphan}>
          {t(
            nodeRegistry.get(props.node.type) === undefined
              ? "form.orphan"
              : "form.noForm",
            { type: props.node.type },
          )}
        </p>
      }
    >
      {(Form) => (
        // a node type's form may come from a plugin: a render error costs this
        // card its body, not the stack
        <Errored
          fallback={(error: Accessor<unknown>) => {
            pipeline.report("ui", `form:${props.node.type}`, error());
            return <p class={styles.orphan}>{t("form.broken")}</p>;
          }}
        >
          <Dynamic component={Form()} node={props.node} />
        </Errored>
      )}
    </Show>
  );
};
