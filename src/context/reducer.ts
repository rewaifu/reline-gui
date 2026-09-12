import { type StoreSetter } from "solid-js";
import { type NodesAction, NodesActionType } from "~/types/actions";
import { DEFAULT_NODE_OPTIONS, OPTION_KEY } from "~/constants";
import { sanitizeNode, sanitizeNodes } from "~/lib/node-shape";
import { withFreshUids } from "~/lib/uid";
import type { StackNode } from "~/types/node";

export type NodesSetter = StoreSetter<StackNode[]>;

/** Pure store transitions — persistence is observed in `App`, not here. */
export const createNodesDispatch = (setNodes: NodesSetter) => {
  return (action: NodesAction) => processAction(setNodes, action);
};

const processAction = (setNodes: NodesSetter, action: NodesAction): void => {
  const { type, payload } = action;

  switch (type) {
    case NodesActionType.CHANGE: {
      setNodes((state) => {
        const index = state.findIndex((node) => node.uid === payload.uid);
        if (index === -1) return;
        // merge in place: assigning state[index] = payload would swap the item
        // reference, and <For> (keyed by reference) would remount the whole
        // card — every keystroke dropped input focus
        const { uid: _uid, options, ...rest } = payload;
        if (options !== undefined) Object.assign(state[index].options, options);
        Object.assign(state[index], rest);
      });
      break;
    }

    case NodesActionType.MOVE:
      setNodes((state) => {
        const next = Array.from(state);
        const [moved] = next.splice(payload.from, 1);
        if (!moved) return state;
        next.splice(payload.to, 0, moved);
        // survivors keep their object references: <For> moves the existing
        // DOM nodes instead of unmounting and remounting every row, and the
        // FLIP animation only has to tween positions, not rebuild cards
        return next;
      });
      break;

    case NodesActionType.ADD: {
      // Parsed even here: a pasted config reaches the store through this case,
      // and a node whose shape nothing checked throws later, during render.
      const node = sanitizeNode(payload);
      if (node === undefined) break;
      // under signals rc a replaced array does not notify — a keyed index
      // write does (same fine-grained path CHANGE uses)
      setNodes((state) => {
        state[state.length] = node;
      });
      break;
    }

    case NodesActionType.DELETE:
      // filter keeps every survivor's reference — no remounts, and nothing
      // needs reindexing: uid is the identity, position is the For accessor
      setNodes((state) => state.filter((node) => node.uid !== payload));
      break;

    case NodesActionType.SWAP: {
      // replace the type in place: uid, position and enabled stay, options
      // reset to the new type's defaults — mixing option bags across types
      // would leave fields the new form never reads
      const optionKey = OPTION_KEY[payload.nodeType];
      if (optionKey === undefined) break;
      setNodes((state) => {
        const index = state.findIndex((node) => node.uid === payload.uid);
        if (index === -1) return;
        // keyed index writes, not a replaced array: signals rc needs the
        // fine-grained path (see ADD above)
        state[index].type = payload.nodeType;
        state[index].options = structuredClone(DEFAULT_NODE_OPTIONS[optionKey]);
      });
      break;
    }

    case NodesActionType.IMPORT: {
      // imports are the most untrusted input there is: presets, pasted configs
      // and legacy files all land here
      const nodes = sanitizeNodes(payload);
      if (nodes.length === 0) break;
      setNodes(() => withFreshUids(nodes));
      break;
    }

    default:
      break;
  }
};
