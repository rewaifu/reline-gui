import { describe, expect, it } from "vitest";
import { defaultOptions } from "~/lib/nodes";
import { sanitizeNode, sanitizeNodes } from "./node-shape";

/** Nodes come from localStorage, pasted configs and presets, and the store is
 * rendered directly — `FORMS[node.type]`, the per-type forms' option reads and
 * the enum maps inside them all run during render, where a throw halts Solid's
 * whole reactive system. This is the door those shapes are checked at. */

describe("sanitizeNode", () => {
  it("drops anything that cannot be a node", () => {
    const cases: [string, unknown][] = [
      ["null", null],
      ["undefined", undefined],
      ["a number", 42],
      ["a string", "level"],
      ["an array", []],
      ["a bare object", {}],
      ["a non-string type", { type: 7 }],
    ];
    for (const [what, value] of cases) {
      expect(sanitizeNode(value), what).toBeUndefined();
    }
  });

  it("keeps a type this build does not have as an orphan, options verbatim", () => {
    // a plugin that is switched off must not take its nodes with it
    const options = { radius: 4, nested: { keep: [1, 2] } };
    const node = sanitizeNode({ type: "acme.teleporter", uid: "t", options });
    expect(node).toMatchObject({ type: "acme.teleporter", uid: "t" });
    expect(node?.options).toEqual(options);
    expect(sanitizeNode({ type: "acme.teleporter" })?.options).toEqual({});
    expect(
      sanitizeNode({ type: "acme.teleporter", options: [1] })?.options,
    ).toEqual({});
  });

  it("resets a field the schema rejects to its default and keeps the rest", () => {
    // used to pass the door and then throw in the serialiser, inside a memo
    const node = sanitizeNode({
      type: "upscale",
      options: { exact_tiler_size: "abc", dtype: "nope", model: "mine" },
    });
    const defaults = defaultOptions("upscale")!;
    expect(node?.options).toMatchObject({
      exact_tiler_size: defaults.exact_tiler_size,
      dtype: defaults.dtype,
      model: "mine",
    });
  });

  it("fills options a payload leaves out or nulls out", () => {
    // a halftone node with `options: null` used to throw on the first render of
    // its form (`options().halftone_mode`)
    for (const options of [undefined, null, "nope", 3]) {
      const node = sanitizeNode({ type: "screentone", options });
      expect(node?.options).toEqual(defaultOptions("screentone"));
    }
  });

  it("keeps the fields a payload sets and defaults the rest", () => {
    const node = sanitizeNode({
      type: "level",
      options: { gamma: 2, future_flag: true },
    });
    expect(node?.options).toMatchObject({ gamma: 2, future_flag: true });
    // the keys the form reads are all there, from the constants — except the
    // one the payload overrode
    const { gamma: _gamma, ...fromDefaults } = defaultOptions("level")!;
    expect(node?.options).toMatchObject(fromDefaults);
  });

  it("mints an identity when the payload has none", () => {
    const first = sanitizeNode({ type: "resize" });
    const second = sanitizeNode({ type: "resize" });
    expect(first?.uid).toBeTruthy();
    expect(first?.uid).not.toBe(second?.uid);
    expect(sanitizeNode({ type: "resize", uid: "" })?.uid).toBeTruthy();
  });

  it("carries the display fields through", () => {
    const node = sanitizeNode({
      type: "resize",
      uid: "kept",
      name: "my resize",
      collapsed: false,
      enabled: false,
    });
    expect(node).toMatchObject({
      uid: "kept",
      name: "my resize",
      collapsed: false,
      enabled: false,
    });
    // collapsed defaults to collapsed, like a node added by hand
    expect(sanitizeNode({ type: "resize" })?.collapsed).toBe(true);
  });
});
describe("sanitizeNode old writer flags", () => {
  it("fills clean_before and a partial psd block so old flags toggle", () => {
    const node = sanitizeNode({
      type: "folder_writer",
      options: {
        path: "/o",
        format: "png",
        postprocess: { psd: { enabled: true } },
      },
    });
    expect(node?.options).toMatchObject({
      clean_before: false,
      postprocess: {
        psd: {
          source_path: "",
          fit: "original",
          enabled: true,
          delete_originals: false,
        },
      },
    });
  });

  it("leaves a full psd block alone", () => {
    const node = sanitizeNode({
      type: "folder_writer",
      options: {
        path: "/o",
        format: "png",
        clean_before: true,
        postprocess: {
          psd: {
            source_path: "/s",
            fit: "cover",
            enabled: true,
            delete_originals: true,
          },
        },
      },
    });
    expect(node?.options).toMatchObject({
      clean_before: true,
      postprocess: {
        psd: {
          source_path: "/s",
          fit: "cover",
          enabled: true,
          delete_originals: true,
        },
      },
    });
  });
});

describe("sanitizeNode resize modes", () => {
  it("does not resurrect the default width on a stored height node", () => {
    // stored trees persist without `width` (JSON drops undefined), while the
    // defaults carry width 2000 — a plain merge sends width+height, which the
    // backend reads as `absolute` instead of `height`
    const node = sanitizeNode({
      type: "resize",
      options: {
        resize_type: "height",
        height: 1000,
        filter: "slinear4",
        spread: true,
        spread_size: 2800,
      },
    });
    expect(node?.options).toMatchObject({
      resize_type: "height",
      height: 1000,
    });
    expect(node?.options).not.toHaveProperty("width");
    expect(node?.options).not.toHaveProperty("percent");
  });

  it("keeps both sizes for absolute and drops the idle ones elsewhere", () => {
    const absolute = sanitizeNode({
      type: "resize",
      options: {
        resize_type: "absolute",
        width: 2000,
        height: 1000,
        percent: 50,
        filter: "slinear4",
        spread: true,
      },
    });
    expect(absolute?.options).toMatchObject({ width: 2000, height: 1000 });
    expect(absolute?.options).not.toHaveProperty("percent");

    const width = sanitizeNode({
      type: "resize",
      options: {
        resize_type: "width",
        width: 2000,
        height: 1000,
        filter: "slinear4",
        spread: true,
        spread_size: 2800,
      },
    });
    expect(width?.options).toMatchObject({ width: 2000 });
    expect(width?.options).not.toHaveProperty("height");
  });
});

describe("sanitizeNodes", () => {
  it("keeps the order and drops garbage", () => {
    const nodes = sanitizeNodes([
      { type: "level", uid: "a" },
      null,
      { type: "resize", uid: "b" },
      { type: "resize", uid: "b" },
      7,
      { type: "nope", uid: "c" },
      { type: "sharp", uid: "d" },
    ]);
    // an unknown type is kept (orphan); only what cannot be a node is dropped
    expect(nodes.map((node) => node.uid)).toEqual(["a", "b", "b", "c", "d"]);
    expect(nodes.map((node) => node.type)).toEqual([
      "level",
      "resize",
      "resize",
      "nope",
      "sharp",
    ]);
  });

  it("returns nothing for a value that is not a tree", () => {
    expect(sanitizeNodes(undefined)).toEqual([]);
    expect(sanitizeNodes({ nodes: [] })).toEqual([]);
    expect(sanitizeNodes("[]")).toEqual([]);
  });
});
