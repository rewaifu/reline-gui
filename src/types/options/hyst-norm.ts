import * as v from "valibot";

/** Bounds mirror `Params::new` in pepe_addon (`BINS = 256`): the wire takes
 * numbers, the backend rejects out-of-range ones with a run error. */
export const hystNormOptionsSchema = v.object({
  blur_n: v.pipe(v.number(), v.minValue(0), v.maxValue(1024)),
  window_radius: v.pipe(v.number(), v.minValue(1), v.maxValue(255)),
  min_prominence: v.pipe(v.number(), v.minValue(0)),
  min_distance: v.pipe(v.number(), v.minValue(1), v.maxValue(255)),
  percentage: v.pipe(v.number(), v.minValue(0)),
});

export type HystNormNodeOptions = v.InferOutput<typeof hystNormOptionsSchema>;

/** Same shape on the wire: no UI-only flags to strip. */
export type PureHystNormNodeOptions = HystNormNodeOptions;
