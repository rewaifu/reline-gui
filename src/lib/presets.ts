import type { StackNode } from "~/types/node";
import { createSignal } from "solid-js";
import {
  NodeType,
  ReaderNodeMode,
  WriterNodeFormat,
  DType,
  TilerType,
  CannyType,
  HalftoneMode,
  DotType,
  FilterType,
  ResizeType,
  CvtType,
} from "~/types/enums";
import { createDefaultNodes } from "~/constants";
import { newUid } from "~/lib/uid";

export interface ConfigPreset {
  id: string;
  name: string;
  description: string;
  nodes: StackNode[];
}
const reader = (mode: ReaderNodeMode): StackNode => ({
  uid: newUid(),
  type: NodeType.FOLDER_READER,
  options: {
    path: "/content/drive/MyDrive/raws",
    recursive: false,
    mode,
    unarchive: false,
  },
  collapsed: true,
});

const writer = (): StackNode => ({
  uid: newUid(),
  type: NodeType.FOLDER_WRITER,
  options: {
    path: "/content/drive/MyDrive/raws/output",
    format: WriterNodeFormat.PNG,
  },
  collapsed: true,
});

const MODEL_BASE = "https://bucket.yor.ovh/torch_models";

// The url is derivable from the model name — never pass it by hand, a
// wrong-but-plausible url downloads the wrong weights under the right name.
const upscale = (
  model: string,
  dtype: DType = DType.F32,
  size = 896,
): StackNode => ({
  uid: newUid(),
  type: NodeType.UPSCALE,
  options: {
    is_own_model: false,
    model,
    model_url: `${MODEL_BASE}/${model}.tar.xz`,
    dtype,
    tiler: TilerType.EXACT,
    exact_tiler_size: size,
    allow_cpu_upscale: false,
  },
  collapsed: true,
});

const sharpUnsharp = (): StackNode => ({
  uid: newUid(),
  type: NodeType.SHARP,
  options: {
    low_input: 2,
    high_input: 252,
    gamma: 1,
    diapason_white: 2,
    diapason_black: -1,
    canny: true,
    canny_type: CannyType.UNSHARP,
  },
  collapsed: true,
});

const screentone = (): StackNode => ({
  uid: newUid(),
  type: NodeType.SCREENTONE,
  options: {
    halftone_mode: HalftoneMode.GRAY,
    dot_size: 7,
    angle: 0,
    dot_type: DotType.CIRCLE,
    ssaa_filter: FilterType.SHAMMING4,
    ssaa_scale: 2,
  },
  collapsed: true,
});

const resize = (filter: FilterType = FilterType.SLINEAR4): StackNode => ({
  uid: newUid(),
  type: NodeType.RESIZE,
  options: {
    resize_type: ResizeType.BY_WIDTH,
    width: 2000,
    filter,
    spread: true,
    spread_size: 2800,
  },
  collapsed: true,
});

const gray2020 = (): StackNode => ({
  uid: newUid(),
  type: NodeType.CVT_COLOR,
  options: { cvt_type: CvtType.RGB2Gray2020 },
  collapsed: true,
});

const level = (): StackNode => ({
  uid: newUid(),
  type: NodeType.LEVEL,
  options: {
    low_input: 0,
    high_input: 253,
    low_output: 0,
    high_output: 255,
    gamma: 1,
  },
  collapsed: true,
});

