import * as v from "valibot";
import { DEFAULT_COLLAPSED, DEFAULT_NODE_OPTIONS } from "~/constants";
import { newUid } from "~/lib/uid";
import type { NodeOptions, StackNode } from "~/types/node";
import { NodeType, ResizeType } from "~/types/enums";
import { RESIZE_MODE_PARAMS } from "~/types/options/resize";
import type { ResizeNodeOptions } from "~/types/options/resize";

/**
 * One place where node data from *outside* the app becomes node data inside it.
 *
 * The store is rendered directly: `FORMS[node.type]`, `NODE_DEFS[type].labelKey`
 * and every option read in a form run inside JSX or an effect, and Solid 2
 * halts the whole reactive system when one of those throws. A tree that came
 * from localStorage, a pasted config or a preset is not trusted data — an old
 * build's shape, a hand edit, a truncated write — so it is parsed here instead
 * of being discovered one property at a time at render time.
 *
 * The envelope is validated; `options` is only required to be an object and is
 * then merged over the type's defaults, so the fields a form reads always exist
 * while a newer config's extra keys survive untouched.
 */
const NodeEnvelope = v.object({
  uid: v.optional(v.string()),
  type: v.picklist(Object.values(NodeType)),
  // only the *type* of the options bag is checked here: a node whose options
  // are missing or unusable keeps its place in the tree with the defaults for
  // its type, which is what the forms can render. Rejecting the node instead
  // would silently delete half a user's pipeline.
  options: v.optional(v.unknown()),
  collapsed: v.optional(v.boolean()),
  name: v.optional(v.string()),
  enabled: v.optional(v.boolean()),
});

type RawNode = v.InferOutput<typeof NodeEnvelope>;

const defaultsFor = (type: NodeType): NodeOptions | undefined =>
  (DEFAULT_NODE_OPTIONS as Partial<Record<NodeType, NodeOptions>>)[type];

const toNode = (raw: RawNode): StackNode | undefined => {
  const defaults = defaultsFor(raw.type);
  if (defaults === undefined) return undefined;
  const stored = raw.options;
  const merged = {
    ...structuredClone(defaults),
    ...(typeof stored === "object" && stored !== null && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {}),
  } as NodeOptions;
  // Resize defaults carry `width` (the BY_WIDTH mode's value). A stored
  // BY_HEIGHT node persists without `width` (undefined is dropped by JSON),
  // so a plain merge resurrects the default width next to the height — and
  // the backend reads width+height as `absolute`. Drop the size params the
  // stored mode does not own right where outside data becomes a node.
  if (raw.type === NodeType.RESIZE) {
    const resize = merged as unknown as ResizeNodeOptions;
    const owned: Record<string, true> = {};
    for (const key of RESIZE_MODE_PARAMS[resize.resize_type as ResizeType] ??
      [])
      owned[key] = true;
    for (const key of ["width", "height", "percent"] as const)
      if (!owned[key]) delete resize[key];
  }
  const node: StackNode = {
    uid: raw.uid !== undefined && raw.uid.length > 0 ? raw.uid : newUid(),
    type: raw.type,
    options: merged,
    collapsed: raw.collapsed ?? DEFAULT_COLLAPSED,
  };
  if (raw.name !== undefined && raw.name.length > 0) node.name = raw.name;
  if (raw.enabled !== undefined) node.enabled = raw.enabled;
  return node;
};

/** One entry of an untrusted tree, or nothing when it cannot be a node. */
export const sanitizeNode = (value: unknown): StackNode | undefined => {
  const parsed = v.safeParse(NodeEnvelope, value);
  return parsed.success ? toNode(parsed.output) : undefined;
};

/** The same check for a whole tree, in order. Duplicate uids are kept: an
 * import is handed to `withFreshUids`, and dropping the second half of a
 * duplicated tree would lose nodes the user asked for. */
export const sanitizeNodes = (value: unknown): StackNode[] => {
  if (!Array.isArray(value)) return [];
  const nodes: StackNode[] = [];
  for (const item of value) {
    const node = sanitizeNode(item);
    if (node !== undefined) nodes.push(node);
  }
  return nodes;
};
