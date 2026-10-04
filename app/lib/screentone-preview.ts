import { CvtType, DType, FilterType, HalftoneMode, ReaderNodeMode, TilerType } from "~/types/enums"
import type { CannyType, DotType } from "~/types/enums"
import { DEFAULT_TILE_SIZE } from "~/constants"

export interface PreviewPipelineNode {
  type: string
  options: Record<string, unknown>
}

const MODEL_EXT = /\.(pt|pth|safetensors)$/i

export function modelBaseName(path: string): string {
  return path.replace(/^.*[\\/]/, "").replace(MODEL_EXT, "")
}

// Preferred models, forced to the very top when present (in this exact order).
const FORCED_MODELS = ["4x_dwtp_ds_moesr_v2", "4x_dwtp_ds_moesr_v1", "4x_dwtp_ds_atdl3"]

// Priority: forced models first, then other dwtp+ds moesr/atdl, then the rest.
function modelRank(path: string): number {
  const name = modelBaseName(path).toLowerCase()
  const forcedIndex = FORCED_MODELS.findIndex((model) => name.includes(model))
  if (forcedIndex !== -1) return forcedIndex
  const dwtp = name.includes("dwtp")
  const ds = name.includes("ds")
  if (dwtp && ds && (name.includes("moesr") || name.includes("atdl"))) return 3
  if (dwtp && ds) return 4
  if (dwtp || ds) return 5
  return 6
}

export function sortModelsByPriority(models: readonly string[]): string[] {
  return [...models].sort((a, b) => modelRank(a) - modelRank(b))
}

export function pickDefaultModel(models: readonly string[]): string | undefined {
  return sortModelsByPriority(models).find((model) => modelRank(model) <= 3)
}

// Based on app/docs/gray/ru/ds.mdx
export function suggestDotSize(height: number): number {
  if (height < 1100) return 4
  if (height < 1500) return 5
  if (height < 1900) return 6
  if (height < 2000) return 7
  return 8
}

export function suggestSsaaScale(dotSize: number): number | undefined {
  if (dotSize >= 8) return undefined
  return Math.max(2, Math.ceil(10 / dotSize))
}

export const PREVIEW_DEFAULTS = {
  tiler: TilerType.EXACT,
  exactTilerSize: DEFAULT_TILE_SIZE,
  dtype: DType.F32,
  angle: 0,
  ssaaFilter: FilterType.SHAMMING4,
} as const

export interface PreprocessConfigParams {
  inputPath: string
  model: string
  tiler: TilerType
  exactTilerSize: number
  dtype: DType
  outputPath: string
}

export function buildPreprocessConfig({ inputPath, model, tiler, exactTilerSize, dtype, outputPath }: PreprocessConfigParams): PreviewPipelineNode[] {
  const upscaleOptions: Record<string, unknown> = {
    model,
    tiler,
    dtype,
    allow_cpu_upscale: false,
  }
  if (tiler === TilerType.EXACT) {
    upscaleOptions.exact_tiler_size = exactTilerSize
  }

  return [
    { type: "file_reader", options: { path: inputPath, mode: ReaderNodeMode.GRAY } },
    { type: "upscale", options: upscaleOptions },
    { type: "cvt_color", options: { cvt_type: CvtType.RGB2Gray2020 } },
    { type: "file_writer", options: { path: outputPath } },
  ]
}

export interface EditorConfigParams {
  inputPath: string
  outputPath: string
  canny: boolean
  cannyType: CannyType
  dotType: DotType
  angle: number
  dotSize: number
  ssaaScale?: number
  disableAutoDot: boolean
}

export function buildEditorConfig({
  inputPath,
  outputPath,
  canny,
  cannyType,
  dotType,
  angle,
  dotSize,
  ssaaScale,
  disableAutoDot,
}: EditorConfigParams): PreviewPipelineNode[] {
  return [
    { type: "file_reader", options: { path: inputPath, mode: ReaderNodeMode.GRAY } },
    {
      type: "sharp",
      options: {
        low_input: 2,
        high_input: 253,
        gamma: 1,
        diapason_white: 2,
        diapason_black: -1,
        canny,
        canny_type: cannyType,
      },
    },
    {
      type: "halftone",
      options: {
        halftone_mode: HalftoneMode.GRAY,
        dot_size: dotSize,
        angle,
        dot_type: dotType,
        ssaa_scale: ssaaScale,
        ssaa_filter: PREVIEW_DEFAULTS.ssaaFilter,
        disable_auto_dot: disableAutoDot,
      },
    },
    { type: "file_writer", options: { path: outputPath } },
  ]
}
