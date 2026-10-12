import { nodeRegistry } from "~/lib/nodes/registry";
import type { NodeDef, PrepareRun } from "~/lib/nodes/types";
import {
  convertFolderReaderToPure,
  convertFolderReaderToStack,
} from "~/lib/convert/folder-reader";
import {
  convertFolderWriterToPure,
  convertFolderWriterToStack,
} from "~/lib/convert/folder-writer";
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
import { resolveModelName } from "~/lib/model-db";
import {
  CannyType,
  CvtType,
  DotType,
  DType,
  FilterType,
  HalftoneMode,
  NodeType,
  PsdFit,
  PureNodeType,
  ReaderNodeMode,
  ResizeType,
  TilerType,
  WriterNodeFormat,
} from "~/types/enums";
import {
  cvtColorNodeOptionsSchema,
  folderReaderOptionsSchema,
  folderWriterOptionsSchema,
  hystNormOptionsSchema,
  levelNodeOptionsSchema,
  noiseOptionsSchema,
  NoiseMode,
  resizeOptionsSchema,
  screentoneOptionsSchema,
  sharpNodeOptionsSchema,
  UpscaleOptionsSchema,
} from "~/types/options";
import { RESIZE_MODE_PARAMS } from "~/types/options/resize";
import type { ResizeNodeOptions } from "~/types/options";

/**
 * The built-in node types, defined through the same registry a plugin uses.
 * This file is data and converters only — the forms are attached in
 * `builtin-ui.ts`, so the converters (and their tests) never pull in the UI.
 */

/** The model picked from the database is forced onto a real entry (exact or
 * the closest match) so a run can never see an invalid model. */
const prepareUpscale: PrepareRun = async (node) => {
  const { model, is_own_model, model_url } = node.options;
  if (typeof model !== "string" || is_own_model !== false) return undefined;
  const hit = await resolveModelName(model);
  if (hit === undefined) return undefined;
  if (hit.name === model && hit.url === model_url) return undefined;
  return { model: hit.name, model_url: hit.url };
};

/** Resize defaults carry `width` (the BY_WIDTH mode's value). A stored
 * BY_HEIGHT node persists without `width` (undefined is dropped by JSON), so a
 * plain merge resurrects the default width next to the height — and the backend
 * reads width+height as `absolute`. Drop the size params the stored mode does
 * not own right where outside data becomes a node. */
const normalizeResize: NodeDef["normalize"] = (options) => {
  const resize = options as unknown as ResizeNodeOptions;
  const owned: Record<string, true> = {};
  for (const key of RESIZE_MODE_PARAMS[resize.resize_type as ResizeType] ?? [])
    owned[key] = true;
  for (const key of ["width", "height", "percent"] as const)
    if (!owned[key]) delete resize[key];
};

/** Old writer stores predate the flags: a missing clean_before is off, and a
 * partial psd block (e.g. `{enabled:true}` with no fit/source) is filled so the
 * form never reads undefined and `enabled:true` actually runs. */
const normalizeWriter: NodeDef["normalize"] = (options) => {
  const writer = options as {
    clean_before?: unknown;
    postprocess?: { psd?: Record<string, unknown> };
  };
  if (typeof writer.clean_before !== "boolean") writer.clean_before = false;
  const psd = writer.postprocess?.psd;
  if (psd === undefined) return;
  if (typeof psd.source_path !== "string") psd.source_path = "";
  if (!Object.values(PsdFit).includes(psd.fit as PsdFit))
    psd.fit = PsdFit.ORIGINAL;
  if (typeof psd.enabled !== "boolean") psd.enabled = false;
  if (typeof psd.delete_originals !== "boolean") psd.delete_originals = false;
};

const BUILTINS: NodeDef[] = [
  {
    type: NodeType.FOLDER_READER,
    label: "node.folder_reader",
    schema: folderReaderOptionsSchema,
    defaults: () => ({
      path: "/content/drive/MyDrive/raws",
      mode: ReaderNodeMode.GRAY,
      recursive: false,
      unarchive: false,
    }),
    toPure: convertFolderReaderToPure,
    fromPure: convertFolderReaderToStack,
  },
  {
    type: NodeType.FOLDER_WRITER,
    label: "node.folder_writer",
    schema: folderWriterOptionsSchema,
    defaults: () => ({
      path: "/content/drive/MyDrive/raws/output",
      format: WriterNodeFormat.PNG,
      clean_before: false,
    }),
    normalize: normalizeWriter,
    toPure: convertFolderWriterToPure,
    fromPure: convertFolderWriterToStack,
  },
  {
    type: NodeType.UPSCALE,
    label: "node.upscale",
    schema: UpscaleOptionsSchema,
    defaults: () => ({
      model: "4x_dwtp_ds_moesr_v2",
      model_url:
        "https://bucket.yor.ovh/torch_models/4x_dwtp_ds_moesr_v2.tar.xz",
      is_own_model: false,
      dtype: DType.F32,
      tiler: TilerType.EXACT,
      exact_tiler_size: 896,
      allow_cpu_upscale: false,
    }),
    toPure: convertUpscaleToPure,
    fromPure: convertUpscaleToStack,
    prepare: prepareUpscale,
  },
  {
    type: NodeType.SHARP,
    label: "node.sharp",
    schema: sharpNodeOptionsSchema,
    defaults: () => ({
      low_input: 2,
      high_input: 253,
      gamma: 1,
      diapason_white: 2,
      diapason_black: -1,
      canny: true,
      canny_type: CannyType.UNSHARP,
    }),
  },
  {
    type: NodeType.RESIZE,
    label: "node.resize",
    schema: resizeOptionsSchema,
    defaults: () => ({
      resize_type: ResizeType.BY_WIDTH,
      width: 2000,
      filter: FilterType.SLINEAR4,
      spread: true,
      spread_size: 2800,
    }),
    normalize: normalizeResize,
    toPure: convertResizeToPure,
    fromPure: convertResizeToStack,
  },
  {
    type: NodeType.SCREENTONE,
    pureType: PureNodeType.HALFTONE,
    label: "node.screentone",
    schema: screentoneOptionsSchema,
    defaults: () => ({
      halftone_mode: HalftoneMode.GRAY,
      dot_size: 7,
      angle: 0,
      dot_type: DotType.CIRCLE,
      ssaa_scale: 2,
    }),
    toPure: convertScreentoneToPure,
    fromPure: convertHalftoneToStack,
  },
  {
    type: NodeType.LEVEL,
    label: "node.level",
    schema: levelNodeOptionsSchema,
    defaults: () => ({
      low_input: 0,
      high_input: 253,
      low_output: 0,
      high_output: 255,
      gamma: 1,
    }),
  },
  {
    type: NodeType.CVT_COLOR,
    label: "node.cvt_color",
    schema: cvtColorNodeOptionsSchema,
    defaults: () => ({ cvt_type: CvtType.RGB2Gray2020 }),
  },
  {
    type: NodeType.HYST_NORM,
    label: "node.hyst_norm",
    schema: hystNormOptionsSchema,
    defaults: () => ({
      blur_n: 3,
      window_radius: 3,
      min_prominence: 0.5,
      min_distance: 10,
      percentage: 0.22,
    }),
  },
  {
    type: NodeType.NOISE,
    label: "node.noise",
    schema: noiseOptionsSchema,
    defaults: () => ({
      a: 1,
      b: 1,
      alpha: 0.1,
      noise_mode: NoiseMode.RGB,
      th_min: 1,
      th_max: 254,
      seed: null,
    }),
  },
];

for (const def of BUILTINS) nodeRegistry.define(def);
