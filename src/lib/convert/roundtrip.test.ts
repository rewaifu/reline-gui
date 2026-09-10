import { describe, expect, it } from "vitest";
import { convertToPure, convertToStack } from "~/lib/convert";
import {
  DType,
  NodeType,
  PureNodeType,
  ReaderNodeMode,
  TilerType,
} from "~/types/enums";
import type { PureConfig } from "~/types/node";

const upscaleStack = (
  model: string,
  uid: string,
  is_own_model = false,
  model_url?: string,
) => ({
  uid,
  type: NodeType.UPSCALE,
  options: {
    model,
    is_own_model,
    model_url,
    dtype: DType.F32,
    tiler: TilerType.EXACT,
    exact_tiler_size: 800,
    allow_cpu_upscale: false,
  },
  collapsed: false,
});

describe("preprocess generation from parent nodes", () => {
  it("is_own_model: false spawns a Download with the mdb url, model name stays bare", () => {
    const pure = convertToPure([
      upscaleStack("4x_a", "u1", false, "https://mdb.yor.ovh/f/4x_a.tar.xz"),
      upscaleStack("4x_b", "u2", true),
    ] as never[]);
    expect(pure.nodes).toHaveLength(2);
    expect(pure.preprocess).toHaveLength(1);
    const [download] = pure.preprocess;
    expect(download.type).toBe(PureNodeType.DOWNLOAD);
    expect(download.options).toEqual({
      name: "4x_a",
      url: "https://mdb.yor.ovh/f/4x_a.tar.xz",
    });
    expect(download.meta?.parents).toEqual(["u1"]);
    const upscaled = pure.nodes.find((n) => n.type === PureNodeType.UPSCALE);
    expect("model" in upscaled!.options && upscaled!.options.model).toBe(
      "4x_a",
    );
    expect(upscaled!.options).not.toHaveProperty("model_url");
    // own model keeps its path and spawns nothing
    const own = pure.nodes[1];
    expect("model" in own.options && own.options.model).toBe("4x_b");
  });

  it("two upscales of the same model reference one shared Download (parents merged)", () => {
    const pure = convertToPure([
      upscaleStack("4x_shared", "u1"),
      upscaleStack("4x_shared", "u2"),
      upscaleStack("4x_shared", "u3"),
    ] as never[]);
    expect(pure.preprocess).toHaveLength(1);
    expect(pure.preprocess[0].meta?.parents).toEqual(["u1", "u2", "u3"]);
  });

  it("reader unarchive flag spawns an Unarchive preprocessor for path + .zip", () => {
    const pure = convertToPure([
      {
        uid: "r1",
        type: NodeType.FOLDER_READER,
        options: {
          path: "/raws",
          mode: ReaderNodeMode.GRAY,
          recursive: false,
          unarchive: true,
        },
        collapsed: false,
      },
    ] as never[]);
    expect(pure.nodes[0].options).not.toHaveProperty("unarchive");
    expect(pure.preprocess).toHaveLength(1);
    expect(pure.preprocess[0]).toMatchObject({
      type: PureNodeType.UNARCHIVE,
      options: { path: "/raws.zip" },
    });
    expect(pure.preprocess[0].meta?.parents).toEqual(["r1"]);
  });
});

