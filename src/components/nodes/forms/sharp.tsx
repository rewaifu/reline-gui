import type { StackNode } from "~/types/node";
import { type Component, Show } from "solid-js";
import { CannyType } from "~/types/enums";
import {
  useNodeForm,
  NumberRow,
  SelectRow,
  CheckRow,
  SliderRow,
} from "./shared";
import type { SharpNodeOptions } from "~/types/options";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };
export function roundToStep(value: number, step: number): number {
  const decimals = (step.toString().split(".")[1] || "").length;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
export const SharpForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as SharpNodeOptions;
  return (
    <div class={styles.form}>
      <div class={styles.grid3}>
        <SliderRow
          label={t("form.sharp.lowInput")}
          value={options().low_input}
          min={0}
          max={255}
          onInput={(low_input) => form.set({ low_input })}
        />
        <SliderRow
          label={t("form.sharp.highInput")}
          value={options().high_input}
          min={0}
          max={255}
          onInput={(high_input) => form.set({ high_input })}
        />
        <SliderRow
          label={t("form.sharp.gamma")}
          value={options().gamma}
          min={0.1}
          max={10}
          step={0.1}
          onInput={(gamma) => form.set({ gamma })}
        />
      </div>
      <div class={styles.grid2}>
        <NumberRow
          label={t("form.sharp.white")}
          value={options().diapason_white}
          min={-1}
          max={255}
          onInput={(diapason_white) => form.set({ diapason_white })}
        />
        <NumberRow
          label={t("form.sharp.black")}
          value={options().diapason_black}
          min={-1}
          max={255}
          onInput={(diapason_black) => form.set({ diapason_black })}
        />
      </div>
      <CheckRow
        label={t("form.sharp.canny")}
        checked={options().canny}
        onChange={(canny) => form.set({ canny })}
      />
      <Show when={options().canny}>
        <SelectRow
          label={t("form.sharp.cannyType")}
          value={options().canny_type}
          items={Object.values(CannyType)}
          onChange={(canny_type) =>
            form.set({ canny_type: canny_type as CannyType })
          }
        />
      </Show>
    </div>
  );
};
