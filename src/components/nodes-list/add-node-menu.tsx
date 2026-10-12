import type { Component } from "solid-js";
import { nodeMenuEntries } from "~/lib/nodes";
import type { NodeType } from "~/types/enums";
import { UiSearchMenu } from "~/components/ui";
import { overridable } from "~/components/slot/overridable";
import { t } from "~/lib/i18n";

export interface AddNodeMenuProps {
  onAdd: (type: NodeType) => void;
}

/** The "+" that adds a node: opens a search list of the node registry and
 * focuses its field — type, Enter, done. */
const AddNodeMenu: Component<AddNodeMenuProps> = (props) => {
  // The list deals in displayed text and hands back what was picked; the
  // type is read from the very entry list the text was built from, whose
  // texts are unique by construction.
  const add = (text: string) => {
    const entry = nodeMenuEntries().find(
      (candidate) => candidate.text === text,
    );
    if (entry !== undefined) props.onAdd(entry.type);
  };

  return (
    <UiSearchMenu
      icon="plus"
      label={t("chrome.addNode")}
      placeholder={t("chrome.searchNode")}
      // formatted where it renders, never hoisted: a module-level list
      // would freeze the language the app started in
      items={nodeMenuEntries().map((entry) => entry.text)}
      onPick={add}
    />
  );
};

/** What the panels render: the menu above, or a plugin's replacement of it. */
export const AddNode = overridable("AddNodeMenu", AddNodeMenu);
