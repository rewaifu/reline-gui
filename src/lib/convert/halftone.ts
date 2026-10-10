import type {
  ConvertToPureFunction,
  ConvertToStackFunction,
} from "~/lib/convert/index";
import type { ScreentoneNodeOptions } from "~/types/options";
import { HalftoneMode, NodeType, PureNodeType } from "~/types/enums";
import { DEFAULT_COLLAPSED } from "~/constants";

const unwrap = (value: unknown) =>
  Array.isArray(value) && value.length === 1 ? value[0] : value;

// gray and hsv drive a single dot grid (hsv works the V channel only), so
// the wire carries scalars: an old stored hsv tree may still hold one value
// per former H/S/V channel, and the backend parses only the first of those.
const first = <T>(value: T | T[]): T =>
  Array.isArray(value) ? (value[0] as T) : value;

export const convertScreentoneToPure: ConvertToPureFunction = (
  nodes,
  index,
) => {
  const node = nodes[index];
  const options = node.options as ScreentoneNodeOptions;
  const single =
    options.halftone_mode === HalftoneMode.GRAY ||
    options.halftone_mode === HalftoneMode.HSV;
  return [
    [
      {
        type: PureNodeType.HALFTONE,
        options: {
          ...options,
          ssaa_scale: options.ssaa_scale ? options.ssaa_scale : undefined,
          ssaa_filter: options.ssaa_scale ? options.ssaa_filter : undefined,
          dot_size: single ? first(options.dot_size) : unwrap(options.dot_size),
          angle: single ? first(options.angle) : unwrap(options.angle),
          dot_type: single ? first(options.dot_type) : unwrap(options.dot_type),
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
