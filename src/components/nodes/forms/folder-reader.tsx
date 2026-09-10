import type { StackNode } from "~/types/node";
import { type Component } from "solid-js";
import { ReaderNodeMode } from "~/types/enums";
import { useNodeForm, PathRow, SelectRow, CheckRow } from "./shared";
import type { FolderReaderNodeOptions } from "~/types/options";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

export const FolderReaderForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as FolderReaderNodeOptions;
  return (
    <div class={styles.form}>
      <PathRow
        label="Path to folder"
        placeholder="/content/drive/MyDrive/raws"
        value={options().path}
        onInput={(path) => form.set({ path })}
        source="dirs"
      />
      <SelectRow
        label="Mode"
        value={options().mode}
        items={[ReaderNodeMode.RGB, ReaderNodeMode.GRAY]}
        onChange={(mode) => form.set({ mode: mode as ReaderNodeMode })}
      />
      <CheckRow
        label="Recursive"
        checked={options().recursive}
        onChange={(recursive) => form.set({ recursive })}
      />
      <CheckRow
        label="Unarchive"
        checked={options().unarchive}
        onChange={(unarchive) => form.set({ unarchive })}
      />
    </div>
  );
};
