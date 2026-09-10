import * as v from "valibot";
import type {
  ConvertToPureFunction,
  ConvertToStackFunction,
} from "~/lib/convert/index";
import { folderReaderOptionsSchema } from "~/types/options";
import { ReaderNodeMode, NodeType, PureNodeType } from "~/types/enums";
import { DEFAULT_COLLAPSED } from "~/constants";

// `unarchive: true` is a UI flag of the reader: it spawns one Unarchive
// preprocessor for `${path}.zip`. The serialized reader itself never
// carries the flag; ownership is recorded in `meta.parents` by uid.

export const convertFolderReaderToPure: ConvertToPureFunction = (
  nodes,
  index,
  preprocess,
) => {
  const node = nodes[index];
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
  return [
    [{ type: PureNodeType.FOLDER_READER, options: pureOptions }],
    index + 1,
  ];
};

// Import: the serialized reader has no `unarchive` flag — it is derived from
// the preprocess section (an unarchive node for the same base path).
const readerImportSchema = v.object({
  path: v.string(),
  mode: v.picklist(Object.values(ReaderNodeMode)),
  recursive: v.boolean(),
});

export const convertFolderReaderToStack: ConvertToStackFunction = (
  nodes,
  index,
  ctx,
) => {
  const node = nodes[index];
  const parsed = v.parse(readerImportSchema, node.options);
  const options = {
    ...parsed,
    unarchive: ctx.unarchivedPaths.has(parsed.path),
  };
  return [
    [
      {
        type: NodeType.FOLDER_READER,
        options,
        collapsed: DEFAULT_COLLAPSED,
      },
    ],
    index + 1,
  ];
};
