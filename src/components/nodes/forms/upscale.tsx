import type { StackNode } from "~/types/node";
import { type Component, Show } from "solid-js";
import { DType, TilerType } from "~/types/enums";
import { useNodeForm, PathRow, NumberRow, SelectRow, CheckRow } from "./shared";
import type { UpscaleNodeOptions } from "~/types/options";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

export const UpscaleForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as UpscaleNodeOptions;
  return (
    <div class={styles.form}>
      <PathRow
        label="Model"
        placeholder={
          options().is_own_model
            ? "/content/models/4x_wtp_MangaScale_UltraSharp"
            : "Model name"
        }
        value={options().model}
        onInput={(model) => form.set({ model, model_url: undefined })}
        onPick={(_, meta) => form.set({ model_url: meta.url })}
        source={options().is_own_model ? "weights" : "mdb"}
      />
      <CheckRow
        label="Own model"
        checked={options().is_own_model}
        onChange={(is_own_model) => form.set({ is_own_model })}
      />
      <div class={styles.grid2}>
        <SelectRow
          label="DType"
          value={options().dtype}
          items={[DType.F32, DType.F16, DType.BF16]}
          onChange={(dtype) => form.set({ dtype: dtype as DType })}
        />
        <SelectRow
          label="Tiler"
          value={options().tiler}
          items={[TilerType.EXACT, TilerType.NO_TILING]}
          onChange={(tiler) => form.set({ tiler: tiler as TilerType })}
        />
      </div>
      <Show when={options().tiler === TilerType.EXACT}>
        <NumberRow
          label="Exact tiler size"
          value={options().exact_tiler_size}
          min={0}
          step={128}
          onInput={(exact_tiler_size) => form.set({ exact_tiler_size })}
        />
      </Show>
      <CheckRow
        label="Allow CPU upscale"
        checked={options().allow_cpu_upscale}
        onChange={(allow_cpu_upscale) => form.set({ allow_cpu_upscale })}
      />
      <NumberRow
        label="Target scale (optional)"
        value={options().target_scale}
        min={0}
        step={0.5}
        onInput={(target_scale) => form.set({ target_scale })}
      />
    </div>
  );
};
