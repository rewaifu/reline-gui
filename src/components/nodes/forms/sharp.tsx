import type { StackNode } from "~/types/node";
import { type Component, createUniqueId } from "solid-js";
import { CannyType } from "~/types/enums";
import { useNodeForm, NumberRow, SliderRow } from "./shared";
import { Label, UiSelect, UiSwitch } from "~/components/ui";
import type { SharpNodeOptions } from "~/types/options";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";
type FormProps = { node: StackNode };
export const SharpForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as SharpNodeOptions;
  const cannyId = createUniqueId();
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
      <div class={styles.row}>
        <Label
          for={cannyId}
          onClick={(e) => {
            e.preventDefault();
            form.set({ canny: !options().canny });
          }}
        >
          {t("form.sharp.canny")}
        </Label>
        <div class={styles.inlineRow}>
          <UiSwitch
            id={cannyId}
            checked={options().canny}
            onChange={(canny) => form.set({ canny })}
            ariaLabel={t("form.sharp.canny")}
          />
          <UiSelect
            class={styles.inlineFill}
            value={options().canny_type}
            items={Object.values(CannyType)}
            onChange={(canny_type) =>
              form.set({ canny_type: canny_type as CannyType })
            }
            disabled={!options().canny}
            ariaLabel={t("form.sharp.cannyType")}
          />
        </div>
      </div>
    </div>
  );
};
