import * as v from "valibot";
import { CannyType } from "~/types/enums";

export interface PureSharpNodeOptions {
  low_input: number;
  high_input: number;
  gamma: number;
  diapason_white: number;
  diapason_black: number;
  canny: boolean;
  canny_type: CannyType;
}

export const sharpNodeOptionsSchema = v.object({
  low_input: v.pipe(v.number(), v.minValue(0), v.maxValue(255)),
  high_input: v.pipe(v.number(), v.minValue(0), v.maxValue(255)),
  gamma: v.pipe(v.number(), v.minValue(0), v.maxValue(10)),
  // -1 switches the diapason off: the form's lower bound and the default
  diapason_white: v.pipe(v.number(), v.minValue(-1), v.maxValue(255)),
  diapason_black: v.pipe(v.number(), v.minValue(-1), v.maxValue(255)),
  canny: v.boolean(),
  canny_type: v.picklist(Object.values(CannyType)),
});

export type SharpNodeOptions = v.InferOutput<typeof sharpNodeOptionsSchema>;
