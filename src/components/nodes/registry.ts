import type { NodeOptions } from "~/types/node";
import { NodeType } from "~/types/enums";
import { DEFAULT_NODE_OPTIONS } from "~/constants";

export interface NodeDef {
  type: NodeType;
  label: string;
  /**
   * The options a new node of this type starts with — always the matching
   * entry of DEFAULT_NODE_OPTIONS. No per-type copies here: duplicated
   * default data drifted within weeks (folder_reader modes, resize width,
   * screentone dot size all disagreed with the constants).
   */
  defaults: NodeOptions;
}

export const NODE_DEFS: Record<NodeType, NodeDef> = {
  [NodeType.FOLDER_READER]: {
    type: NodeType.FOLDER_READER,
    label: "Folder Reader",
    defaults: DEFAULT_NODE_OPTIONS.folder_reader,
  },
  [NodeType.FOLDER_WRITER]: {
    type: NodeType.FOLDER_WRITER,
    label: "Folder Writer",
    defaults: DEFAULT_NODE_OPTIONS.folder_writer,
  },
  [NodeType.UPSCALE]: {
    type: NodeType.UPSCALE,
    label: "Upscale",
    defaults: DEFAULT_NODE_OPTIONS.upscale,
  },
  [NodeType.RESIZE]: {
    type: NodeType.RESIZE,
    label: "Resize",
    defaults: DEFAULT_NODE_OPTIONS.resize,
  },
  [NodeType.SHARP]: {
    type: NodeType.SHARP,
    label: "Sharp",
    defaults: DEFAULT_NODE_OPTIONS.sharp,
  },
  [NodeType.LEVEL]: {
    type: NodeType.LEVEL,
    label: "Level",
    defaults: DEFAULT_NODE_OPTIONS.level,
  },
  [NodeType.CVT_COLOR]: {
    type: NodeType.CVT_COLOR,
    label: "Cvt Color",
    defaults: DEFAULT_NODE_OPTIONS.cvt_color,
  },
  [NodeType.SCREENTONE]: {
    type: NodeType.SCREENTONE,
    label: "Screentone",
    defaults: DEFAULT_NODE_OPTIONS.screentone,
  },
};

export const NODE_ORDER: readonly NodeType[] = Object.values(NodeType);
