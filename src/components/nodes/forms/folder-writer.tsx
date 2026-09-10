import type { StackNode } from "~/types/node";
import { type Component } from "solid-js";
import { WriterNodeFormat } from "~/types/enums";
import { useNodeForm, PathRow, SelectRow } from "./shared";
import type { FolderWriterNodeOptions } from "~/types/options";
import { t } from "~/lib/i18n";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

export const FolderWriterForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as FolderWriterNodeOptions;
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
    </div>
  );
};
