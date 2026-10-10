import * as v from "valibot";
import { NodeType, PureNodeType } from "~/types/enums";
import type {
  NodeOptions,
  PureConfig,
  PureNode,
  PureNodeOptions,
  PurePostprocessNodeOptions,
  StackNode,
} from "~/types/node";
import { psdPostprocessOptionsSchema } from "~/types/options/postprocess";

import {
  convertHalftoneToStack,
  convertScreentoneToPure,
} from "~/lib/convert/halftone";
import {
  convertResizeToPure,
  convertResizeToStack,
} from "~/lib/convert/resize";
import {
  convertUpscaleToPure,
  convertUpscaleToStack,
} from "~/lib/convert/upscale";
import { DEFAULT_COLLAPSED } from "~/constants";
import { ensureUids } from "~/lib/uid";
import { modelKey } from "~/lib/convert/model-name";
import {
  convertFolderReaderToPure,
  convertFolderReaderToStack,
} from "~/lib/convert/folder-reader";
import {
  convertFolderWriterToPure,
  convertFolderWriterToStack,
} from "~/lib/convert/folder-writer";

export type ConvertToPureFunction = (
  nodes: StackNode[],
  index: number,
  preprocess: PureNode[],
  postprocess: PureNode[],
) => [PureNode[], number];

/** Import context: models downloaded by the preprocess section (name →
 * mdb url, undefined for legacy downloads that carry no link). */
export interface StackImportContext {
  downloadedModels: ReadonlyMap<string, string | undefined>;
  unarchivedPaths: ReadonlySet<string>;
  cleanedPaths: ReadonlySet<string>;
  /** Writer output path → its psd_postprocess entry (paths are the stable
   * identity: uids are reminted on every import). */
  postprocessByParent: ReadonlyMap<string, PurePostprocessNodeOptions>;
  /** Model name → download link, from the loaded model database. */
  urlOf: (name: string) => string | undefined;
  /** Accumulates what a legacy config needed rewritten on import. */
  migration: LegacyMigration;
}

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

export interface StackImportOptions {
  /** Download link of a model name — legacy configs carry names only, the
   * link lives in the remote model database (see `model-db.ts`). */
  urlOf?: (name: string) => string | undefined;
  /** Called once when the input was a legacy config that got migrated. */
  onLegacy?: (migration: LegacyMigration) => void;
}
/** A node as the converters build it — uid is not yet minted; identity is
 * assigned once per import in `convertPureList`. */
type StackNodeDraft = Omit<StackNode, "uid">;

export type ConvertToStackFunction = (
  nodes: PureNode[],
  index: number,
  ctx: StackImportContext,
) => [StackNodeDraft[], number];

const convertEqualsToPure: ConvertToPureFunction = (nodes, index) => {
  const node = nodes[index];
  const result = {
    type: node.type as unknown as PureNodeType,
    options: node.options as PureNodeOptions,
  };
  return [[result], index + 1];
};

const convertEqualsToStack: ConvertToStackFunction = (nodes, index) => {
  const node = nodes[index];
  const result = {
    type: node.type as unknown as NodeType,
    options: node.options as NodeOptions,
    collapsed: DEFAULT_COLLAPSED,
  };
  return [[result], index + 1];
};

const convertToPureMapper: Record<NodeType, ConvertToPureFunction> = {
  [NodeType.UPSCALE]: convertUpscaleToPure,
  [NodeType.RESIZE]: convertResizeToPure,
  [NodeType.SCREENTONE]: convertScreentoneToPure,
  [NodeType.CVT_COLOR]: convertEqualsToPure,
  [NodeType.FOLDER_READER]: convertFolderReaderToPure,
  [NodeType.FOLDER_WRITER]: convertFolderWriterToPure,
  [NodeType.LEVEL]: convertEqualsToPure,
  [NodeType.SHARP]: convertEqualsToPure,
  [NodeType.HYST_NORM]: convertEqualsToPure,
  [NodeType.NOISE]: convertEqualsToPure,
};

const convertToStackMapper: Partial<
  Record<PureNodeType, ConvertToStackFunction>
