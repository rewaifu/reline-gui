import type { NodeOptions, StackNode } from "~/types/node";

export enum NodesActionType {
  ADD = "ADD",
  DELETE = "DELETE",
  CHANGE = "CHANGE",
  MOVE = "MOVE",
  IMPORT = "IMPORT",
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

export type NodesAction =
  | AddNodeActionType
  | DeleteNodeActionType
  | ChangeNodeActionType
  | MoveNodeActionType
  | ImportNodeActionType;
