import * as v from "valibot";

export const NoiseMode = {
  GRAY: "gray",
  RGB: "rgb",
  CHROME: "chrome",
} as const;
export type NoiseMode = (typeof NoiseMode)[keyof typeof NoiseMode];

export const noiseOptionsSchema = v.object({
  a: v.pipe(v.number(), v.minValue(0.01)),
  b: v.pipe(v.number(), v.minValue(0.01)),
  alpha: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  noise_mode: v.picklist([NoiseMode.GRAY, NoiseMode.RGB, NoiseMode.CHROME]),
  th_min: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(255)),
  th_max: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(255)),
  seed: v.nullable(v.pipe(v.number(), v.integer())),
});

export type NoiseNodeOptions = v.InferOutput<typeof noiseOptionsSchema>;

/** Same shape on the wire: no UI-only flags to strip. */
export type PureNoiseNodeOptions = NoiseNodeOptions;
