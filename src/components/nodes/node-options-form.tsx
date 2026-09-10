import type { Component } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { NodeType } from "~/types/enums";
import type { StackNode } from "~/types/node";
import { FolderReaderForm } from "./forms/folder-reader";
import { FolderWriterForm } from "./forms/folder-writer";
import { UpscaleForm } from "./forms/upscale";
import { SharpForm } from "./forms/sharp";
import { ResizeForm } from "./forms/resize";
import { ScreentoneForm } from "./forms/screentone";
import { LevelForm } from "./forms/level";
import { CvtColorForm } from "./forms/cvt-color";

export interface NodeFormProps {
  /** The row's node object, handed down from <For> via NodeCard. */
  node: StackNode;
}

const FORMS: Record<NodeType, Component<NodeFormProps>> = {
  [NodeType.FOLDER_READER]: FolderReaderForm,
  [NodeType.FOLDER_WRITER]: FolderWriterForm,
  [NodeType.UPSCALE]: UpscaleForm,
  [NodeType.SHARP]: SharpForm,
  [NodeType.RESIZE]: ResizeForm,
  [NodeType.SCREENTONE]: ScreentoneForm,
  [NodeType.LEVEL]: LevelForm,
  [NodeType.CVT_COLOR]: CvtColorForm,
};

/** Routes the expanded node body to its hand-crafted per-type form. */
export const NodeOptionsForm: Component<NodeFormProps> = (props) => (
  <Dynamic component={FORMS[props.node.type]} node={props.node} />
);
