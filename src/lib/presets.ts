import type { StackNode } from "~/types/node";
import { createSignal } from "solid-js";
import {
  NodeType,
  ReaderNodeMode,
  WriterNodeFormat,
  DType,
  TilerType,
  FilterType,
  ResizeType,
  CvtType,
} from "~/types/enums";
import { createDefaultNodes } from "~/constants";
import type { LocalText } from "~/lib/i18n";
import { newUid } from "~/lib/uid";

export interface ConfigPreset {
  id: string;
  /** Shown as-is: stock presets carry proper names ("Mangascale"), so there is
   * nothing to translate. */
  name: string;
  /** A dictionary key, or plain text for a preset saved before i18n: render it
   * with `render` from `~/lib/i18n`, which leaves an unknown string alone. */
  description: LocalText;
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
    clean_before: false,
  },
  collapsed: true,
});

const MODEL_BASE = "https://bucket.yor.ovh/torch_models";

/** The url is derived from the model name and only overridden when the model is
 * published as a bare file: a wrong-but-plausible url downloads the wrong
 * weights under the right name, so it is never passed by hand for a `.tar.xz`. */
const upscale = (
  model: string,
  dtype: DType = DType.F32,
  size = 896,
  url?: string,
): StackNode => ({
  uid: newUid(),
  type: NodeType.UPSCALE,
  options: {
    is_own_model: false,
    model,
    model_url: url ?? `${MODEL_BASE}/${model}.tar.xz`,
    dtype,
    tiler: TilerType.EXACT,
    exact_tiler_size: size,
    allow_cpu_upscale: false,
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
    description: "panel.presets.description.default",
    nodes: createDefaultNodes(),
  },
  {
    id: "mangascale",
    name: "Mangascale",
    description: "panel.presets.description.mangascale",
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
    id: "color-mosrl",
    name: "Default color",
    description: "panel.presets.description.color-mosrl",
    nodes: [
      reader(ReaderNodeMode.RGB),
      // published as a bare .safetensors, not as the usual .tar.xz
      upscale(
        "2x_enhancr_da_smosr_v1",
        DType.F32,
        896,
        `${MODEL_BASE}/2x_enhancr_da_smosr_v1.safetensors`,
      ),
      level(),
      resize(FilterType.ICATMULLROM),
      writer(),
    ],
  },
  {
    id: "color-heavy",
    name: "Heavy color",
    description: "panel.presets.description.color-heavy",
    nodes: [
      reader(ReaderNodeMode.RGB),
      upscale("4x_IllustrationJaNai_V3detail_DAT2_28k_bf16", DType.BF16, 600),
      level(),
      resize(FilterType.ICATMULLROM),
      writer(),
    ],
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
    description: "panel.presets.description.user",
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
