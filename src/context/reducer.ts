import { type StoreSetter } from "solid-js";
import {
  type AnyAction,
  type NodesAction,
  NodesActionType,
} from "~/types/actions";
import { notifyObservers, storeActions } from "~/context/actions";
import { defaultOptions } from "~/lib/nodes";
import { sanitizeNode, sanitizeNodes } from "~/lib/node-shape";
import { pipeline } from "~/lib/pipeline/hooks";
import { withFreshUids } from "~/lib/uid";
import type { StackNode } from "~/types/node";

export type NodesSetter = StoreSetter<StackNode[]>;

const BUILTIN: ReadonlySet<string> = new Set(Object.values(NodesActionType));

/**
 * Store transitions — persistence is observed in `App`, not here.
 *
 * Every action takes the same road: the `store.action` hooks may rewrite or
 * refuse it, then it is applied (the editor's own by `processAction`, a
 * plugin's by the reducer it registered), then observers hear about it. An
 * action that throws while being applied — a plugin's reducer, a hook that
 * returned a malformed payload — is recorded and dropped; it must not take the
 * caller (an event handler, a microtask) down with it.
 */
export const createNodesDispatch = (setNodes: NodesSetter) => {
  return (action: AnyAction) => {
    const accepted = pipeline.filter("store.action", action);
    if (accepted === null) return;
    try {
      if (BUILTIN.has(accepted.type))
        processAction(setNodes, accepted as NodesAction);
      else {
        const reducer = storeActions.get(accepted.type);
        if (reducer === undefined) return;
        setNodes((state) => reducer(state, accepted.payload));
      }
    } catch (error) {
      pipeline.report("store.reducer", accepted.type, error);
      return;
    }
    notifyObservers(accepted);
  };
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
        const { uid: _uid, options, ext, ...rest } = payload;
        if (options !== undefined) Object.assign(state[index].options, options);
        // plugin data merges per plugin id, like options per key: one plugin
        // writing its slot must not wipe another's
        if (ext !== undefined) {
          state[index].ext ??= {};
          Object.assign(state[index].ext, ext);
        }
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
      const fresh = defaultOptions(payload.nodeType);
      if (fresh === undefined) break;
      setNodes((state) => {
        const index = state.findIndex((node) => node.uid === payload.uid);
        if (index === -1) return;
        // keyed index writes, not a replaced array: signals rc needs the
        // fine-grained path (see ADD above)
        state[index].type = payload.nodeType;
        state[index].options = fresh;
      });
      break;
    }

    case NodesActionType.NORMALIZE:
      setNodes((state) => {
        for (const node of state) {
          if (node.type !== payload) continue;
          // the same check any node of this type gets at the door; merged in
          // place for the reason CHANGE is (the card must not remount)
          const fresh = sanitizeNode({
            type: node.type,
            options: node.options,
          });
          if (fresh !== undefined) Object.assign(node.options, fresh.options);
        }
      });
      break;

    case NodesActionType.IMPORT: {
      // imports are the most untrusted input there is: presets, pasted configs
      // and legacy files all land here
      // a plugin may migrate what an import carries first (renamed types, old
      // option shapes); the built-in check still runs on whatever it returns
      const nodes = sanitizeNodes(pipeline.apply("import.sanitize", payload));
      if (nodes.length === 0) break;
      setNodes(() => withFreshUids(nodes));
      break;
    }

    default:
      break;
  }
};
