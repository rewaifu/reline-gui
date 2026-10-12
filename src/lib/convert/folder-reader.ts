import * as v from "valibot";
import type { FromPure, ToPure } from "~/lib/nodes/types";
import { folderReaderOptionsSchema } from "~/types/options";
import { ReaderNodeMode, PureNodeType } from "~/types/enums";

// `unarchive: true` is a UI flag of the reader: it spawns one Unarchive
// preprocessor for `${path}.zip`. The serialized reader itself never
// carries the flag; ownership is recorded in `meta.parents` by uid.

export const convertFolderReaderToPure: ToPure = (node, { preprocess }) => {
  const { unarchive, ...pureOptions } = v.parse(
    folderReaderOptionsSchema,
    node.options,
  );
  if (unarchive) {
    preprocess.push({
      type: PureNodeType.UNARCHIVE,
      options: { path: `${pureOptions.path}.zip` },
      meta: node.uid ? { parents: [node.uid] } : undefined,
    });
  }
  return [{ type: PureNodeType.FOLDER_READER, options: pureOptions }];
};

// Import: the serialized reader has no `unarchive` flag — it is derived from
// the preprocess section (an unarchive node for the same base path).
const readerImportSchema = v.object({
  path: v.string(),
  mode: v.picklist(Object.values(ReaderNodeMode)),
  recursive: v.boolean(),
});

export const convertFolderReaderToStack: FromPure = (node, ctx) => {
  const parsed = v.parse(readerImportSchema, node.options);
  return { ...parsed, unarchive: ctx.unarchivedPaths.has(parsed.path) };
};
