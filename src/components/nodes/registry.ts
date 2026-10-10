import type { NodeOptions } from "~/types/node";
import { NodeType } from "~/types/enums";
import { DEFAULT_NODE_OPTIONS } from "~/constants";
import { t, type MessageKey } from "~/lib/i18n";

export interface NodeDef {
  type: NodeType;
  /** Dictionary key of the name; resolve it through `nodeLabel`. */
  labelKey: MessageKey;
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
    labelKey: "node.folder_reader",
    defaults: DEFAULT_NODE_OPTIONS.folder_reader,
  },
  [NodeType.FOLDER_WRITER]: {
    type: NodeType.FOLDER_WRITER,
    labelKey: "node.folder_writer",
    defaults: DEFAULT_NODE_OPTIONS.folder_writer,
  },
  [NodeType.UPSCALE]: {
    type: NodeType.UPSCALE,
    labelKey: "node.upscale",
    defaults: DEFAULT_NODE_OPTIONS.upscale,
  },
  [NodeType.RESIZE]: {
    type: NodeType.RESIZE,
    labelKey: "node.resize",
    defaults: DEFAULT_NODE_OPTIONS.resize,
  },
  [NodeType.SHARP]: {
    type: NodeType.SHARP,
    labelKey: "node.sharp",
    defaults: DEFAULT_NODE_OPTIONS.sharp,
  },
  [NodeType.LEVEL]: {
    type: NodeType.LEVEL,
    labelKey: "node.level",
    defaults: DEFAULT_NODE_OPTIONS.level,
  },
  [NodeType.CVT_COLOR]: {
    type: NodeType.CVT_COLOR,
    labelKey: "node.cvt_color",
    defaults: DEFAULT_NODE_OPTIONS.cvt_color,
  },
  [NodeType.SCREENTONE]: {
    type: NodeType.SCREENTONE,
    labelKey: "node.screentone",
    defaults: DEFAULT_NODE_OPTIONS.screentone,
  },
  [NodeType.HYST_NORM]: {
    type: NodeType.HYST_NORM,
    labelKey: "node.hyst_norm",
    defaults: DEFAULT_NODE_OPTIONS.hyst_norm,
  },
  [NodeType.NOISE]: {
    type: NodeType.NOISE,
    labelKey: "node.noise",
    defaults: DEFAULT_NODE_OPTIONS.noise,
  },
};

/** The node's name in the current language. Call it where the name renders —
 * a stored `t(...)` result would freeze the language. */
export const nodeLabel = (type: NodeType): string =>
  t(NODE_DEFS[type].labelKey);

export const NODE_ORDER: readonly NodeType[] = Object.values(NodeType);
