import { useContext } from "solid-js";
import { NodesContext, NodesDispatchContext } from "~/context/contexts";
import { NODE_DEFS } from "~/components/nodes/registry";
import { NodesActionType } from "~/types/actions";
import type { StackNode } from "~/types/node";
import { newUid } from "~/lib/uid";

/**
 * Appends a node of the given type label to the stack and selects it.
 * Shared by the left panel and the phone stack panel: a phone hides the node
 * list, so the stack itself has to be able to grow.
 */
export const useAddNode = (onSelect: (uid: string) => void) => {
  const dispatch = useContext(NodesDispatchContext);
  return (label: string) => {
    const def = Object.values(NODE_DEFS).find((d) => d.label === label);
    if (!def) return;
    const node: StackNode = {
      uid: newUid(),
      type: def.type,
      options: structuredClone(def.defaults),
      collapsed: false,
    };
    dispatch({ type: NodesActionType.ADD, payload: node });
    onSelect(node.uid);
  };
};

/**
 * Enables or disables a node. Reachable from the node list and from the node
 * card — both must refuse to disable the last enabled node, or the pipeline
 * would have nothing left to run.
 */
export const useToggleEnabled = () => {
  const nodes = useContext(NodesContext);
  const dispatch = useContext(NodesDispatchContext);
  return (node: StackNode, enabled: boolean) => {
    if (
      !enabled &&
      nodes.filter((n) => n.enabled !== false && n.uid !== node.uid).length ===
        0
    )
      return;
    dispatch({
      type: NodesActionType.CHANGE,
      payload: { uid: node.uid, enabled },
    });
  };
};
