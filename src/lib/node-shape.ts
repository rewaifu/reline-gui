import * as v from "valibot";
import { DEFAULT_COLLAPSED } from "~/constants";
import { newUid } from "~/lib/uid";
import { nodeRegistry } from "~/lib/nodes";
import type { NodeDef } from "~/lib/nodes";
import { asOptionsBag, type NodeOptions, type StackNode } from "~/types/node";

/**
 * One place where node data from *outside* the app becomes node data inside it.
 *
 * The store is rendered directly: the form of `nodeRegistry.get(node.type)`,
 * the node's label and every option read in a form run inside JSX or an effect,
 * and Solid 2 halts the whole reactive system when one of those throws. A tree
 * that came from localStorage, a pasted config or a preset is not trusted data —
 * an old build's shape, a hand edit, a truncated write — so it is parsed here
 * instead of being discovered one property at a time at render time.
 *
 * The envelope is validated; `options` is merged over the type's defaults and
 * checked against the type's schema field by field — a value that fails falls
 * back to its default, so the fields a form reads always exist and always hold
 * something it can show, while a newer config's extra keys survive untouched.
 *
 * A type with no definition is not rejected: the node is kept as an *orphan*
 * with its options exactly as they came. Dropping it would silently delete part
 * of a pipeline whose plugin happens to be off right now.
 */
const NodeEnvelope = v.object({
  uid: v.optional(v.string()),
  type: v.pipe(v.string(), v.minLength(1)),
  // only the *type* of the options bag is checked here: a node whose options
  // are missing or unusable keeps its place in the tree with the defaults for
  // its type, which is what the forms can render. Rejecting the node instead
  // would silently delete half a user's pipeline.
  options: v.optional(v.unknown()),
  collapsed: v.optional(v.boolean()),
  name: v.optional(v.string()),
  enabled: v.optional(v.boolean()),
  // plugin data: only "is it a bag" is checked — its shape is the plugin's
  ext: v.optional(v.unknown()),
});

type RawNode = v.InferOutput<typeof NodeEnvelope>;

/** Resets every field the schema rejects to the type's default (or removes it
 * when the type has none), until the bag validates. Bounded: a failure that is
 * not about a field falls back to the defaults wholesale, and a field whose
 * default fails too is left as it is — the validator reports it, and the user's
 * other values are not thrown away over one bad one. */
const repairOptions = (def: NodeDef, options: NodeOptions): NodeOptions => {
  if (def.schema === undefined) return options;
  const defaults = def.defaults();
  for (let pass = 0; pass < 4; pass++) {
    const result = v.safeParse(def.schema, options);
    if (result.success) return options;
    const fields = new Set<string>();
    for (const issue of result.issues) {
      const key = issue.path?.[0]?.key;
      if (typeof key === "string") fields.add(key);
    }
    if (fields.size === 0) return defaults;
    for (const key of fields) {
      if (key in defaults) options[key] = defaults[key];
      else delete options[key];
    }
  }
  return options;
};

const toNode = (raw: RawNode): StackNode => {
  const def = nodeRegistry.get(raw.type);
  const stored = asOptionsBag(raw.options) ?? {};
  let options: NodeOptions;
  if (def === undefined) {
    options = { ...stored };
  } else {
    options = { ...def.defaults(), ...stored };
    def.normalize?.(options);
    options = repairOptions(def, options);
  }
  const node: StackNode = {
    uid: raw.uid !== undefined && raw.uid.length > 0 ? raw.uid : newUid(),
    type: raw.type,
    options,
    collapsed: raw.collapsed ?? DEFAULT_COLLAPSED,
  };
  if (raw.name !== undefined && raw.name.length > 0) node.name = raw.name;
  if (raw.enabled !== undefined) node.enabled = raw.enabled;
  const ext = asOptionsBag(raw.ext);
  if (ext !== undefined && Object.keys(ext).length > 0) node.ext = { ...ext };
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
