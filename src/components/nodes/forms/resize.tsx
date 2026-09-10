import type { StackNode } from "~/types/node";
import { type Component, Show, createMemo } from "solid-js";
import { FilterType, ResizeType } from "~/types/enums";
import {
  useNodeForm,
  NumberRow,
  SelectRow,
  SliderRow,
  ComboboxRow,
} from "./shared";
import type { ResizeNodeOptions } from "~/types/options";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

type SizeParam = "width" | "height" | "percent";

/** Backend picks the resize mode by which size param is present, so each
 * mode keeps only its own param on the node. The other values survive in
 * localStorage and are restored when their mode comes back. */
const MODE_PARAMS: Record<ResizeType, readonly SizeParam[]> = {
  [ResizeType.BY_WIDTH]: ["width"],
  [ResizeType.BY_HEIGHT]: ["height"],
  [ResizeType.ABSOLUTE]: ["width", "height"],
  [ResizeType.PERCENT]: ["percent"],
};

const STASH_KEY = "reline-web:resize-stash";

const readStash = (): Partial<Record<SizeParam, number>> => {
  try {
    return JSON.parse(localStorage.getItem(STASH_KEY) ?? "{}") as Partial<
      Record<SizeParam, number>
    >;
  } catch {
    return {};
  }
};

export const ResizeForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as ResizeNodeOptions;
  const type = createMemo(() => options().resize_type);

  const changeType = (next: ResizeType) => {
    const current = options();
    const stash = readStash();
    for (const key of ["width", "height", "percent"] as const) {
      const value = current[key];
      if (value !== undefined) stash[key] = value;
    }
    localStorage.setItem(STASH_KEY, JSON.stringify(stash));
    // clear every size param, then put back the ones the new mode owns —
    // Object.assign in the reducer overwrites with undefined, which the
    // serializer drops from the node options
    const patch: Partial<ResizeNodeOptions> = { resize_type: next };
    const put = (key: SizeParam, value: number | undefined) => {
      if (key === "width") patch.width = value;
      else if (key === "height") patch.height = value;
      else patch.percent = value;
    };
    for (const key of ["width", "height", "percent"] as const)
      put(key, undefined);
    for (const key of MODE_PARAMS[next]) put(key, current[key] ?? stash[key]);
    form.set(patch as Partial<ResizeNodeOptions>);
  };

  return (
    <div class={styles.form}>
      <SelectRow
        label={t("form.resize.type")}
        value={type()}
        items={Object.values(ResizeType)}
        onChange={(value) => changeType(value as ResizeType)}
      />
      <Show when={type() === ResizeType.BY_WIDTH}>
        <NumberRow
          label={t("form.resize.width")}
          value={options().width}
          min={0}
          step={128}
          onInput={(width) => form.set({ width })}
        />
      </Show>
      <Show when={type() === ResizeType.BY_HEIGHT}>
        <NumberRow
          label={t("form.resize.height")}
          value={options().height}
          min={0}
          step={128}
          onInput={(height) => form.set({ height })}
        />
      </Show>
      <Show when={type() === ResizeType.ABSOLUTE}>
        <div class={styles.grid2}>
          <NumberRow
            label={t("form.resize.width")}
            value={options().width}
            min={0}
            step={128}
            onInput={(width) => form.set({ width })}
          />
          <NumberRow
            label={t("form.resize.height")}
            value={options().height}
            min={0}
            step={128}
            onInput={(height) => form.set({ height })}
          />
        </div>
      </Show>
      <Show when={type() === ResizeType.PERCENT}>
        <SliderRow
          label={t("form.resize.percent")}
          value={options().percent}
          min={0}
          max={100}
          onInput={(percent) => form.set({ percent })}
        />
      </Show>
      <ComboboxRow
        label={t("form.resize.filter")}
        value={options().filter}
        items={Object.values(FilterType)}
        onChange={(filter) => form.set({ filter: filter as FilterType })}
      />
      <Show when={type() === ResizeType.BY_WIDTH}>
        <NumberRow
          label={t("form.resize.spreadSize")}
          value={options().spread_size}
          min={0}
          step={1}
          onInput={(spread_size) => form.set({ spread_size })}
        />
      </Show>
    </div>
  );
};
