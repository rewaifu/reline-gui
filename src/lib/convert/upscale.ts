import * as v from "valibot";
import type {
  ConvertToPureFunction,
  ConvertToStackFunction,
} from "~/lib/convert/index";
import { UpscaleOptionsSchema } from "~/types/options";
import { stripModelPath } from "~/lib/convert/model-name";
import { NodeType, PureNodeType } from "~/types/enums";
import { DEFAULT_COLLAPSED } from "~/constants";

// `is_own_model: false` is a UI flag: the model was picked from the mdb
// database, so the upscale spawns a Download preprocessor carrying the
// download link; the serialized upscale keeps the bare name (no extension).
// Two upscales with the same model share one Download node (dedupe by name,
// parents merged in meta).

export const convertUpscaleToPure: ConvertToPureFunction = (
  nodes,
  index,
  preprocess,
) => {
  const node = nodes[index];
  const { is_own_model, model_url, ...rest } = v.parse(
    UpscaleOptionsSchema,
    node.options,
  );
  if (is_own_model || rest.model === "") {
    // own path needs no download; an unpicked model must not spawn a
    // Download preprocessor with an empty name
    return [[{ type: PureNodeType.UPSCALE, options: rest }], index + 1];
  }
  preprocess.push({
    type: PureNodeType.DOWNLOAD,
    options:
      model_url === undefined
        ? { name: rest.model }
        : { name: rest.model, url: model_url },
    meta: node.uid ? { parents: [node.uid] } : undefined,
  });
  return [[{ type: PureNodeType.UPSCALE, options: rest }], index + 1];
};

// Import: the serialized upscale has no `is_own_model` flag — it is derived
// from the download section (current format) or from the model database
// (legacy configs keep the mounted path and carry no link at all).
const upscaleImportSchema = v.omit(UpscaleOptionsSchema, [
  "is_own_model",
  "model_url",
]);

export const convertUpscaleToStack: ConvertToStackFunction = (
  nodes,
  index,
  ctx,
) => {
  const node = nodes[index];
  const options = v.parse(upscaleImportSchema, node.options);
  const stripped = stripModelPath(options.model);
  const name = stripped ?? options.model;
  const downloaded = ctx.downloadedModels.get(name);
  // a legacy mounted path is never an own model when the database knows the
  // name — its link is what the Download preprocessor needs
  const url = downloaded ?? (stripped === null ? undefined : ctx.urlOf(name));
  const isOwn = !ctx.downloadedModels.has(name) && url === undefined;
  if (stripped !== null && !isOwn) {
    // the mounted path was replaced by the bare mdb name
    ctx.migration.models.push({ from: options.model, to: name });
  }
  if (isOwn) {
    // own model: keep the typed path (the runner resolves it itself)
    return [
      [
        {
          type: NodeType.UPSCALE,
          options: { ...options, is_own_model: true },
          collapsed: DEFAULT_COLLAPSED,
        },
      ],
      index + 1,
    ];
  }
  return [
    [
      {
        type: NodeType.UPSCALE,
        options: {
          ...options,
          model: name,
          is_own_model: false,
          ...(url === undefined ? {} : { model_url: url }),
        },
        collapsed: DEFAULT_COLLAPSED,
      },
    ],
    index + 1,
  ];
};
