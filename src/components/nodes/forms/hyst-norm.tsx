import type { StackNode } from "~/types/node";
import { type Component } from "solid-js";
import { useNodeForm, SliderRow } from "./shared";
import type { HystNormNodeOptions } from "~/types/options";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

export const HystNormForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as HystNormNodeOptions;
  return (
    <div class={styles.form}>
      <div class={styles.grid2}>
        <SliderRow
          label={t("form.hyst_norm.blurN")}
          value={options().blur_n}
          min={0}
          max={32}
          onInput={(blur_n) => form.set({ blur_n })}
        />
        <SliderRow
          label={t("form.hyst_norm.windowRadius")}
          value={options().window_radius}
          min={1}
          max={64}
          onInput={(window_radius) => form.set({ window_radius })}
        />
      </div>
      <div class={styles.grid2}>
        <SliderRow
          label={t("form.hyst_norm.minProminence")}
          value={options().min_prominence}
          min={0}
          max={10}
          step={0.1}
          onInput={(min_prominence) => form.set({ min_prominence })}
        />
        <SliderRow
          label={t("form.hyst_norm.minDistance")}
          value={options().min_distance}
          min={1}
          max={64}
          onInput={(min_distance) => form.set({ min_distance })}
        />
      </div>
      <SliderRow
        label={t("form.hyst_norm.percentage")}
        value={options().percentage}
        min={0}
        max={1}
        step={0.01}
        onInput={(percentage) => form.set({ percentage })}
      />
    </div>
  );
};
