import * as v from "valibot";
import type {
  ConvertToPureFunction,
  ConvertToStackFunction,
} from "~/lib/convert/index";
import { folderWriterOptionsSchema } from "~/types/options";
import { NodeType, PureNodeType } from "~/types/enums";
import { DEFAULT_COLLAPSED } from "~/constants";

// `clean_before: true` is a UI flag of the writer: it spawns one Cleandir
// preprocessor for `path`. A switched-on PSD block spawns one `psd_postprocess`
// entry of the `postprocess` section carrying the writer's own path (the pass
// composes into `psd/` inside it). Neither flag is sent on the node itself;
// ownership is recorded in `meta.parents` by uid (same as unarchive).

export const convertFolderWriterToPure: ConvertToPureFunction = (
  nodes,
  index,
  preprocess,
  postprocess,
) => {
  const node = nodes[index];
  const stored = node.options as Record<string, unknown>;
  const {
    clean_before,
    postprocess: psdBlock,
    ...pureOptions
    // old stores predate these flags: backfill, don't crash the whole page
  } = v.parse(folderWriterOptionsSchema, {
    ...stored,
    clean_before: stored.clean_before ?? false,
    ...(stored.postprocess === undefined
      ? {}
      : { postprocess: stored.postprocess }),
  });
  if (clean_before) {
    preprocess.push({
      type: PureNodeType.CLEANDIR,
      options: { path: pureOptions.path },
      meta: node.uid ? { parents: [node.uid] } : undefined,
    });
  }
  const psd = psdBlock?.psd;
  if (psd !== undefined && psd.enabled) {
    postprocess.push({
      type: PureNodeType.PSD_POSTPROCESS,
      options: {
        path: pureOptions.path,
        source_path: psd.source_path,
        fit: psd.fit,
        delete_originals: psd.delete_originals ?? false,
      },
      meta: node.uid ? { parents: [node.uid] } : undefined,
    });
  }
  return [
    [{ type: PureNodeType.FOLDER_WRITER, options: pureOptions }],
    index + 1,
  ];
};

// Import: the serialized writer carries neither UI flag — `clean_before` comes
// from the preprocess section (a cleandir node for the same path), the PSD
// block from the postprocess section (the entry whose `path` is this writer's
// own output path; uids are reminted on every import, paths are stable).
export const convertFolderWriterToStack: ConvertToStackFunction = (
  nodes,
  index,
  ctx,
) => {
  const node = nodes[index];
  const parsed = v.parse(folderWriterOptionsSchema, {
    ...(node.options as Record<string, unknown>),
    clean_before: false,
    postprocess: undefined,
  });
  const { postprocess: _dropped, ...rest } = parsed;
  void _dropped;
  const owned = ctx.postprocessByParent.get(parsed.path);
  const options = {
    ...rest,
    clean_before: ctx.cleanedPaths.has(parsed.path),
    ...(owned === undefined
      ? {}
      : {
          postprocess: {
            psd: {
              source_path: owned.source_path,
              fit: owned.fit,
              enabled: true,
              delete_originals: owned.delete_originals,
            },
          },
        }),
  };
  return [
    [
      {
        type: NodeType.FOLDER_WRITER,
        options,
        collapsed: DEFAULT_COLLAPSED,
      },
    ],
    index + 1,
  ];
};
