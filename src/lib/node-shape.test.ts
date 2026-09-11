import { describe, expect, it } from "vitest";
import { DEFAULT_NODE_OPTIONS } from "~/constants";
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

  it("drops a type this build does not have", () => {
    expect(sanitizeNode({ type: "teleporter" })).toBeUndefined();
  });

  it("fills options a payload leaves out or nulls out", () => {
    // a halftone node with `options: null` used to throw on the first render of
    // its form (`options().halftone_mode`)
    for (const options of [undefined, null, "nope", 3]) {
      const node = sanitizeNode({ type: "screentone", options });
      expect(node?.options).toEqual(DEFAULT_NODE_OPTIONS.screentone);
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
    const { gamma: _gamma, ...fromDefaults } = DEFAULT_NODE_OPTIONS.level;
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
    expect(nodes.map((node) => node.uid)).toEqual(["a", "b", "b", "d"]);
    expect(nodes.map((node) => node.type)).toEqual([
      "level",
      "resize",
      "resize",
      "sharp",
    ]);
  });

  it("returns nothing for a value that is not a tree", () => {
    expect(sanitizeNodes(undefined)).toEqual([]);
    expect(sanitizeNodes({ nodes: [] })).toEqual([]);
    expect(sanitizeNodes("[]")).toEqual([]);
  });
});
