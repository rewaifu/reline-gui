import { describe, expect, it } from "vitest";
import { convertToPure, convertToStack, exportConfig } from "~/lib/convert";
import { nodeRegistry } from "~/lib/nodes";
import { raw } from "~/lib/i18n";
import { stringToNodes, nodesToString } from "~/lib/config";
import type { PureConfig, StackNode } from "~/types/node";

/** A config that names a node type this build has no definition for (a plugin
 * that is off, a newer build) must survive a load → export round trip with the
 * node's options byte for byte — and a node that cannot be serialised must
 * never take the export down with it. */
const CONFIG = {
  nodes: [
    {
      type: "folder_reader",
      options: { path: "/in", mode: "gray", recursive: false },
    },
    {
      type: "acme.denoise",
      options: { strength: 0.4, tags: ["a", { b: 1 }] },
      meta: { name: "denoise" },
    },
    { type: "folder_writer", options: { path: "/out", format: "png" } },
  ],
  preprocess: [],
  postprocess: [],
} as unknown as PureConfig;

describe("orphan nodes through the converters", () => {
  it("import keeps an unknown wire type with its options and name", () => {
    const nodes = convertToStack(CONFIG);
    expect(nodes.map((n) => n.type)).toEqual([
      "folder_reader",
      "acme.denoise",
      "folder_writer",
    ]);
    expect(nodes[1].options).toEqual({ strength: 0.4, tags: ["a", { b: 1 }] });
    expect(nodes[1].name).toBe("denoise");
  });

  it("export writes an orphan back as it came", () => {
    const again = JSON.parse(
      nodesToString(convertToStack(CONFIG)),
    ) as PureConfig;
    expect(again.nodes[1]).toEqual(CONFIG.nodes[1]);
  });

  it("survives the text round trip next to real nodes", () => {
    const text = JSON.stringify(CONFIG);
    const nodes = stringToNodes(text);
    expect(nodes).toHaveLength(3);
    expect(JSON.parse(nodesToString(nodes)).nodes[1].options).toEqual(
      CONFIG.nodes[1].options,
    );
  });

  it("a plugin that defines the type later claims the node", () => {
    const dispose = nodeRegistry.define({
      type: "acme.denoise",
      label: raw("Denoise"),
      defaults: () => ({ strength: 0.1 }),
    });
    const nodes = convertToStack(CONFIG);
    dispose();
    expect(nodes[1].type).toBe("acme.denoise");
  });
});

describe("a node that cannot be serialised", () => {
  const broken = (): StackNode => ({
    uid: "bad",
    type: "upscale",
    options: { model: 42, dtype: "nope" },
    collapsed: true,
  });

  it("throws without a reporter (strict callers and tests)", () => {
    expect(() => convertToPure([broken()])).toThrow();
  });

  it("is reported, written through unchanged, and does not stop the rest", () => {
    const good: StackNode = {
      uid: "good",
      type: "level",
      options: {
        low_input: 0,
        high_input: 255,
        low_output: 0,
        high_output: 255,
        gamma: 1,
      },
      collapsed: true,
    };
    const { config, issues } = exportConfig([broken(), good]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ uid: "bad", type: "upscale" });
    expect(config.nodes.map((n) => n.type)).toEqual(["upscale", "level"]);
    expect(config.nodes[0].options).toEqual({ model: 42, dtype: "nope" });
    // no helper entry is left behind by the failed node
    expect(config.preprocess).toEqual([]);
  });

  it("nodesToString never throws on node data", () => {
    expect(() => nodesToString([broken()])).not.toThrow();
  });
});
