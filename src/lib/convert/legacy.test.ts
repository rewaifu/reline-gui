import { describe, expect, it } from "vitest";
import { nodesToString, stringToNodes } from "~/lib/config";
import type { LegacyMigration } from "~/lib/convert";
import { DType, NodeType, TilerType } from "~/types/enums";

const MODEL = "4x_DWTP_DS_ATDl2";
const URL = `https://bucket.yor.ovh/torch_models/${MODEL}.tar.xz`;
const RAW_DIR = "/content/drive/MyDrive/raws";
const RAW_ZIP = `${RAW_DIR}.zip`;

/** The pre-preprocess format: a bare array, `download`/`unarchive` inline in
 * the pipeline and models addressed by their mounted path. */
const LEGACY = JSON.stringify([
  { type: "unarchive", options: { path: RAW_DIR } },
  {
    type: "folder_reader",
    options: { path: RAW_DIR, recursive: false, mode: "rgb" },
  },
  { type: "download", options: { name: MODEL } },
  {
    type: "upscale",
    options: {
      model: `/content/models/${MODEL}.pth`,
      dtype: "F32",
      tiler: "exact",
      exact_tiler_size: 800,
      allow_cpu_upscale: false,
    },
  },
]);

/** Import against a stub model database holding exactly one entry. */
const importConfig = (text: string) => {
  const migrations: LegacyMigration[] = [];
  const nodes = stringToNodes(text, {
    urlOf: (name) => (name === MODEL ? URL : undefined),
    onLegacy: (m) => {
      migrations.push(m);
    },
  });
  return { nodes, migration: migrations[0] };
};

describe("legacy flat config import", () => {
  it("rewrites the mounted model path to the mdb name and finds its link", () => {
    const { nodes } = importConfig(LEGACY);
    expect(nodes.map((n) => n.type)).toEqual([
      NodeType.FOLDER_READER,
      NodeType.UPSCALE,
    ]);
    expect(nodes[1].options).toEqual({
      model: MODEL,
      is_own_model: false,
      model_url: URL,
      dtype: DType.F32,
      tiler: TilerType.EXACT,
      exact_tiler_size: 800,
      allow_cpu_upscale: false,
    });
  });

  it("turns the inline unarchive into the reader flag", () => {
    const { nodes } = importConfig(LEGACY);
    expect(nodes[0].options).toEqual({
      path: RAW_DIR,
      recursive: false,
      mode: "rgb",
      unarchive: true,
    });
  });

  it("reports exactly what was migrated", () => {
    const { migration } = importConfig(LEGACY);
    expect(migration).toEqual({
      downloads: [MODEL],
      unarchives: [RAW_ZIP],
      models: [{ from: `/content/models/${MODEL}.pth`, to: MODEL }],
    });
  });

  it("re-exports as the current format with preprocessors owning their parents", () => {
    const { nodes } = importConfig(LEGACY);
    const pure = JSON.parse(nodesToString(nodes)) as {
      nodes: { type: string }[];
      preprocess: { type: string; options: unknown; meta?: unknown }[];
    };
    expect(pure.nodes.map((n) => n.type)).toEqual(["folder_reader", "upscale"]);
    expect(pure.preprocess).toEqual([
      {
        type: "download",
        options: { name: MODEL, url: URL },
        meta: { parents: [nodes[1].uid] },
      },
      {
        type: "unarchive",
        options: { path: RAW_ZIP },
        meta: { parents: [nodes[0].uid] },
      },
    ]);
  });

  it("keeps a download name that arrives as a mounted path", () => {
    const text = JSON.stringify([
      { type: "download", options: { name: `/content/models/${MODEL}.pth` } },
      {
        type: "upscale",
        options: {
          model: MODEL,
          dtype: "F32",
          tiler: "exact",
          exact_tiler_size: 800,
          allow_cpu_upscale: false,
        },
      },
    ]);
    const { nodes } = importConfig(text);
    expect(nodes[0].options).toMatchObject({
      model: MODEL,
      is_own_model: false,
      model_url: URL,
    });
  });
});

describe("current format import", () => {
  it("is not reported as legacy", () => {
    const { nodes } = importConfig(LEGACY);
    const again = importConfig(nodesToString(nodes));
    expect(again.migration).toBeUndefined();
    expect(again.nodes[0].options).toMatchObject({ unarchive: true });
    expect(again.nodes[1].options).toMatchObject({
      model: MODEL,
      is_own_model: false,
      model_url: URL,
    });
  });

  it("keeps an unknown mounted path as an own model", () => {
    const text = JSON.stringify([
      {
        type: "upscale",
        options: {
          model: "/content/models/local_only.pth",
          dtype: "F32",
          tiler: "exact",
          exact_tiler_size: 800,
          allow_cpu_upscale: false,
        },
      },
    ]);
    const { nodes, migration } = importConfig(text);
    expect(nodes[0].options).toMatchObject({
      model: "/content/models/local_only.pth",
      is_own_model: true,
    });
    // nothing was rewritten: no notice, and no download link was invented
    expect(migration).toBeUndefined();
  });
});
