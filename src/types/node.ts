import * as v from "valibot";
import type { PurePostprocessNodeOptions } from "~/types/options/postprocess";
export type { PurePostprocessNodeOptions };

/**
 * The options bag of a node. Its shape belongs to the node's definition
 * (`NodeDef.schema`, see `~/lib/nodes`), not to this type: node types are an
 * open set — a plugin can register its own — so nothing here may enumerate
 * them. A form that knows its own type narrows with a cast to the options type
 * its schema infers (`FolderWriterNodeOptions`, …).
 */
export type NodeOptions = Record<string, unknown>;

/** The check for "is this an options bag" wherever outside data is read: a
 * plain object with string keys. A list is refused — `typeof` alone lets one
 * through, and spreading it would invent keys named `0`, `1`, … */
export const OptionsBagSchema = v.pipe(
  // checked before the record: `record` rebuilds a list as `{0: …}` and the
  // list would no longer look like one
  v.unknown(),
  v.check((value) => !Array.isArray(value), "options are not a list"),
  v.record(v.string(), v.unknown()),
);

/** The options bag out of untrusted data, or `undefined` when it is not one. */
export const asOptionsBag = (value: unknown): NodeOptions | undefined => {
  const parsed = v.safeParse(OptionsBagSchema, value);
  return parsed.success ? parsed.output : undefined;
};

/** Options of a serialised node: whatever the runner defines for that type. */
export type PureNodeOptions = Record<string, unknown>;

export type PurePostprocess = PureNode[];
export interface PureNode {
  /** Wire type. Open for the same reason as `StackNode.type`. */
  type: string;
  options: PureNodeOptions;
  /**
   * UI-only metadata carried in the shared config under `meta`, so it never
   * mixes with pipeline data. `name` and `parents` are ignored by the runner;
   * `disabled: true` is honoured — a switched-off node is not executed.
   */
  meta?: {
    name?: string;
    disabled?: boolean;
    parents?: string[];
    /** Plugin data of the node, by plugin id (`StackNode.ext`). */
    ext?: Record<string, unknown>;
  };
}

/** Serialized config shape: main pipeline, its preprocessors and postprocess. */
export interface PureConfig {
  nodes: PureNode[];
  preprocess: PureNode[];
  /** Absent in hand-written configs and legacy imports: treated as no postprocess. */
  postprocess?: PurePostprocess;
}

export interface StackNode {
  /**
   * Node type id — a key of the node registry. A plain string, not an enum:
   * the stored tree may name a type this build does not define (a plugin that
   * is switched off, a newer build). Such an *orphan* node keeps its place and
   * its options untouched, and serialises back as it came.
   */
  type: string;
  options: NodeOptions;
  /** UI-only display name, ignored by backend serialization */
  name?: string;
  collapsed: boolean;
  /**
   * The node's sole identity. Array position is NOT identity: `<For>` hands
   * rows their position via the index accessor, and MOVE/DELETE keep every
   * surviving node's object reference, so keyed rendering reuses the DOM.
   * Also the parent key preprocessors use to record ownership (`meta.parents`).
   */
  uid: string;
  enabled?: boolean;
  /**
   * Data plugins keep on a node, by plugin id (`ext["acme.tags"]`). It travels
   * with the node — storage, export (`meta.ext`), import — and survives while
   * the plugin that wrote it is off, like an orphan's options.
   */
  ext?: Record<string, unknown>;
}
