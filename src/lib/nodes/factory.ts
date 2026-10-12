import { DEFAULT_COLLAPSED } from "~/constants";
import { NodeType } from "~/types/enums";
import type { NodeOptions, StackNode } from "~/types/node";
import { newUid } from "~/lib/uid";
import { nodeRegistry } from "./registry";

/** A fresh copy of a type's starting options, or `undefined` for a type with
 * no definition. Never shared: a user edit must not reach the next node. */
export const defaultOptions = (type: string): NodeOptions | undefined =>
  nodeRegistry.get(type)?.defaults();

/** A new node of `type` with default options and its own uid. */
export const createNode = (
  type: string,
  collapsed: boolean = DEFAULT_COLLAPSED,
): StackNode | undefined => {
  const options = defaultOptions(type);
  return options === undefined
    ? undefined
    : { uid: newUid(), type, options, collapsed };
};

/** The pipeline a fresh session starts with: read → upscale → … → write. */
const STARTER_TYPES = [
  NodeType.FOLDER_READER,
  NodeType.UPSCALE,
  NodeType.SHARP,
  NodeType.SCREENTONE,
  NodeType.RESIZE,
  NodeType.LEVEL,
  NodeType.FOLDER_WRITER,
];

/** One node per starter type with pristine options. A factory, not a constant:
 * every node needs its own fresh option object and uid. */
export const createDefaultNodes = (): StackNode[] =>
  STARTER_TYPES.flatMap((type) => createNode(type) ?? []);
