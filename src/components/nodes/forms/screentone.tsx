import type { StackNode } from "~/types/node";
import { type Component, For, Show } from "solid-js";
import { DotType, HalftoneMode } from "~/types/enums";
import {
  useNodeForm,
  SelectRow,
  CheckRow,
  NumberRow,
  SliderRow,
  ComboboxRow,
} from "./shared";
import type { ScreentoneNodeOptions } from "~/types/options";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

/** Shapes offered per channel. Derived from the enum: a new member appears on
 * its own, and its order in the enum is the order in the menu. */
const DOT_TYPES = Object.values(DotType);

/** Channels per halftone mode: gray drives one dot grid, the color modes
 * drive one grid per channel. */
const CHANNELS: Record<HalftoneMode, string[]> = {
  [HalftoneMode.GRAY]: [""],
  [HalftoneMode.RGB]: ["R", "G", "B"],
  [HalftoneMode.HSV]: ["H", "S", "V"],
  [HalftoneMode.CMYK]: ["C", "M", "Y", "K"],
};

/** Mode switch stashes the current shape here and restores the shape of
 * the mode being activated, so a node only ever carries the params its
 * mode parses. */
const STASH_KEY = "reline-web:halftone-stash";

type Stash = Partial<
  Record<
    HalftoneMode,
    Partial<Record<"dot_size" | "angle" | "dot_type", unknown>>
  >
>;

const readStash = (): Stash => {
  try {
    return JSON.parse(localStorage.getItem(STASH_KEY) ?? "{}") as Stash;
  } catch {
    return {};
  }
};

const lastNum = (value: unknown, dflt: number): number =>
  Array.isArray(value)
    ? ((value[value.length - 1] as number) ?? dflt)
    : typeof value === "number"
      ? value
      : dflt;

const lastType = (value: unknown): DotType => {
  if (Array.isArray(value))
    return (value[value.length - 1] as DotType) ?? DotType.CIRCLE;
  return typeof value === "string" ? (value as DotType) : DotType.CIRCLE;
};

export const ScreentoneForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as ScreentoneNodeOptions;
  const multi = () => options().halftone_mode !== HalftoneMode.GRAY;
  // A tree saved by an older build can name a mode this build no longer has
  // (or a hand-edited config can invent one). Looking that up returns
  // undefined, which reaches `<For>` and throws *during render* — the kind of
  // error that halts Solid's reactive system. Show the default channel set
  // instead; the select still shows what is actually stored.
  const channels = () =>
    CHANNELS[options().halftone_mode] ?? CHANNELS[HalftoneMode.GRAY];
  const changeMode = (next: HalftoneMode) => {
    const curMode = options().halftone_mode;
    if (curMode === next) return;
    const stash = readStash();
    stash[curMode] = {
      dot_size: options().dot_size,
      angle: options().angle,
      dot_type: options().dot_type,
    };
    localStorage.setItem(STASH_KEY, JSON.stringify(stash));

    const from = stash[next] ?? {};
    const count = CHANNELS[next].length;
    const num = (
      field: "dot_size" | "angle",
      dflt: number,
    ): number | number[] => {
      if (count === 1) return lastNum(from[field] ?? options()[field], dflt);
      const src = from[field] ?? options()[field];
      const fallback = lastNum(src, dflt);
      return Array.from({ length: count }, (_, i) =>
        Array.isArray(src)
          ? (src[i] ?? fallback)
          : typeof src === "number"
            ? src
            : dflt,
      );
    };
    const dtype = (): DotType | DotType[] => {
      if (count === 1) return lastType(from.dot_type ?? options().dot_type);
      const src = from.dot_type ?? options().dot_type;
      const fallback = lastType(src);
      return Array.from({ length: count }, (_, i) =>
        Array.isArray(src) ? ((src[i] as DotType) ?? fallback) : fallback,
      );
    };
    form.set({
      halftone_mode: next,
      dot_size: num("dot_size", 8),
      angle: num("angle", 45),
      dot_type: dtype(),
    });
  };

  const num = (field: "dot_size" | "angle", i: number): number => {
    const raw = options()[field];
    if (!Array.isArray(raw)) return raw ?? 0;
    return raw[i] ?? raw[raw.length - 1] ?? 0;
  };
  const setNum = (field: "dot_size" | "angle", i: number, value: number) => {
    if (!multi()) {
      form.set({ [field]: value } as Partial<ScreentoneNodeOptions>);
      return;
    }
    const next = channels().map((_, k) => (k === i ? value : num(field, k)));
    form.set({ [field]: next } as Partial<ScreentoneNodeOptions>);
  };

  const dtypeAt = (i: number): DotType => {
    const raw = options().dot_type;
    if (Array.isArray(raw))
      return raw[i] ?? raw[raw.length - 1] ?? DotType.CIRCLE;
    return raw;
  };
  const setDtype = (i: number, value: DotType) => {
    if (!multi()) {
      form.set({ dot_type: value });
      return;
    }
    const next = channels().map((_, k) => (k === i ? value : dtypeAt(k)));
    form.set({ dot_type: next });
  };

  return (
    <div class={styles.form}>
      <SelectRow
        label={t("form.screentone.halftoneMode")}
        value={options().halftone_mode}
        items={Object.values(HalftoneMode)}
        onChange={(value) => changeMode(value as HalftoneMode)}
      />
      <div class={styles.channels}>
        <For each={channels()}>
          {(channel, i) => (
            <div class={styles.group}>
              <p class={styles.groupTitle}>
                <Show when={multi()} fallback={t("form.screentone.channel")}>
                  {channel}
                </Show>
              </p>
              <SliderRow
                label={t("form.screentone.dotSize")}
                value={num("dot_size", i())}
                min={1}
                max={128}
                step={1}
                onInput={(value) => setNum("dot_size", i(), value)}
              />
              <SliderRow
                label={t("form.screentone.angle")}
                value={num("angle", i())}
                min={0}
                max={180}
                step={1}
                onInput={(value) => setNum("angle", i(), value)}
              />
              <ComboboxRow
                label={t("form.screentone.dotType")}
                value={dtypeAt(i())}
                items={DOT_TYPES}
                onChange={(value) => setDtype(i(), value as DotType)}
              />
            </div>
          )}
        </For>
      </div>
      <CheckRow
        label={t("form.screentone.disableAutoDot")}
        checked={options().disable_auto_dot ?? false}
        onChange={(disable_auto_dot) => form.set({ disable_auto_dot })}
      />
      <NumberRow
        label={t("form.screentone.ssaaScale")}
        value={options().ssaa_scale}
        min={1}
        step={1}
        max={16}
        onInput={(ssaa_scale) => form.set({ ssaa_scale })}
      />
    </div>
  );
};
