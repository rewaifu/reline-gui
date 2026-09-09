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

export const DEFAULT_NODE_OPTIONS = {
  folder_reader: {
    path: "/content/drive/MyDrive/raws",
    mode: ReaderNodeMode.GRAY,
    recursive: false,
    unarchive: false,
  } satisfies NodeOptions,
  upscale: {
    model: "4x_dwtp_ds_atdl3",
    model_url:"https://bucket.yor.ovh/torch_models/4x_dwtp_ds_atdl3.tar.xz",
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

export const DEFAULT_NODES: StackNode[] = [
  {
    id: 0,
    type: NodeType.FOLDER_READER,
    options: DEFAULT_NODE_OPTIONS.folder_reader,
    collapsed: DEFAULT_COLLAPSED,
  },
  {
    id: 1,
    type: NodeType.UPSCALE,
    options: DEFAULT_NODE_OPTIONS.upscale,
    collapsed: DEFAULT_COLLAPSED,
  },
  {
    id: 2,
    type: NodeType.SHARP,
    options: DEFAULT_NODE_OPTIONS.sharp,
    collapsed: DEFAULT_COLLAPSED,
  },
  {
    id: 3,
    type: NodeType.SCREENTONE,
    options: DEFAULT_NODE_OPTIONS.screentone,
    collapsed: DEFAULT_COLLAPSED,
  },
  {
    id: 4,
    type: NodeType.RESIZE,
    options: DEFAULT_NODE_OPTIONS.resize,
    collapsed: DEFAULT_COLLAPSED,
  },
  {
    id: 5,
    type: NodeType.LEVEL,
    options: DEFAULT_NODE_OPTIONS.level,
    collapsed: DEFAULT_COLLAPSED,
  },
  {
    id: 6,
    type: NodeType.FOLDER_WRITER,
    options: DEFAULT_NODE_OPTIONS.folder_writer,
    collapsed: DEFAULT_COLLAPSED,
  },
];
