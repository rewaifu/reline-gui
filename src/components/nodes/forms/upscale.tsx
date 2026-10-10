import type { StackNode } from "~/types/node";
import { type Component, Show, createUniqueId } from "solid-js";
import { DType, TilerType } from "~/types/enums";
import {
  useNodeForm,
  PathRow,
  NumberRow,
  NumberField,
  SelectRow,
  CheckRow,
} from "./shared";
import { Label, UiSwitch } from "~/components/ui";
import type { UpscaleNodeOptions } from "~/types/options";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

export const UpscaleForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as UpscaleNodeOptions;
  const scaleId = createUniqueId();
  // off = the key is absent (undefined is dropped by the serializers), so an
  // unticked scale never reaches the config; on with nothing typed = 1
  const scaleOn = () => options().target_scale !== undefined;
  const setScale = (on: boolean) =>
    form.set({ target_scale: on ? (options().target_scale ?? 1) : undefined });
  return (
    <div class={styles.form}>
      <PathRow
        label={t("form.upscale.model")}
        placeholder={
          options().is_own_model
            ? "/content/models/4x_wtp_MangaScale_UltraSharp"
            : t("form.upscale.modelPlaceholder")
        }
        value={options().model}
        onInput={(model) => form.set({ model, model_url: undefined })}
        onPick={(_, meta) => form.set({ model_url: meta.url })}
        source={options().is_own_model ? "weights" : "mdb"}
      />
      <CheckRow
        label={t("form.upscale.own")}
        checked={options().is_own_model}
        onChange={(is_own_model) => form.set({ is_own_model })}
      />
      <div class={styles.grid2}>
        <SelectRow
          label={t("form.upscale.dtype")}
          value={options().dtype}
          items={Object.values(DType)}
          onChange={(dtype) => form.set({ dtype: dtype as DType })}
        />
        <SelectRow
          label={t("form.upscale.tiler")}
          value={options().tiler}
          items={Object.values(TilerType)}
          onChange={(tiler) => form.set({ tiler: tiler as TilerType })}
        />
      </div>
      <Show when={options().tiler === TilerType.EXACT}>
        <NumberRow
          label={t("form.upscale.exactSize")}
          value={options().exact_tiler_size}
          min={0}
          step={128}
          onInput={(exact_tiler_size) => form.set({ exact_tiler_size })}
        />
      </Show>
      <CheckRow
        label={t("form.upscale.allowCpu")}
        checked={options().allow_cpu_upscale}
        onChange={(allow_cpu_upscale) => form.set({ allow_cpu_upscale })}
      />
      <div class={styles.row}>
        <Label
          for={scaleId}
          onClick={(e) => {
            e.preventDefault();
            setScale(!scaleOn());
          }}
        >
          {t("form.upscale.targetScale")}
        </Label>
        <div class={styles.inlineRow}>
          <UiSwitch
            id={scaleId}
            checked={scaleOn()}
            onChange={setScale}
            ariaLabel={t("form.upscale.targetScale")}
          />
          <NumberField
            class={styles.inlineFill}
            label={t("form.upscale.targetScale")}
            value={options().target_scale}
            min={0}
            step={0.5}
            onInput={(target_scale) => form.set({ target_scale })}
            disabled={!scaleOn()}
          />
        </div>
      </div>
    </div>
  );
};
