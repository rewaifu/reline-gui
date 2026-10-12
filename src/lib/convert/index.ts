import * as v from "valibot";
import { PureNodeType } from "~/types/enums";
import {
  asOptionsBag,
  type NodeOptions,
  type PureConfig,
  type PureNode,
  type PurePostprocessNodeOptions,
  type StackNode,
} from "~/types/node";
import { psdPostprocessOptionsSchema } from "~/types/options/postprocess";
import { nodeRegistry } from "~/lib/nodes";
import { pipeline } from "~/lib/pipeline/hooks";
import type {
  LegacyMigration,
  StackImportContext,
  StackImportOptions,
} from "~/lib/nodes/types";
import { DEFAULT_COLLAPSED } from "~/constants";
import { ensureUids } from "~/lib/uid";
import { modelKey } from "~/lib/convert/model-name";

export type { LegacyMigration, StackImportContext, StackImportOptions };

/** A node that could not be serialised. The node still goes out — as it is, so
 * copying the config never drops it — and the caller decides what to tell the
 * user (the run refuses to start on one). */
export interface ConvertIssue {
  uid: string;
  type: string;
  message: string;
}

/** Wire types of the helper sections. They dissolve into flags of the node
 * that owns them on import and never become stack nodes of their own. */
const DISSOLVED: ReadonlySet<string> = new Set([
  PureNodeType.DOWNLOAD,
  PureNodeType.UNARCHIVE,
  PureNodeType.CLEANDIR,
]);

/** What a node with no converter of its own serialises to, and what a node
 * whose converter threw falls back to: its options, untouched. */
const passthrough = (node: StackNode): PureNode => ({
  type: nodeRegistry.get(node.type)?.pureType ?? node.type,
  options: { ...node.options },
});

/**
 * Stack → wire config. Without `onIssue` a node that cannot be serialised
 * throws (tests, strict callers); with it the failure is reported and the node
 * is written through unchanged, so this never throws for node data and is safe
 * inside a memo — an exception there halts Solid's whole reactive system.
 */
export const convertToPure = (
  nodes: readonly StackNode[],
  onIssue?: (issue: ConvertIssue) => void,
): PureConfig => {
  const config: PureNode[] = [];
  const preprocess: PureNode[] = [];
  const postprocess: PureNode[] = [];
  for (const node of nodes) {
    // helper entries a node adds are kept aside until it converted cleanly:
    // a half-serialised node must not leave orphaned helpers behind
    const own = { preprocess: [] as PureNode[], postprocess: [] as PureNode[] };
    let converted: PureNode[];
    try {
      const def = nodeRegistry.get(node.type);
      converted = def?.toPure ? def.toPure(node, own) : [passthrough(node)];
    } catch (error) {
      if (onIssue === undefined) throw error;
      onIssue({
        uid: node.uid,
        type: node.type,
        message: error instanceof Error ? error.message : String(error),
      });
      converted = [passthrough(node)];
      own.preprocess.length = 0;
      own.postprocess.length = 0;
    }
    // a plugin may reshape what this node produced (the failed node's
    // passthrough included — it is still what goes out)
    converted = pipeline.apply("toPure.node", converted, node);
    // keep UI-only state on the head pure node of the group (API ignores it)
    if (converted[0]) {
      const meta: PureNode["meta"] = {};
      if (node.name) meta.name = node.name;
      if (node.enabled === false) meta.disabled = true;
      if (node.ext !== undefined && Object.keys(node.ext).length > 0)
        meta.ext = { ...node.ext };
      if (meta.name !== undefined || meta.disabled || meta.ext !== undefined)
        converted[0].meta = meta;
    }
    config.push(...converted);
    preprocess.push(...own.preprocess);
    postprocess.push(...own.postprocess);
  }
  return pipeline.apply(
    "toPure.config",
    { nodes: config, preprocess: dedupeDownloads(preprocess), postprocess },
    nodes,
  );
};

/** `convertToPure` that reports instead of throwing. */
export const exportConfig = (
  nodes: readonly StackNode[],
): { config: PureConfig; issues: ConvertIssue[] } => {
  const issues: ConvertIssue[] = [];
  const config = convertToPure(nodes, (issue) => issues.push(issue));
  return { config, issues };
};

/**
 * Preprocessors are shared: several parents referencing the same download
 * (by model name) collapse into one node, their owner uids merged in meta.
 */
const dedupeDownloads = (preprocess: PureNode[]): PureNode[] => {
  const byName = new Map<string, PureNode>();
  const rest: PureNode[] = [];
  for (const node of preprocess) {
    const name = node.options.name;
    if (node.type !== PureNodeType.DOWNLOAD || typeof name !== "string") {
      rest.push(node);
      continue;
    }
    const existing = byName.get(name);
    if (!existing) {
      byName.set(name, node);
      continue;
    }
    // merge owners: both parents reference this single preprocessor
    const parents = new Set([
      ...(existing.meta?.parents ?? []),
      ...(node.meta?.parents ?? []),
    ]);
    existing.meta = { ...existing.meta, parents: [...parents] };
  }
  return [...byName.values(), ...rest];
};

