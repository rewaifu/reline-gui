import type { FromPure, ToPure } from "~/lib/nodes/types";
import type { ScreentoneNodeOptions } from "~/types/options";
import { HalftoneMode, PureNodeType } from "~/types/enums";

const unwrap = (value: unknown) =>
  Array.isArray(value) && value.length === 1 ? value[0] : value;

// gray and hsv drive a single dot grid (hsv works the V channel only), so
// the wire carries scalars: an old stored hsv tree may still hold one value
// per former H/S/V channel, and the backend parses only the first of those.
const first = <T>(value: T | T[]): T =>
  Array.isArray(value) ? (value[0] as T) : value;

export const convertScreentoneToPure: ToPure = (node) => {
  const options = node.options as ScreentoneNodeOptions;
  const single =
    options.halftone_mode === HalftoneMode.GRAY ||
    options.halftone_mode === HalftoneMode.HSV;
  return [
    {
      type: PureNodeType.HALFTONE,
      options: {
        ...options,
        ssaa_scale: options.ssaa_scale ? options.ssaa_scale : undefined,
        ssaa_filter: options.ssaa_scale ? options.ssaa_filter : undefined,
        dot_size: single ? first(options.dot_size) : unwrap(options.dot_size),
        angle: single ? first(options.angle) : unwrap(options.angle),
        dot_type: single ? first(options.dot_type) : unwrap(options.dot_type),
      },
    },
  ];
};

/** The wire options are the node's own; the editor has no extra flags here. */
export const convertHalftoneToStack: FromPure = (node) => ({
  ...node.options,
});
