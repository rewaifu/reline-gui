import type { NodeType, PureNodeType } from "./enums";
import type {
  PureCvtColorNodeOptions,
  PureFolderReaderNodeOptions,
  PureFolderWriterNodeOptions,
  PureHalftoneNodeOptions,
  PureHystNormNodeOptions,
  PureNoiseNodeOptions,
  PureResizeOptions,
  PureSharpNodeOptions,
  PureUpscaleNodeOptions,
} from "~/types/options";
import type { PurePostprocessNodeOptions } from "~/types/options/postprocess";
export type { PurePostprocessNodeOptions };

import type {
  CvtColorNodeOptions,
  FolderReaderNodeOptions,
  FolderWriterNodeOptions,
  ScreentoneNodeOptions,
  HystNormNodeOptions,
  LevelNodeOptions,
  NoiseNodeOptions,
  ResizeNodeOptions,
  SharpNodeOptions,
  UpscaleNodeOptions,
} from "~/types/options";

export type NodeOptions =
  | CvtColorNodeOptions
  | FolderReaderNodeOptions
  | FolderWriterNodeOptions
  | ScreentoneNodeOptions
  | HystNormNodeOptions
  | LevelNodeOptions
  | NoiseNodeOptions
  | ResizeNodeOptions
  | SharpNodeOptions
  | UpscaleNodeOptions;

/** Options of the generated preprocessors (download / unarchive / cleandir). */
export type PureDownloadNodeOptions = { name: string; url?: string };
export type PureUnarchiveNodeOptions = { path: string };
export type PureCleandirNodeOptions = { path: string };

export type PureNodeOptions =
  | PureCvtColorNodeOptions
  | PureFolderReaderNodeOptions
  | PureFolderWriterNodeOptions
  | PureHalftoneNodeOptions
  | PureHystNormNodeOptions
  | PureNoiseNodeOptions
  | PureResizeOptions
  | PureSharpNodeOptions
  | PureDownloadNodeOptions
  | PureUpscaleNodeOptions
  | PureUnarchiveNodeOptions
  | PureCleandirNodeOptions
  | PurePostprocessNodeOptions;

export type PurePostprocess = PureNode[];
export interface PureNode {
  type: PureNodeType;
  options: PureNodeOptions;
  /**
   * UI-only metadata carried in the shared config under `meta`, so it never
   * mixes with pipeline data. `name` and `parents` are ignored by the runner;
   * `disabled: true` is honoured — a switched-off node is not executed.
   */
  meta?: { name?: string; disabled?: boolean; parents?: string[] };
}

/** Serialized config shape: main pipeline, its preprocessors and postprocess. */
export interface PureConfig {
  nodes: PureNode[];
  preprocess: PureNode[];
  /** Absent in hand-written configs and legacy imports: treated as no postprocess. */
  postprocess?: PurePostprocess;
}

export interface StackNode {
  type: NodeType;
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
}
