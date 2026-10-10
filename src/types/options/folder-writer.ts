import * as v from "valibot";
import { PsdFit, WriterNodeFormat } from "~/types/enums";

export interface PureFolderWriterNodeOptions {
  path: string;
  format: WriterNodeFormat;
}

export const folderWriterOptionsSchema = v.object({
  path: v.string(),
  format: v.picklist(Object.values(WriterNodeFormat)),
  /** Switched-on PSD block: emitted as a `psd_postprocess` entry of the
   * `postprocess` config section (never sent on the node itself). Newer keys
   * default so older stores/trees keep parsing. */
  postprocess: v.optional(
    v.object({
      psd: v.object({
        source_path: v.optional(v.string(), ""),
        fit: v.optional(v.picklist(Object.values(PsdFit)), PsdFit.ORIGINAL),
        enabled: v.optional(v.boolean(), false),
        delete_originals: v.optional(v.boolean(), false),
      }),
    }),
  ),
  /** Empty the output folder in a `cleandir` preprocessor before the run. */
  clean_before: v.boolean(),
});

export type FolderWriterNodeOptions = v.InferOutput<
  typeof folderWriterOptionsSchema
>;
