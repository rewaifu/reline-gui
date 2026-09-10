import type { StackNode } from "~/types/node";
import { type Component } from "solid-js";
import { ReaderNodeMode } from "~/types/enums";
import { useNodeForm, PathRow, SelectRow, CheckRow } from "./shared";
import type { FolderReaderNodeOptions } from "~/types/options";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

export const FolderReaderForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as FolderReaderNodeOptions;
  return (
    <div class={styles.form}>
      <PathRow
        label={t("form.folder_reader.path")}
        placeholder="raws"
        value={options().path}
        onInput={(path) => form.set({ path })}
        source="dirs"
      />
      <SelectRow
        label={t("form.folder_reader.mode")}
        value={options().mode}
        items={Object.values(ReaderNodeMode)}
        onChange={(mode) => form.set({ mode: mode as ReaderNodeMode })}
      />
      <CheckRow
        label={t("form.folder_reader.recursive")}
        checked={options().recursive}
        onChange={(recursive) => form.set({ recursive })}
      />
      <CheckRow
        label={t("form.folder_reader.unarchive")}
        checked={options().unarchive}
        onChange={(unarchive) => form.set({ unarchive })}
      />
    </div>
  );
};
