import type { StackNode } from "~/types/node";
import { type Component, Show, createUniqueId } from "solid-js";
import { PsdFit, WriterNodeFormat } from "~/types/enums";
import { useNodeForm, CheckRow, PathRow, SelectRow } from "./shared";
import { Label, UiSelect, UiSwitch } from "~/components/ui";
import type { FolderWriterNodeOptions } from "~/types/options";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";
type FormProps = { node: StackNode };

export const FolderWriterForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as FolderWriterNodeOptions;
  const psdId = createUniqueId();
  const psd = () => options().postprocess?.psd;
  // the block exists whenever the paths are filled; `enabled` toggles the run
  const psdOn = () => psd()?.enabled === true;
  const setPsd = (
    patch: Partial<{
      source_path: string;
      fit: PsdFit;
      enabled: boolean;
      delete_originals: boolean;
    }>,
  ) =>
    form.set({
      postprocess: {
        psd: {
          source_path: psd()?.source_path ?? "",
          fit: psd()?.fit ?? PsdFit.ORIGINAL,
          enabled: psd()?.enabled ?? false,
          delete_originals: psd()?.delete_originals ?? false,
          ...patch,
        },
      },
    });
  return (
    <div class={styles.form}>
      <PathRow
        label={t("form.folder_writer.path")}
        placeholder="/content/drive/MyDrive/output"
        value={options().path}
        onInput={(path) => form.set({ path })}
        source="dirs"
      />
      <SelectRow
        label={t("form.folder_writer.format")}
        value={options().format}
        items={Object.values(WriterNodeFormat)}
        onChange={(format) => form.set({ format: format as WriterNodeFormat })}
      />
      <div class={styles.row}>
        <Label
          for={psdId}
          onClick={(e) => {
            e.preventDefault();
            setPsd({ enabled: !psdOn() });
          }}
        >
          {t("form.folder_writer.psd")}
        </Label>
        <div class={styles.inlineRow}>
          <UiSwitch
            id={psdId}
            checked={psdOn()}
            onChange={(enabled) => setPsd({ enabled })}
            ariaLabel={t("form.folder_writer.psd")}
          />
          <UiSelect
            class={styles.inlineFill}
            value={psd()?.fit ?? PsdFit.ORIGINAL}
            items={Object.values(PsdFit)}
            onChange={(fit) => setPsd({ fit: fit as PsdFit })}
            ariaLabel={t("form.folder_writer.psdFit")}
          />
        </div>
        <PathRow
          label={t("form.folder_writer.psdSource")}
          placeholder="/content/drive/MyDrive/raws"
          value={psd()?.source_path ?? ""}
          onInput={(source_path) => setPsd({ source_path })}
          source="dirs"
        />
        <Show when={psdOn()}>
          <CheckRow
            label={t("form.folder_writer.psdDelete")}
            checked={psd()?.delete_originals ?? false}
            onChange={(delete_originals) => setPsd({ delete_originals })}
          />
        </Show>
      </div>
      <CheckRow
        label={t("form.folder_writer.cleanBefore")}
        checked={options().clean_before}
        onChange={(clean_before) => form.set({ clean_before })}
      />
    </div>
  );
};
