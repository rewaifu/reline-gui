import type { StackNode } from "~/types/node";
import { type Component } from "solid-js";
import { useNodeForm, SliderRow } from "./shared";
import type { LevelNodeOptions } from "~/types/options";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

export const LevelForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as LevelNodeOptions;
  return (
    <div class={styles.form}>
      <div class={styles.grid2}>
        <SliderRow
          label={t("form.level.lowInput")}
          value={options().low_input}
          min={0}
          max={255}
          onInput={(low_input) => form.set({ low_input })}
        />
        <SliderRow
          label={t("form.level.highInput")}
          value={options().high_input}
          min={0}
          max={255}
          onInput={(high_input) => form.set({ high_input })}
        />
      </div>
      <div class={styles.grid2}>
        <SliderRow
          label={t("form.level.lowOutput")}
          value={options().low_output}
          min={0}
          max={255}
          onInput={(low_output) => form.set({ low_output })}
        />
        <SliderRow
          label={t("form.level.highOutput")}
          value={options().high_output}
          min={0}
          max={255}
          onInput={(high_output) => form.set({ high_output })}
        />
      </div>
      <SliderRow
        label={t("form.level.gamma")}
        value={options().gamma}
        min={0}
        max={10}
        step={0.1}
        onInput={(gamma) => form.set({ gamma })}
      />
    </div>
  );
};