> = {
  [PureNodeType.UPSCALE]: convertUpscaleToStack,
  [PureNodeType.RESIZE]: convertResizeToStack,
  [PureNodeType.HALFTONE]: convertHalftoneToStack,
  [PureNodeType.CVT_COLOR]: convertEqualsToStack,
  [PureNodeType.FOLDER_READER]: convertFolderReaderToStack,
  [PureNodeType.FOLDER_WRITER]: convertFolderWriterToStack,
  [PureNodeType.LEVEL]: convertEqualsToStack,
  [PureNodeType.SHARP]: convertEqualsToStack,
  [PureNodeType.HYST_NORM]: convertEqualsToStack,
  [PureNodeType.NOISE]: convertEqualsToStack,
};

export const convertToPure = (nodes: StackNode[]): PureConfig => {
  const config: PureNode[] = [];
  const preprocess: PureNode[] = [];
  const postprocess: PureNode[] = [];
  for (let i = 0; i < nodes.length;) {
    const [converted, nextIndex] = convertToPureMapper[nodes[i].type](
      nodes,
      i,
      preprocess,
      postprocess,
    );
    // keep UI-only state on the head pure node of the group (API ignores it)
    const pureNode = nodes[i];
    if (converted[0]) {
      const meta: PureNode["meta"] = {};
      if (pureNode.name) meta.name = pureNode.name;
      if (pureNode.enabled === false) meta.disabled = true;
      if (meta.name !== undefined || meta.disabled) converted[0].meta = meta;
    }
    config.push(...converted);
    i = nextIndex;
  }
  return {
    nodes: config,
    preprocess: dedupeDownloads(preprocess),
    postprocess,
  };
};

/**
 * Preprocessors are shared: several parents referencing the same download
 * (by model name) collapse into one node, their owner uids merged in meta.
 */
const dedupeDownloads = (preprocess: PureNode[]): PureNode[] => {
  const byName = new Map<string, PureNode>();
  const rest: PureNode[] = [];
  for (const node of preprocess) {
    if (node.type !== PureNodeType.DOWNLOAD || !("name" in node.options)) {
      rest.push(node);
      continue;
    }
    const existing = byName.get(node.options.name);
    if (!existing) {
      byName.set(node.options.name, node);
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
  const migration: LegacyMigration = {
    downloads: [],
    unarchives: [],
    models: [],
  };
  const urlOf = options.urlOf ?? ((): undefined => undefined);
  const absorb = (list: readonly PureNode[], legacy: boolean): void => {
    for (const node of list) {
      if (node.type === PureNodeType.DOWNLOAD && "name" in node.options) {
        const name = modelKey(node.options.name);
        // a legacy entry has no link of its own: it comes from the database
        downloadedModels.set(name, node.options.url ?? urlOf(name));
        if (legacy) migration.downloads.push(name);
      } else if (
        node.type === PureNodeType.UNARCHIVE &&
        "path" in node.options
      ) {
        // strip the ".zip" the reader appended on export; legacy entries
        // point at the directory the archive unpacks into
        const dir = node.options.path.replace(/\.zip$/, "");
        unarchivedPaths.add(dir);
        if (legacy) migration.unarchives.push(`${dir}.zip`);
      } else if (
        node.type === PureNodeType.CLEANDIR &&
        "path" in node.options
      ) {
        cleanedPaths.add(node.options.path);
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
  return {
    downloadedModels,
    unarchivedPaths,
    cleanedPaths,
    postprocessByParent,
    urlOf,
    migration,
  };
};

const convertPureList = (
  nodes: PureNode[],
  ctx: StackImportContext,
): StackNode[] => {
  const result: StackNodeDraft[] = [];
  for (let i = 0; i < nodes.length;) {
    // preprocess nodes dissolve into parent flags, they never become stack nodes
    const converter = convertToStackMapper[nodes[i].type];
    if (!converter) {
      i += 1;
      continue;
    }
    // postprocess entries dissolve into the writer flags like preprocess
    // entries do — they never become stack nodes
    const [converted, nextIndex] = converter(nodes, i, ctx);
    const stackSource = nodes[i];
    if (converted[0]) {
      if (stackSource.meta?.name) converted[0].name = stackSource.meta.name;
      if (stackSource.meta?.disabled) converted[0].enabled = false;
    }
    result.push(...converted);
    i = nextIndex;
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
