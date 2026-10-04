import type { StackNode } from "~/types/node"
import { NodeType, ReaderNodeMode, WriterNodeFormat, DType, TilerType, CannyType, HalftoneMode, DotType, FilterType, ResizeType, CvtType } from "~/types/enums"
import { DEFAULT_NODES, DEFAULT_READER_PATH, DEFAULT_WRITER_PATH } from "~/constants"

export interface ConfigPreset {
  id: string
  name: string
  description: string
  nodes: StackNode[]
}

export const CONFIG_PRESETS: ConfigPreset[] = [
  {
    id: "default",
    name: "Default",
    description: "Standard pipeline with all steps",
    nodes: DEFAULT_NODES,
  },
  {
    id: "mangascale",
    name: "Mangascale",
    description: "Config for mangascale models, such as MangaJanai family and wtp_MangaScale_GfisrV2",
    nodes: [
      { id: 0, type: NodeType.FOLDER_READER, options: { path: DEFAULT_READER_PATH, recursive: false, mode: ReaderNodeMode.GRAY, unarchive: false }, collapsed: true },
      { id: 1, type: NodeType.UPSCALE, options: { is_own_model: false, model: "4x_wtp_MangaScale_GfisrV2", dtype: DType.F32, tiler: TilerType.EXACT, exact_tiler_size: 800, allow_cpu_upscale: false }, collapsed: true },
      { id: 2, type: NodeType.LEVEL, options: { low_input: 0, high_input: 253, low_output: 0, high_output: 255, gamma: 1 }, collapsed: true },
      { id: 3, type: NodeType.RESIZE, options: { resize_type: ResizeType.BY_WIDTH, width: 2000, filter: FilterType.SHAMMING4, spread: true, spread_size: 2800 }, collapsed: true },
      { id: 4, type: NodeType.CVT_COLOR, options: { cvt_type: CvtType.RGB2Gray2020 }, collapsed: true },
      { id: 5, type: NodeType.FOLDER_WRITER, options: { path: DEFAULT_WRITER_PATH, format: WriterNodeFormat.PNG }, collapsed: true },
    ],
  },
  {
    id: "atdl3-ssaa",
    name: "ATDL3 + SSAA",
    description: "4x_dwtp_ds_atdl3 + Dot 7 SSAA 2",
    nodes: [
      { id: 0, type: NodeType.FOLDER_READER, options: { path: DEFAULT_READER_PATH, recursive: false, mode: ReaderNodeMode.GRAY, unarchive: false }, collapsed: true },
      { id: 1, type: NodeType.UPSCALE, options: { is_own_model: false, model: "4x_dwtp_ds_atdl3", dtype: DType.F32, tiler: TilerType.EXACT, exact_tiler_size: 700, allow_cpu_upscale: false }, collapsed: true },
      { id: 2, type: NodeType.SHARP, options: { low_input: 2, high_input: 252, gamma: 1, diapason_white: 2, diapason_black: -1, canny: true, canny_type: CannyType.UNSHARP }, collapsed: true },
      { id: 3, type: NodeType.SCREENTONE, options: { halftone_mode: HalftoneMode.GRAY, dot_size: 7, angle: 0, dot_type: DotType.CIRCLE, ssaa_filter: FilterType.SHAMMING4, ssaa_scale: 2 }, collapsed: true },
      { id: 4, type: NodeType.RESIZE, options: { resize_type: ResizeType.BY_WIDTH, width: 2000, filter: FilterType.SHAMMING4, spread: true, spread_size: 2800 }, collapsed: true },
      { id: 5, type: NodeType.CVT_COLOR, options: { cvt_type: CvtType.RGB2Gray2020 }, collapsed: true },
      { id: 6, type: NodeType.FOLDER_WRITER, options: { path: DEFAULT_WRITER_PATH, format: WriterNodeFormat.PNG }, collapsed: true },
    ],
  },
  {
    id: "moesrv2-ssaa",
    name: "MOESRv2 + SSAA",
    description: "4x_dwtp_ds_atdl3 + Dot 7 SSAA 2",
    nodes: [
      { id: 0, type: NodeType.FOLDER_READER, options: { path: DEFAULT_READER_PATH, recursive: false, mode: ReaderNodeMode.GRAY, unarchive: false }, collapsed: true },
      { id: 1, type: NodeType.UPSCALE, options: { is_own_model: false, model: "4x_dwtp_ds_moesr_v2", dtype: DType.F32, tiler: TilerType.EXACT, exact_tiler_size: 800, allow_cpu_upscale: false }, collapsed: true },
      { id: 2, type: NodeType.SHARP, options: { low_input: 2, high_input: 252, gamma: 1, diapason_white: 2, diapason_black: -1, canny: true, canny_type: CannyType.UNSHARP }, collapsed: true },
      { id: 3, type: NodeType.SCREENTONE, options: { halftone_mode: HalftoneMode.GRAY, dot_size: 7, angle: 0, dot_type: DotType.CIRCLE, ssaa_filter: FilterType.SHAMMING4, ssaa_scale: 2 }, collapsed: true },
      { id: 4, type: NodeType.RESIZE, options: { resize_type: ResizeType.BY_WIDTH, width: 2000, filter: FilterType.SHAMMING4, spread: true, spread_size: 2800 }, collapsed: true },
      { id: 5, type: NodeType.CVT_COLOR, options: { cvt_type: CvtType.RGB2Gray2020 }, collapsed: true },
      { id: 6, type: NodeType.FOLDER_WRITER, options: { path: DEFAULT_WRITER_PATH, format: WriterNodeFormat.PNG }, collapsed: true },
    ],
  },
  {
    id: "color-mosrl",
    name: "Default color",
    description: "Color preset with umzi_digital_art_mosr_l model",
    nodes: [
      { id: 0, type: NodeType.FOLDER_READER, options: { path: DEFAULT_READER_PATH, recursive: false, mode: ReaderNodeMode.RGB, unarchive: false }, collapsed: true },
      { id: 2, type: NodeType.UPSCALE, options: { is_own_model: false, model: "4x_umzi_digital_art_mosr_l", dtype: DType.F32, tiler: TilerType.EXACT, exact_tiler_size: 800, allow_cpu_upscale: false }, collapsed: true },
      { id: 3, type: NodeType.LEVEL, options: { low_input: 0, high_input: 253, low_output: 0, high_output: 255, gamma: 1 }, collapsed: true },
      { id: 4, type: NodeType.RESIZE, options: { resize_type: ResizeType.BY_WIDTH, width: 2000, filter: FilterType.DPID05, spread: true, spread_size: 2800 }, collapsed: true },
      { id: 4, type: NodeType.FOLDER_WRITER, options: { path: DEFAULT_WRITER_PATH, format: WriterNodeFormat.PNG }, collapsed: true },
    ],
  },
  {
    id: "color-heavy",
    name: "Heavy color",
    description: "Color preset with IllustrationJanaiV3 model",
    nodes: [
      { id: 0, type: NodeType.FOLDER_READER, options: { path: DEFAULT_READER_PATH, recursive: false, mode: ReaderNodeMode.RGB, unarchive: false }, collapsed: true },
      { id: 2, type: NodeType.UPSCALE, options: { is_own_model: false, model: "4x_IllustrationJaNai_V3detail_DAT2_28k_bf16", dtype: DType.BF16, tiler: TilerType.EXACT, exact_tiler_size: 600, allow_cpu_upscale: false }, collapsed: true },
      { id: 3, type: NodeType.LEVEL, options: { low_input: 0, high_input: 253, low_output: 0, high_output: 255, gamma: 1 }, collapsed: true },
      { id: 4, type: NodeType.RESIZE, options: { resize_type: ResizeType.BY_WIDTH, width: 2000, filter: FilterType.DPID05, spread: true, spread_size: 2800 }, collapsed: true },
      { id: 4, type: NodeType.FOLDER_WRITER, options: { path: DEFAULT_WRITER_PATH, format: WriterNodeFormat.PNG }, collapsed: true },
    ],
  },
  {
    id: "psd-to-png",
    name: "PSD to PNG",
    description: "Converts PSD to PNG",
    nodes: [
      { id: 0, type: NodeType.FOLDER_READER, options: { path: DEFAULT_READER_PATH, recursive: false, mode: ReaderNodeMode.RGB, unarchive: false }, collapsed: true },
      { id: 1, type: NodeType.FOLDER_WRITER, options: { path: DEFAULT_WRITER_PATH, format: WriterNodeFormat.PNG }, collapsed: true },
    ],
  },
]

export function getPresetById(id: string): ConfigPreset | undefined {
  return CONFIG_PRESETS.find(preset => preset.id === id)
}
