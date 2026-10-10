import type {
  ConvertToPureFunction,
  ConvertToStackFunction,
} from "~/lib/convert/index";
import type { PureResizeOptions, ResizeNodeOptions } from "~/types/options";
import { RESIZE_MODE_PARAMS } from "~/types/options/resize";
import { NodeType, PureNodeType, ResizeType } from "~/types/enums";
import { DEFAULT_COLLAPSED } from "~/constants";

export const convertResizeToPure: ConvertToPureFunction = (nodes, index) => {
  const node = nodes[index];
  const o = node.options as ResizeNodeOptions;
  // The backend picks the mode by which size param is present: a stale width
  // resurrected from defaults (or an old stored tree) next to a height would
  // read as `absolute`. Emit only the current mode's own param.
  const size: Partial<PureResizeOptions> = {};
  for (const key of RESIZE_MODE_PARAMS[o.resize_type] ?? []) size[key] = o[key];
  const { width: _w, height: _h, percent: _p, resize_type: _t, ...rest } = o;
  return [
    [
      {
        type: PureNodeType.RESIZE,
        options: { ...rest, ...size },
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
