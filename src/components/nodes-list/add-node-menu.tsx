import type { Component } from "solid-js";
import { NODE_DEFS, NODE_ORDER } from "~/components/nodes/registry";
import { UiCombobox } from "~/components/ui";
import styles from "./nodes-list.module.scss";

export interface AddNodeMenuProps {
  onAdd: (label: string) => void;
}

// static by construction: the registry never changes at runtime, and a plain
// array (not a memo) keeps Kobalte's component body from reading a signal
// where it cannot track one
const ITEM_LABELS: readonly string[] = NODE_ORDER.map(
  (type) => NODE_DEFS[type].label,
);

/** Searchable add-node field: type to filter the node registry, Enter or
 * click adds the highlighted node. */
export const AddNodeMenu: Component<AddNodeMenuProps> = (props) => {
  return (
    <div class={styles.addNode}>
      <UiCombobox
        class={styles.addCombo}
        value=""
        placeholder="Добавить ноду"
        ariaLabel="Добавить ноду"
        items={ITEM_LABELS}
        placement="top-start"
        onChange={(label) => ITEM_LABELS.includes(label) && props.onAdd(label)}
        onEnterMatch={(label) => props.onAdd(label)}
      />
    </div>
  );
};
