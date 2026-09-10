import type { StackNode } from "~/types/node";
import { type Component } from "solid-js";
import { CvtType } from "~/types/enums";
import { useNodeForm, SelectRow } from "./shared";
import type { CvtColorNodeOptions } from "~/types/options";
import styles from "./forms.module.scss";

type FormProps = { node: StackNode };

export const CvtColorForm: Component<FormProps> = (props) => {
  const form = useNodeForm(() => props.node);
  const options = () => form.options() as CvtColorNodeOptions;
  return (
    <div class={styles.form}>
      <SelectRow
        label="Conversion"
        value={options().cvt_type}
        items={[
          CvtType.RGB2Gray,
          CvtType.RGB2Gray709,
          CvtType.RGB2Gray2020,
          CvtType.Gray2RGB,
        ]}
        onChange={(cvt_type) => form.set({ cvt_type: cvt_type as CvtType })}
      />
    </div>
  );
};