describe("preprocess import dissolves back into flags", () => {
  it("download section restores is_own_model: false with the bare model name", () => {
    const stack = convertToStack({
      nodes: [
        {
          type: PureNodeType.UPSCALE,
          options: {
            model: "/content/models/4x_a.pth",
            dtype: DType.F32,
            tiler: TilerType.EXACT,
            exact_tiler_size: 800,
            allow_cpu_upscale: false,
          },
        },
      ],
      preprocess: [{ type: PureNodeType.DOWNLOAD, options: { name: "4x_a" } }],
    });
    const upscale = stack[0];
    expect(upscale.options).toMatchObject({
      model: "4x_a",
      is_own_model: false,
    });
  });

  it("current format: bare model + download url restores name and model_url", () => {
    const stack = convertToStack({
      nodes: [
        {
          type: PureNodeType.UPSCALE,
          options: {
            model: "4x_a",
            dtype: DType.F32,
            tiler: TilerType.EXACT,
            exact_tiler_size: 800,
            allow_cpu_upscale: false,
          },
        },
      ],
      preprocess: [
        {
          type: PureNodeType.DOWNLOAD,
          options: { name: "4x_a", url: "https://mdb.yor.ovh/f/4x_a.tar.xz" },
        },
      ],
    });
    expect(stack[0].options).toMatchObject({
      model: "4x_a",
      is_own_model: false,
      model_url: "https://mdb.yor.ovh/f/4x_a.tar.xz",
    });
  });

  it("unarchive section restores the reader flag for the matching path", () => {
    const stack = convertToStack({
      nodes: [
        {
          type: PureNodeType.FOLDER_READER,
          options: {
            path: "/raws",
            mode: ReaderNodeMode.GRAY,
            recursive: false,
          },
        },
      ],
      preprocess: [
        { type: PureNodeType.UNARCHIVE, options: { path: "/raws.zip" } },
      ],
    });
    expect(stack[0].options).toMatchObject({ path: "/raws", unarchive: true });
  });

  it("prefixed model without a matching download is treated as an own model", () => {
    const stack = convertToStack({
      nodes: [
        {
          type: PureNodeType.UPSCALE,
          options: {
            model: "/content/models/custom.pth",
            dtype: DType.F32,
            tiler: TilerType.EXACT,
            exact_tiler_size: 800,
            allow_cpu_upscale: false,
          },
        },
      ],
      preprocess: [],
    });
    expect(stack[0].options).toMatchObject({
      model: "/content/models/custom.pth",
      is_own_model: true,
    });
  });
});

describe("meta round-trip", () => {
  it("keeps name/disabled on main nodes through pure conversion and back", () => {
    const stack = convertToStack({
      nodes: [
        {
          type: PureNodeType.UPSCALE,
          options: {
            model: "/m.pth",
            dtype: DType.F32,
            tiler: TilerType.EXACT,
            exact_tiler_size: 800,
            allow_cpu_upscale: false,
          },
          meta: { name: "Апскейл", disabled: true },
        },
      ],
      preprocess: [],
    });
    expect(stack[0]).toMatchObject({ name: "Апскейл", enabled: false });
  });
});

/** Config from a field report: "nothing appears in the output folder, it just
 * does not work". The wire side was fine (the same config writes its files),
 * so this pins the editor's half: the stack it builds from those bytes runs
 * enabled, with both paths untouched. */
describe("a config from a report", () => {
  const REPORT = {
    nodes: [
      {
        type: "folder_reader",
        options: {
          path: "/content/drive/MyDrive/porno_test_3/",
          mode: "rgb",
          recursive: true,
        },
      },
      {
        type: "level",
        options: {
          low_input: 0,
          high_input: 253,
          low_output: 0,
          high_output: 255,
          gamma: 0.3,
        },
      },
      {
        type: PureNodeType.FOLDER_WRITER,
        options: { path: "porno_test_3/output/", format: "png" },
      },
    ],
    preprocess: [],
  } as unknown as PureConfig;

  it("imports enabled and exports unchanged", () => {
    const migrated: unknown[] = [];
    const stack = convertToStack(REPORT, {
      onLegacy: (migration) => migrated.push(migration),
    });
    expect(stack.map((node) => node.type)).toEqual([
      NodeType.FOLDER_READER,
      NodeType.LEVEL,
      NodeType.FOLDER_WRITER,
    ]);
    expect(migrated).toEqual([]);
    // a disabled node is dropped by the runner: a stack that looks right and
    // writes nothing is exactly this bug's shape
    expect(stack.map((node) => node.enabled)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);

    const back = convertToPure(stack);
    expect(back.nodes[0].options).toMatchObject({
      path: "/content/drive/MyDrive/porno_test_3/",
      mode: "rgb",
      recursive: true,
    });
    expect(back.nodes[2].options).toEqual({
      path: "porno_test_3/output/",
      format: "png",
    });
    expect(back.preprocess).toEqual([]);
  });
});
