import type { Component } from "solid-js";
import type * as v from "valibot";
import type { Locale, LocalText } from "~/lib/i18n";
import type { Diagnostic } from "~/lib/pipeline/types";
import type {
  NodeOptions,
  PureNode,
  PurePostprocessNodeOptions,
  StackNode,
} from "~/types/node";

/** What a legacy (flat, pre-preprocess) config needed rewritten. Empty for
 * a current config — the caller uses it to tell the user what changed. */
export interface LegacyMigration {
  /** model names a legacy inline `download` node asked for */
  downloads: string[];
  /** archives a legacy inline `unarchive` node referred to (`<dir>.zip`) */
  unarchives: string[];
  /** models rewritten from the legacy mounted path to the bare mdb name */
  models: { from: string; to: string }[];
}

/** Import context: what the helper sections of the config (preprocess,
 * postprocess, legacy inline helpers) said about the nodes being imported. */
export interface StackImportContext {
  /** Models downloaded by the preprocess section (name → mdb url, undefined
   * for legacy downloads that carry no link). */
  downloadedModels: ReadonlyMap<string, string | undefined>;
  unarchivedPaths: ReadonlySet<string>;
  cleanedPaths: ReadonlySet<string>;
  /** Writer output path → its psd_postprocess entry (paths are the stable
   * identity: uids are reminted on every import). */
  postprocessByParent: ReadonlyMap<string, PurePostprocessNodeOptions>;
  /** Every helper entry of the config by wire type, for nodes whose helpers
   * the built-in fields above do not cover (a plugin's own). */
  helpers: ReadonlyMap<string, readonly PureNode[]>;
  /** Model name → download link, from the loaded model database. */
  urlOf: (name: string) => string | undefined;
  /** Accumulates what a legacy config needed rewritten on import. */
  migration: LegacyMigration;
}

export interface StackImportOptions {
  /** Download link of a model name — legacy configs carry names only, the
   * link lives in the remote model database (see `model-db.ts`). */
  urlOf?: (name: string) => string | undefined;
  /** Called once when the input was a legacy config that got migrated. */
  onLegacy?: (migration: LegacyMigration) => void;
}

/** What a node may add next to itself while it serialises: helper entries of
 * the `preprocess` and `postprocess` sections. Record the owner in
 * `meta.parents` by uid. */
export interface ToPureContext {
  preprocess: PureNode[];
  postprocess: PureNode[];
}

export type ToPure = (node: StackNode, ctx: ToPureContext) => PureNode[];
export type FromPure = (pure: PureNode, ctx: StackImportContext) => NodeOptions;
/** Returns the options to change before a run, or nothing. */
export type PrepareRun = (node: StackNode) => Promise<NodeOptions | undefined>;

/**
 * Everything the app knows about one node type — the single place a type is
 * described. The editor, the config converters, the sanitiser and the menus all
 * read it from the registry (`~/lib/nodes`); there is no other table to keep in
 * step. Built-in nodes and plugin nodes are defined through the same call.
 */
export interface NodeDef {
  /** Id stored in the tree. Plugins namespace it (`acme.blur`). */
  type: string;
  /** Wire type when it differs from `type` (`screentone` is `halftone`). */
  pureType?: string;
  /** Name in the add menu and on the card. A dictionary key for built-ins,
   * `raw("…")` for a plugin. */
  label: LocalText;
  /** Options of a new node. A factory: every node needs its own fresh object. */
  defaults: () => NodeOptions;
  /** Checks the options bag. A field that fails is reset to its default when
   * outside data becomes a node, so a form never reads a value it cannot show. */
  schema?: v.GenericSchema;
  /** Fixes up a bag that already holds defaults merged with the stored values,
   * in place — shapes the schema cannot express (old stores, mode-owned keys). */
  normalize?: (options: NodeOptions) => void;
  /** The expanded card body. A node without one shows a placeholder. */
  Form?: Component<{ node: StackNode }>;
  /** Guide shown in the settings panel, per language. Built-ins keep theirs in
   * `src/instructions/<locale>/<type>.md`. */
  doc?: Partial<Record<Locale, string>>;
  /** Defaults to `{type: pureType ?? type, options: {...options}}`. */
  toPure?: ToPure;
  /** Defaults to a copy of the wire options. */
  fromPure?: FromPure;
  /** Findings about one node beyond what its schema says (a path that must
   * exist, two options that exclude each other). `uid` is filled in for you. */
  validate?: (node: StackNode) => readonly Omit<Diagnostic, "uid">[];
  /** Last chance to adjust the node before a run (resolve a name, …). */
  prepare?: PrepareRun;
}
