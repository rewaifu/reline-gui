import type { NodeOptions, StackNode } from "~/types/node";
import { createSignal } from "solid-js";
import { NodeType, ReaderNodeMode, DType, FilterType } from "~/types/enums";
import { createDefaultNodes, createNode } from "~/lib/nodes";
import type { LocalText } from "~/lib/i18n";
import { storage } from "~/lib/storage";

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
/** A stock node: the type's own defaults with only what the preset changes.
 * No option lists of its own — a copy of the defaults here once drifted from
 * the real ones, and a preset is exactly where nobody would look. */
const stock = (type: string, changes: NodeOptions = {}): StackNode => {
  const node = createNode(type);
  if (node === undefined) throw new Error(`stock preset: unknown node ${type}`);
  Object.assign(node.options, changes);
  return node;
};

const reader = (mode: ReaderNodeMode): StackNode =>
  stock(NodeType.FOLDER_READER, { mode });

const writer = (): StackNode => stock(NodeType.FOLDER_WRITER);

const MODEL_BASE = "https://bucket.yor.ovh/torch_models";

/** The url is derived from the model name and only overridden when the model is
 * published as a bare file: a wrong-but-plausible url downloads the wrong
 * weights under the right name, so it is never passed by hand for a `.tar.xz`. */
const upscale = (
  model: string,
  dtype: DType = DType.F32,
  size = 896,
  url?: string,
): StackNode =>
  stock(NodeType.UPSCALE, {
    model,
    model_url: url ?? `${MODEL_BASE}/${model}.tar.xz`,
    dtype,
    exact_tiler_size: size,
  });

const resize = (filter: FilterType = FilterType.SLINEAR4): StackNode =>
  stock(NodeType.RESIZE, { filter });

const gray2020 = (): StackNode => stock(NodeType.CVT_COLOR);

const level = (): StackNode => stock(NodeType.LEVEL);

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
  const stored = storage.getJson(key);
  return Array.isArray(stored) ? (stored as string[]) : [];
};

const loadUserPresets = (): ConfigPreset[] => {
  const stored = storage.getJson(USER_PRESETS_KEY);
  return Array.isArray(stored) ? (stored as ConfigPreset[]) : [];
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
  storage.remove(HIDDEN_STOCK_KEY);
  setHiddenStock([]);
};

const writeUserPresets = (list: ConfigPreset[]) =>
  storage.setJson(USER_PRESETS_KEY, list);

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
  storage.setJson(HIDDEN_STOCK_KEY, hidden);
  setHiddenStock(hidden);
};

export const getPresetByName = (name: string): ConfigPreset | undefined =>
  allPresets().find((preset) => preset.name === name);
