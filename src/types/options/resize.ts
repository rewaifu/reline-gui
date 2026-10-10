import * as v from "valibot";
import { FilterType, ResizeType } from "~/types/enums";

export interface PureResizeOptions {
  width?: number;
  height?: number;
  percent?: number;
  filter: FilterType;
  spread: boolean;
  spread_size?: number;
}

export const resizeOptionsSchema = v.object({
  resize_type: v.picklist(Object.values(ResizeType)),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  percent: v.optional(v.number()),
  filter: v.picklist(Object.values(FilterType)),
  spread: v.boolean(),
  spread_size: v.optional(v.number()),
});

export type ResizeNodeOptions = v.InferOutput<typeof resizeOptionsSchema>;

export type ResizeSizeParam = "width" | "height" | "percent";

/** Backend picks the resize mode by which size param is present, so each
 * mode keeps only its own param on the node. The other values survive in
 * localStorage and are restored when their mode comes back. */
export const RESIZE_MODE_PARAMS: Record<
  ResizeType,
  readonly ResizeSizeParam[]
> = {
  [ResizeType.BY_WIDTH]: ["width"],
  [ResizeType.BY_HEIGHT]: ["height"],
  [ResizeType.ABSOLUTE]: ["width", "height"],
  [ResizeType.PERCENT]: ["percent"],
};
