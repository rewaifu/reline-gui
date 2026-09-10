import type {
  ConvertToPureFunction,
  ConvertToStackFunction,
} from "~/lib/convert/index";
import type { ScreentoneNodeOptions } from "~/types/options";
import { NodeType, PureNodeType } from "~/types/enums";
import { DEFAULT_COLLAPSED } from "~/constants";

const unwrap = (value: unknown) =>
  Array.isArray(value) && value.length === 1 ? value[0] : value;

export const convertScreentoneToPure: ConvertToPureFunction = (
  nodes,
  index,
) => {
  const node = nodes[index];
  const options = node.options as ScreentoneNodeOptions;
  return [
    [
      {
        type: PureNodeType.HALFTONE,
        options: {
          ...options,
          ssaa_scale: options.ssaa_scale ? options.ssaa_scale : undefined,
          ssaa_filter: options.ssaa_scale ? options.ssaa_filter : undefined,
          dot_size: unwrap(options.dot_size),
          angle: unwrap(options.angle),
          dot_type: unwrap(options.dot_type),
        } as ScreentoneNodeOptions,
      },
    ],
    index + 1,
  ];
};

export const convertHalftoneToStack: ConvertToStackFunction = (
  nodes,
  index,
) => {
  const node = nodes[index];
  const options = node.options as ScreentoneNodeOptions;
  return [
    [
      {
        type: NodeType.SCREENTONE,
        options: options,
        collapsed: DEFAULT_COLLAPSED,
      },
    ],
    index + 1,
  ];
};
