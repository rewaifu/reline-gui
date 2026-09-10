import {
  CannyType,
  CvtType,
  DotType,
  DType,
  FilterType,
  HalftoneMode,
  NodeType,
  ReaderNodeMode,
  ResizeType,
  TilerType,
  WriterNodeFormat,
} from "./types/enums";
import type { NodeOptions, StackNode } from "./types/node";
import { newUid } from "~/lib/uid";
export const STORAGE_KEY = "reline-web:config";
export const LAYOUT_STORAGE_KEY = "reline-web:layout";

// Column sizing: side panels are resizable, the middle one keeps the rest.
export const MIN_SIDE_WIDTH = 220;
// settings panel is never narrower — its run controls must stay inside
export const MIN_RIGHT_WIDTH = 330;
export const MIN_MIDDLE_WIDTH = 320;
export const SPLITTER_WIDTH = 10;
export const MODEL_PREFIX = "/content/models/";

export const DEFAULT_COLLAPSED = true;
export const MODEL_POSTFIX = ".pth";

/** Node type → its entry in DEFAULT_NODE_OPTIONS. */
const OPTION_KEY: Record<NodeType, keyof typeof DEFAULT_NODE_OPTIONS> = {
  [NodeType.FOLDER_READER]: "folder_reader",
  [NodeType.FOLDER_WRITER]: "folder_writer",
  [NodeType.UPSCALE]: "upscale",
  [NodeType.SHARP]: "sharp",
  [NodeType.RESIZE]: "resize",
  [NodeType.SCREENTONE]: "screentone",
  [NodeType.LEVEL]: "level",
  [NodeType.CVT_COLOR]: "cvt_color",
};

export const DEFAULT_NODE_OPTIONS = {
  folder_reader: {
    path: "/content/drive/MyDrive/raws",
    mode: ReaderNodeMode.GRAY,
    recursive: false,
    unarchive: false,
  } satisfies NodeOptions,
  upscale: {
    model: "4x_dwtp_ds_atdl3",
    model_url: "https://bucket.yor.ovh/torch_models/4x_dwtp_ds_atdl3.tar.xz",
    is_own_model: false,
    dtype: DType.F32,
    tiler: TilerType.EXACT,
    exact_tiler_size: 800,
    allow_cpu_upscale: false,
  } satisfies NodeOptions,
  sharp: {
    low_input: 2,
    high_input: 253,
    gamma: 1,
    diapason_white: 2,
    diapason_black: -1,
    canny: true,
    canny_type: CannyType.UNSHARP,
  } satisfies NodeOptions,
  screentone: {
    halftone_mode: HalftoneMode.GRAY,
    dot_size: 7,
    angle: 0,
    dot_type: DotType.CIRCLE,
  } satisfies NodeOptions,
  resize: {
    resize_type: ResizeType.BY_WIDTH,
    width: 2000,
    filter: FilterType.SLINEAR4,
    spread: true,
    spread_size: 2800,
  } satisfies NodeOptions,
  level: {
    low_input: 0,
    high_input: 253,
    low_output: 0,
    high_output: 255,
    gamma: 1,
  } satisfies NodeOptions,
  cvt_color: { cvt_type: CvtType.RGB2Gray2020 } satisfies NodeOptions,
  folder_writer: {
    path: "/content/drive/MyDrive/raws/output",
    format: WriterNodeFormat.PNG,
  } satisfies NodeOptions,
};

/**
 * One node of each type with pristine default options. A factory, not a
 * constant: option objects must never be shared with the store (a user edit
 * would otherwise mutate the app defaults for the rest of the session), and
 * every node needs its own fresh uid.
 */
export const createDefaultNodes = (): StackNode[] =>
  [
    NodeType.FOLDER_READER,
    NodeType.UPSCALE,
    NodeType.SHARP,
    NodeType.SCREENTONE,
    NodeType.RESIZE,
    NodeType.LEVEL,
    NodeType.FOLDER_WRITER,
  ].map((type) => ({
    uid: newUid(),
    type,
    options: structuredClone(
      DEFAULT_NODE_OPTIONS[OPTION_KEY[type]],
    ) as NodeOptions,
    collapsed: DEFAULT_COLLAPSED,
  }));