/** Preprocessors are UI-implicit: on import they dissolve back into flags.
 * A legacy flat config keeps them inline in the pipeline, so both lists feed
 * the same context — and the inline ones are exactly what got migrated. */
const importContext = (
  nodes: readonly PureNode[],
  preprocess: readonly PureNode[] | undefined,
  postprocess: readonly PureNode[] | undefined,
  options: StackImportOptions,
): StackImportContext => {
  const downloadedModels = new Map<string, string | undefined>();
  const unarchivedPaths = new Set<string>();
  const cleanedPaths = new Set<string>();
  const postprocessByParent = new Map<string, PurePostprocessNodeOptions>();
  const helpers = new Map<string, PureNode[]>();
  const migration: LegacyMigration = {
    downloads: [],
    unarchives: [],
    models: [],
  };
  const urlOf = options.urlOf ?? ((): undefined => undefined);
  const noteHelper = (node: PureNode): void => {
    const list = helpers.get(node.type) ?? [];
    list.push(node);
    helpers.set(node.type, list);
  };
  const absorb = (list: readonly PureNode[], legacy: boolean): void => {
    for (const node of list) {
      const { name, url, path } = node.options;
      if (node.type === PureNodeType.DOWNLOAD && typeof name === "string") {
        const key = modelKey(name);
        // a legacy entry has no link of its own: it comes from the database
        downloadedModels.set(key, typeof url === "string" ? url : urlOf(key));
        if (legacy) migration.downloads.push(key);
      } else if (
        node.type === PureNodeType.UNARCHIVE &&
        typeof path === "string"
      ) {
        // strip the ".zip" the reader appended on export; legacy entries
        // point at the directory the archive unpacks into
        const dir = path.replace(/\.zip$/, "");
        unarchivedPaths.add(dir);
        if (legacy) migration.unarchives.push(`${dir}.zip`);
      } else if (
        node.type === PureNodeType.CLEANDIR &&
        typeof path === "string"
      ) {
        cleanedPaths.add(path);
      }
    }
  };
  const absorbPost = (list: readonly PureNode[]): void => {
    for (const node of list) {
      if (node.type !== PureNodeType.PSD_POSTPROCESS) continue;
      const parsed = v.safeParse(psdPostprocessOptionsSchema, node.options);
      if (!parsed.success) continue;
      // keyed by the writer's own output path (== the entry's `path`): uids
      // are reminted on every import, paths are the stable identity here
      postprocessByParent.set(parsed.output.path, parsed.output);
      for (const parent of node.meta?.parents ?? [])
        postprocessByParent.set(parent, parsed.output);
    }
  };
  absorb(preprocess ?? [], false);
  absorb(nodes, true);
  absorbPost(postprocess ?? []);
  // a plugin's helpers are read back by wire type; the built-ins above are
  // already folded into the maps
  for (const node of preprocess ?? []) noteHelper(node);
  for (const node of postprocess ?? []) noteHelper(node);
  return {
    downloadedModels,
    unarchivedPaths,
    cleanedPaths,
    postprocessByParent,
    helpers,
    urlOf,
    migration,
  };
};

const convertPureList = (
  nodes: PureNode[],
  ctx: StackImportContext,
): StackNode[] => {
  const result: Omit<StackNode, "uid">[] = [];
  for (const pure of nodes) {
    // preprocess nodes dissolve into parent flags, they never become stack nodes
    if (DISSOLVED.has(pure.type)) continue;
    const def = nodeRegistry.byPureType(pure.type);
    // a wire type no definition claims is kept as an orphan node carrying its
    // options verbatim: dropping it would silently delete part of the pipeline
    const type = def?.type ?? pure.type;
    const options: NodeOptions = def?.fromPure
      ? def.fromPure(pure, ctx)
      : { ...asOptionsBag(pure.options) };
    const node: Omit<StackNode, "uid"> = {
      type,
      options,
      collapsed: DEFAULT_COLLAPSED,
    };
    if (pure.meta?.name) node.name = pure.meta.name;
    if (pure.meta?.disabled) node.enabled = false;
    const ext = asOptionsBag(pure.meta?.ext);
    if (ext !== undefined && Object.keys(ext).length > 0) node.ext = { ...ext };
    result.push(node);
  }
  // converters emit bare nodes — identity is minted here, once per import;
  // the draft's only gap vs StackNode is the uid ensureUids assigns below
  return ensureUids(result as StackNode[]);
};

export const convertToStack = (
  pure: PureConfig | PureNode[],
  options: StackImportOptions = {},
): StackNode[] => {
  // a top-level array is the pre-preprocess format: its download/unarchive
  // nodes live in the pipeline instead of a `preprocess` section
  const legacy = Array.isArray(pure);
  const nodes = legacy ? pure : (pure.nodes ?? []);
  const ctx = importContext(
    nodes,
    legacy ? undefined : pure.preprocess,
    legacy ? undefined : (pure.postprocess ?? []),
    options,
  );
  const result = convertPureList(nodes, ctx);
  const { migration } = ctx;
  const migrated =
    migration.downloads.length > 0 ||
    migration.unarchives.length > 0 ||
    migration.models.length > 0;
  if (migrated) options.onLegacy?.(migration);
  return result;
};
