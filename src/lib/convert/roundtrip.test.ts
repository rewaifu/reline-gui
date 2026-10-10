import { describe, expect, it } from "vitest";
import { convertToPure, convertToStack } from "~/lib/convert";
import {
  DType,
  NodeType,
  PureNodeType,
  ReaderNodeMode,
  TilerType,
  WriterNodeFormat,
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

  it("writer psd block becomes a postprocess entry with the owner uid", () => {
    const pure = convertToPure([
      {
        uid: "w1",
        type: NodeType.FOLDER_WRITER,
        options: {
          path: "/out",
          format: WriterNodeFormat.PNG,
          clean_before: false,
          postprocess: {
            psd: {
              source_path: "/raws",
              fit: "original",
              enabled: true,
              delete_originals: true,
            },
          },
        },
        collapsed: false,
      },
    ] as never[]);
    // neither UI flag is sent on the node itself
    expect(pure.nodes[0].options).toEqual({
      path: "/out",
      format: WriterNodeFormat.PNG,
    });
    expect(pure.preprocess).toHaveLength(0);
    const post = pure.postprocess ?? [];
    expect(post).toHaveLength(1);
    expect(post[0]).toMatchObject({
      type: PureNodeType.PSD_POSTPROCESS,
      options: {
        path: "/out",
        source_path: "/raws",
        fit: "original",
        delete_originals: true,
      },
    });
    expect(post[0]?.meta?.parents).toEqual(["w1"]);

    const back = convertToStack(pure);
    expect(back).toHaveLength(1);
    expect(back[0].type).toBe(NodeType.FOLDER_WRITER);
    expect(back[0].options).toMatchObject({
      path: "/out",
      clean_before: false,
      postprocess: {
        psd: {
          source_path: "/raws",
          fit: "original",
          enabled: true,
          delete_originals: true,
        },
      },
    });
  });

  it("writer clean_before flag spawns a Cleandir preprocessor for path", () => {
    const pure = convertToPure([
      {
        uid: "w1",
        type: NodeType.FOLDER_WRITER,
        options: {
          path: "/out",
          format: WriterNodeFormat.PNG,
          clean_before: true,
        },
        collapsed: false,
      },
    ] as never[]);
    expect(pure.nodes[0].options).not.toHaveProperty("clean_before");
    expect(pure.preprocess).toHaveLength(1);
    expect(pure.preprocess[0]).toMatchObject({
      type: PureNodeType.CLEANDIR,
      options: { path: "/out" },
    });
    expect(pure.preprocess[0].meta?.parents).toEqual(["w1"]);
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

  it("cleandir section restores the writer flag for the matching path", () => {
    const stack = convertToStack({
      nodes: [
        {
          type: PureNodeType.FOLDER_WRITER,
          options: { path: "/out", format: WriterNodeFormat.PNG },
        },
      ],
      preprocess: [{ type: PureNodeType.CLEANDIR, options: { path: "/out" } }],
    });
    expect(stack[0].options).toMatchObject({
      path: "/out",
      clean_before: true,
    });

    const other = convertToStack({
      nodes: [
        {
          type: PureNodeType.FOLDER_WRITER,
          options: { path: "/other", format: WriterNodeFormat.PNG },
        },
      ],
      preprocess: [{ type: PureNodeType.CLEANDIR, options: { path: "/out" } }],
    });
    expect(other[0].options).toMatchObject({
      path: "/other",
      clean_before: false,
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

describe("resize mode params on the wire", () => {
  it("a height node with a stale width still sends height only", () => {
    // old stored trees (and the defaults merge before the sanitize fix)
    // carry width 2000 next to the height — the backend reads width+height
    // as `absolute`, so the export strips everything the mode does not own
    const pure = convertToPure([
      {
        uid: "r1",
        type: NodeType.RESIZE,
        options: {
          resize_type: "height",
          width: 2000,
          height: 1000,
          filter: "slinear4",
          spread: true,
          spread_size: 2800,
        },
        collapsed: false,
      },
    ] as never[]);
    expect(pure.nodes[0].options).toMatchObject({ height: 1000 });
    expect(pure.nodes[0].options).not.toHaveProperty("width");
    expect(pure.nodes[0].options).not.toHaveProperty("percent");
    expect(pure.nodes[0].options).not.toHaveProperty("resize_type");
  });

  it("a sanitized height node round-trips as height", () => {
    const stack = convertToStack({
      nodes: [
        {
          type: PureNodeType.RESIZE,
          options: { height: 1000, filter: "slinear4", spread: true },
        },
      ],
      preprocess: [],
    } as unknown as PureConfig);
    const pure = convertToPure(stack);
    expect(pure.nodes[0].options).toMatchObject({ height: 1000 });
    expect(pure.nodes[0].options).not.toHaveProperty("width");
  });
});

describe("halftone single-channel modes on the wire", () => {
  it("an old hsv tree with per-channel arrays still sends scalars", () => {
    // hsv drives the V channel only: trees stored while the form offered
    // H/S/V grids carry three values, and the backend parses one
    const pure = convertToPure([
      {
        uid: "h1",
        type: NodeType.SCREENTONE,
        options: {
          halftone_mode: "hsv",
          dot_size: [7, 8, 9],
          angle: [10, 20, 30],
          dot_type: ["circle", "line", "cross"],
        },
        collapsed: false,
      },
    ] as never[]);
    expect(pure.nodes[0].options).toMatchObject({
      dot_size: 7,
      angle: 10,
      dot_type: "circle",
    });
  });

  it("rgb keeps its per-channel arrays", () => {
    const pure = convertToPure([
      {
        uid: "h2",
        type: NodeType.SCREENTONE,
        options: {
          halftone_mode: "rgb",
          dot_size: [7, 8, 9],
          angle: [10, 20, 30],
          dot_type: ["circle", "line", "cross"],
        },
        collapsed: false,
      },
    ] as never[]);
    expect(pure.nodes[0].options).toMatchObject({
      dot_size: [7, 8, 9],
      angle: [10, 20, 30],
      dot_type: ["circle", "line", "cross"],
    });
  });
});

describe("hyst_norm passthrough", () => {
  it("exports its options untouched and reimports them", () => {
    const options = {
      blur_n: 3,
      window_radius: 3,
      min_prominence: 0.5,
      min_distance: 10,
      percentage: 0.22,
    };
    const pure = convertToPure([
      {
        uid: "h1",
        type: NodeType.HYST_NORM,
        options,
        collapsed: false,
      },
    ] as never[]);
    expect(pure.nodes).toHaveLength(1);
    expect(pure.nodes[0].type).toBe(PureNodeType.HYST_NORM);
    expect(pure.nodes[0].options).toEqual(options);
    expect(pure.nodes[0]).not.toHaveProperty("resize_type");

    const back = convertToStack(pure);
    expect(back).toHaveLength(1);
    expect(back[0].type).toBe(NodeType.HYST_NORM);
    expect(back[0].options).toMatchObject(options);
  });
});

describe("noise passthrough", () => {
  it("exports its options untouched and reimports them", () => {
    const options = {
      a: 2,
      b: 5,
      alpha: 0.15,
      noise_mode: "rgb",
      th_min: 1,
      th_max: 254,
      seed: 42,
    };
    const pure = convertToPure([
      {
        uid: "n1",
        type: NodeType.NOISE,
        options,
        collapsed: false,
      },
    ] as never[]);
    expect(pure.nodes).toHaveLength(1);
    expect(pure.nodes[0].type).toBe(PureNodeType.NOISE);
    expect(pure.nodes[0].options).toEqual(options);

    const back = convertToStack(pure);
    expect(back).toHaveLength(1);
    expect(back[0].type).toBe(NodeType.NOISE);
    expect(back[0].options).toMatchObject(options);
  });

  it("a null seed survives the round trip", () => {
    const pure = convertToPure([
      {
        uid: "n2",
        type: NodeType.NOISE,
        options: {
          a: 1,
          b: 1,
          alpha: 0.1,
          noise_mode: "gray",
          th_min: 1,
          th_max: 254,
          seed: null,
        },
        collapsed: false,
      },
    ] as never[]);
    expect(pure.nodes[0].options).toMatchObject({ seed: null });
  });
});
