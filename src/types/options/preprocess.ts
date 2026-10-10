import * as v from "valibot";

// Pure-only preprocess options. These nodes never exist in the UI stack:
// they are generated from parent nodes (Upscale / FolderReader) at
// serialization and referenced back through `meta.parents`.

export const downloadOptionsSchema = v.object({
  name: v.string(),
  /** direct mdb link when the name was picked from the model database */
  url: v.optional(v.string()),
});

export const unarchiveOptionsSchema = v.object({
  path: v.string(),
});

export const cleandirOptionsSchema = v.object({
  path: v.string(),
});
