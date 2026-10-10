import * as v from "valibot";
import { PsdFit } from "~/types/enums";

/** One `psd_postprocess` entry of the `postprocess` config section. `path`
 * is the writer's own output folder (the pass composes into `psd/` inside
 * it); `parents` on the entry names the stack uid that spawned it. */
export const psdPostprocessOptionsSchema = v.object({
  path: v.string(),
  source_path: v.string(),
  fit: v.picklist(Object.values(PsdFit)),
  delete_originals: v.boolean(),
});

export type PurePostprocessNodeOptions = v.InferOutput<
  typeof psdPostprocessOptionsSchema
>;
