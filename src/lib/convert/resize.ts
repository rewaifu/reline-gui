import type {
  ConvertToPureFunction,
  ConvertToStackFunction,
} from "~/lib/convert/index";
import type { PureResizeOptions, ResizeNodeOptions } from "~/types/options";
import { NodeType, PureNodeType, ResizeType } from "~/types/enums";
import { DEFAULT_COLLAPSED } from "~/constants";

export const convertResizeToPure: ConvertToPureFunction = (nodes, index) => {
  const node = nodes[index];
  const { resize_type: _resize_type, ...options } =
    node.options as ResizeNodeOptions;
  return [
    [
      {
        type: PureNodeType.RESIZE,
        options,
      },
    ],
    index + 1,
  ];
};

const getResizeType = (options: PureResizeOptions): ResizeType => {
  if (options.width && !options.height) return ResizeType.BY_WIDTH;
  if (!options.width && options.height) return ResizeType.BY_HEIGHT;
  if (options.width && options.height) return ResizeType.ABSOLUTE;
  if (options.percent) return ResizeType.PERCENT;
  return ResizeType.ABSOLUTE;
};

export const convertResizeToStack: ConvertToStackFunction = (nodes, index) => {
  const node = nodes[index];
  const options = node.options as PureResizeOptions;
  return [
    [
      {
        type: NodeType.RESIZE,
        options: {
          ...options,
          resize_type: getResizeType(options),
        },
        collapsed: DEFAULT_COLLAPSED,
      },
    ],
    index + 1,
  ];
};
