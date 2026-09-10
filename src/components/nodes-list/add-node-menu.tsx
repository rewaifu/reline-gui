import type { Component } from "solid-js";
import { NODE_ORDER, nodeLabel } from "~/components/nodes/registry";
import type { NodeType } from "~/types/enums";
import { UiCombobox } from "~/components/ui";
import { t } from "~/lib/i18n";
import styles from "./nodes-list.module.scss";

export interface AddNodeMenuProps {
  onAdd: (type: NodeType) => void;
}

/** Searchable add-node field: type to filter the node registry, Enter or
 * click adds the highlighted node. */
export const AddNodeMenu: Component<AddNodeMenuProps> = (props) => {
  // The field deals in displayed text and hands back what was picked; the
  // wire type comes from the same registry order the labels were built off.
  const add = (label: string) => {
    const type = NODE_ORDER.find((candidate) => nodeLabel(candidate) === label);
    if (type !== undefined) props.onAdd(type);
  };

  return (
    <div class={styles.addNode}>
      <UiCombobox
        class={styles.addCombo}
        value=""
        placeholder={t("chrome.addNode")}
        ariaLabel={t("chrome.addNode")}
        // formatted where it renders, never hoisted: a module-level list
        // would freeze the language the app started in
        items={NODE_ORDER.map(nodeLabel)}
        placement="top-start"
        onChange={add}
        onEnterMatch={add}
      />
    </div>
  );
};
