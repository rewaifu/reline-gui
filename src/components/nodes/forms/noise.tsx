import type { StackNode } from "~/types/node";
import { type Component, createUniqueId } from "solid-js";
import { useNodeForm, SliderRow, SelectRow, NumberField } from "./shared";
import { Label, UiSwitch } from "~/components/ui";
import { NoiseMode, type NoiseNodeOptions } from "~/types/options/noise";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

export const NoiseForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as NoiseNodeOptions;
  const seedId = createUniqueId();
  // off = null (backend default: non-deterministic); on with nothing typed = 0
  const seedOn = () => options().seed !== null;
  const setSeed = (on: boolean) =>
    form.set({ seed: on ? (options().seed ?? 0) : null });
  return (
    <div class={styles.form}>
      <div class={styles.grid2}>
        <SliderRow
          label={t("form.noise.a")}
          value={options().a}
          min={0.01}
          max={10}
          step={0.01}
          onInput={(a) => form.set({ a })}
        />
        <SliderRow
          label={t("form.noise.b")}
          value={options().b}
          min={0.01}
          max={10}
          step={0.01}
          onInput={(b) => form.set({ b })}
        />
      </div>
      <SliderRow
        label={t("form.noise.alpha")}
        value={options().alpha}
        min={0}
        max={1}
        step={0.01}
        onInput={(alpha) => form.set({ alpha })}
      />
      <div class={styles.grid2}>
        <SliderRow
          label={t("form.noise.thMin")}
          value={options().th_min}
          min={0}
          max={255}
          onInput={(th_min) => form.set({ th_min })}
        />
        <SliderRow
          label={t("form.noise.thMax")}
          value={options().th_max}
          min={0}
          max={255}
          onInput={(th_max) => form.set({ th_max })}
        />
      </div>
      <SelectRow
        label={t("form.noise.noiseMode")}
        value={options().noise_mode}
        items={Object.values(NoiseMode)}
        onChange={(noise_mode) =>
          form.set({ noise_mode: noise_mode as NoiseMode })
        }
      />
      <div class={styles.row}>
        <Label
          for={seedId}
          onClick={(e) => {
            e.preventDefault();
            setSeed(!seedOn());
          }}
        >
          {t("form.noise.seed")}
        </Label>
        <div class={styles.inlineRow}>
          <UiSwitch
            id={seedId}
            checked={seedOn()}
            onChange={setSeed}
            ariaLabel={t("form.noise.seed")}
          />
          <NumberField
            class={styles.inlineFill}
            label={t("form.noise.seed")}
            value={options().seed ?? undefined}
            min={0}
            step={1}
            onInput={(seed) => form.set({ seed })}
            disabled={!seedOn()}
          />
        </div>
      </div>
    </div>
  );
};
