import type { NodeOptions, StackNode } from "~/types/node";
import type { NodeType } from "~/types/enums";

export enum NodesActionType {
  ADD = "ADD",
  DELETE = "DELETE",
  CHANGE = "CHANGE",
  MOVE = "MOVE",
  IMPORT = "IMPORT",
  SWAP = "SWAP",
  /** Re-read the options of every node of a type through its (new) definition. */
  NORMALIZE = "NORMALIZE",
}
interface AddNodeActionType {
  type: NodesActionType.ADD;
  payload: StackNode;
}

interface DeleteNodeActionType {
  type: NodesActionType.DELETE;
  /** uid of the node to remove. */
  payload: string;
}

interface ChangeNodeActionType {
  type: NodesActionType.CHANGE;
  payload: { uid: string; options?: Partial<NodeOptions> } & Partial<
    Omit<StackNode, "options" | "uid">
  >;
}

interface MoveNodeActionType {
  type: NodesActionType.MOVE;
  payload: {
    from: number;
    to: number;
  };
}

interface ImportNodeActionType {
  type: NodesActionType.IMPORT;
  payload: StackNode[];
}

interface SwapNodeActionType {
  type: NodesActionType.SWAP;
  payload: { uid: string; nodeType: NodeType };
}

interface NormalizeNodesActionType {
  type: NodesActionType.NORMALIZE;
  /** The node type whose nodes are re-checked. */
  payload: string;
}

export type NodesAction =
  | AddNodeActionType
  | DeleteNodeActionType
  | ChangeNodeActionType
  | MoveNodeActionType
  | ImportNodeActionType
  | SwapNodeActionType
  | NormalizeNodesActionType;

/** An action a plugin defines (`storeActions.define`). Its `type` must not
 * collide with the editor's own, so plugins namespace theirs (`acme.sorter:sort`). */
export interface PluginAction {
  type: string;
  payload?: unknown;
}

/** Anything the store accepts: the editor's actions and plugins'. */
export type AnyAction = NodesAction | PluginAction;
