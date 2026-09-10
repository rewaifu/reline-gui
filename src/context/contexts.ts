import { createContext } from "solid-js";
import type { Store } from "solid-js";
import type { StackNode } from "~/types/node";
import type { NodesAction } from "~/types/actions";

export type NodesStore = Store<StackNode[]>;
export type NodesDispatch = (action: NodesAction) => void;

// Default-less contexts: reading them without a Provider is a bug, not a
// maybe. Solid 2 makes the type non-nullable and `useContext` throws
// `ContextNotFoundError` on its own — no wrapper hooks, no null checks.
export const NodesContext = createContext<NodesStore>();
export const NodesDispatchContext = createContext<NodesDispatch>();