export const CONFIG_PRESETS: ConfigPreset[] = [
  {
    id: "default",
    name: "Default",
    description: "Стандартный конвейер со всеми шагами",
    nodes: createDefaultNodes(),
  },
  {
    id: "mangascale",
    name: "Mangascale",
    description:
      "Конфиг для mangascale-моделей: семейство MangaJanai и wtp_MangaScale_GfisrV2",
    nodes: [
      reader(ReaderNodeMode.GRAY),
      upscale("4x_wtp_MangaScale_GfisrV2"),
      level(),
      resize(FilterType.SHAMMING4),
      gray2020(),
      writer(),
    ],
  },
  {
    id: "atdl3-ssaa",
    name: "ATDL3 + SSAA",
    description: "4x_dwtp_ds_atdl3 + Dot 7 SSAA 2",
    nodes: [
      reader(ReaderNodeMode.GRAY),
      upscale("4x_dwtp_ds_atdl3", DType.F32, 768),
      sharpUnsharp(),
      screentone(),
      resize(FilterType.SHAMMING4),
      gray2020(),
      writer(),
    ],
  },
  {
    id: "moesrv2-ssaa",
    name: "MOESRv2 + SSAA",
    description: "4x_dwtp_ds_moesr_v2 + Dot 7 SSAA 2",
    nodes: [
      reader(ReaderNodeMode.GRAY),
      upscale("4x_dwtp_ds_moesr_v2"),
      sharpUnsharp(),
      screentone(),
      resize(FilterType.SHAMMING4),
      gray2020(),
      writer(),
    ],
  },
  {
    id: "color-mosrl",
    name: "Default color",
    description: "Цветной пресет с моделью umzi_digital_art_mosr_l",
    nodes: [
      reader(ReaderNodeMode.RGB),
      upscale("4x_umzi_digital_art_mosr_l"),
      level(),
      resize(FilterType.DPID1),
      writer(),
    ],
  },
  {
    id: "color-heavy",
    name: "Heavy color",
    description: "Цветной пресет с моделью IllustrationJanaiV3",
    nodes: [
      reader(ReaderNodeMode.RGB),
      upscale("4x_IllustrationJaNai_V3detail_DAT2_28k_bf16", DType.BF16, 600),
      level(),
      resize(FilterType.DPID1),
      writer(),
    ],
  },
  {
    id: "psd-to-png",
    name: "PSD to PNG",
    description: "Конвертирует PSD в PNG",
    nodes: [reader(ReaderNodeMode.RGB), writer()],
  },
];

// --- user presets (localStorage) + hiding of stock ones ---------------------

const USER_PRESETS_KEY = "reline-web:presets";
const HIDDEN_STOCK_KEY = "reline-web:hiddenStock";

const readList = (key: string): string[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

export const loadUserPresets = (): ConfigPreset[] => {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    return raw ? (JSON.parse(raw) as ConfigPreset[]) : [];
  } catch {
    return [];
  }
};

const [userPresets, setUserPresets] =
  createSignal<ConfigPreset[]>(loadUserPresets());
const [hiddenStock, setHiddenStock] = createSignal<string[]>(
  readList(HIDDEN_STOCK_KEY),
);

/** Built-ins (minus hidden) first, then user-saved presets. */
export const allPresets = (): ConfigPreset[] => [
  ...CONFIG_PRESETS.filter((p) => !hiddenStock().includes(p.id)),
  ...userPresets(),
];

export const hiddenStockCount = (): number => hiddenStock().length;

export const restoreStockPresets = () => {
  localStorage.removeItem(HIDDEN_STOCK_KEY);
  setHiddenStock([]);
};

const writeUserPresets = (list: ConfigPreset[]) =>
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(list));

export const saveUserPreset = (
  name: string,
  nodes: readonly StackNode[],
): ConfigPreset => {
  const preset: ConfigPreset = {
    id: `user-${Date.now()}`,
    name,
    description: "Пользовательский пресет",
    // JSON round-trip: store items are Solid proxies — structuredClone throws on them
    nodes: JSON.parse(JSON.stringify([...nodes])),
  };
  const list = loadUserPresets();
  list.push(preset);
  writeUserPresets(list);
  setUserPresets(list);
  return preset;
};

/** Deletes a user preset; stock presets are only hidden (recoverable). */
export const deletePreset = (id: string) => {
  if (id.startsWith("user-")) {
    const list = loadUserPresets().filter((p) => p.id !== id);
    writeUserPresets(list);
    setUserPresets(list);
    return;
  }
  const hidden = Array.from(new Set([...hiddenStock(), id]));
  localStorage.setItem(HIDDEN_STOCK_KEY, JSON.stringify(hidden));
  setHiddenStock(hidden);
};

export const getPresetByName = (name: string): ConfigPreset | undefined =>
  allPresets().find((preset) => preset.name === name);
