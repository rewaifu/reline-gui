import { afterEach, describe, expect, it } from "vitest";
import { analyze, stringToNodes } from "~/lib/config";
import { raw } from "~/lib/i18n";
import { createDefaultNodes, createNode, nodeRegistry } from "~/lib/nodes";
import { CONFIG_PRESETS } from "~/lib/presets";
import { pipeline, validateNodes } from "~/lib/pipeline";
import type { StackNode } from "~/types/node";

const undo: (() => void)[] = [];
afterEach(() => {
  while (undo.length > 0) undo.pop()?.();
});
const codes = (nodes: readonly StackNode[]) =>
  validateNodes(nodes).map((d) => d.code);

describe("built-in rules", () => {
  it("the starter stack and every stock preset are clean", () => {
    // a rule that flags the app's own defaults would block every first run
    expect(validateNodes(createDefaultNodes())).toEqual([]);
    for (const preset of CONFIG_PRESETS)
      expect(validateNodes(preset.nodes), preset.id).toEqual([]);
  });

  it("every built-in default passes its own schema", () => {
    for (const def of nodeRegistry.list())
      expect(
        validateNodes([createNode(def.type)!]).filter(
          (d) => d.code === "node.schema",
        ),
        def.type,
      ).toEqual([]);
  });

  it("an empty stack and an all-disabled stack are errors", () => {
    expect(codes([])).toEqual(["pipeline.empty"]);
    const off = createDefaultNodes().map((n) => ({ ...n, enabled: false }));
    expect(codes(off)).toEqual(["pipeline.noneEnabled"]);
  });

  it("a missing reader or writer is only a warning", () => {
    const level = createNode("level")!;
    const found = validateNodes([level]);
    expect(found.map((d) => [d.code, d.severity])).toEqual([
      ["pipeline.noReader", "warn"],
      ["pipeline.noWriter", "warn"],
    ]);
  });

  it("a bad option names the node and the field", () => {
    const node = createNode("upscale")!;
    node.options.exact_tiler_size = "abc";
    const found = validateNodes([node]).filter((d) => d.code === "node.schema");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      uid: node.uid,
      path: "exact_tiler_size",
      severity: "error",
    });
  });

  it("an orphan is a warning, not an error", () => {
    const orphan: StackNode = {
      uid: "o",
      type: "acme.gone",
      options: {},
      collapsed: true,
    };
    const found = validateNodes([orphan]).find((d) => d.code === "node.orphan");
    expect(found).toMatchObject({ severity: "warn", uid: "o" });
  });
});

describe("definition and hook rules", () => {
  it("a definition's validate runs with the uid filled in, and a throw becomes a finding", () => {
    undo.push(
      nodeRegistry.define({
        type: "test.v",
        label: raw("V"),
        defaults: () => ({ n: 1 }),
        validate: (node) =>
          node.options.n === 1
            ? [{ code: "test.one", severity: "warn", message: raw("one") }]
            : [],
      }),
    );
    const node = createNode("test.v")!;
    expect(validateNodes([node]).find((d) => d.code === "test.one")?.uid).toBe(
      node.uid,
    );
    undo.push(
      nodeRegistry.define({
        type: "test.v",
        label: raw("V"),
        defaults: () => ({}),
        validate: () => {
          throw new Error("kaput");
        },
      }),
    );
    expect(codes([createNode("test.v")!])).toContain("node.validateFailed");
  });

  it("a validate hook's findings join the rest", () => {
    undo.push(
      pipeline.use("validate", () => [
        { code: "acme.gpu", severity: "error", message: raw("no GPU") },
      ]),
    );
    expect(codes(createDefaultNodes())).toEqual(["acme.gpu"]);
  });
});

describe("analyze", () => {
  it("returns text, config and findings in one pass, indexed by node", () => {
    const nodes = createDefaultNodes();
    nodes[1].options.dtype = "nope";
    const result = analyze(nodes);
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(0);
    expect(result.byUid.get(nodes[1].uid)).toHaveLength(1);
    expect(JSON.parse(result.text).nodes).toHaveLength(nodes.length);
  });

  it("never throws, even when the config cannot become text", () => {
    undo.push(
      pipeline.use("toPure.config", (config) => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        config.nodes[0].options.cyclic = cyclic;
      }),
    );
    const result = analyze(createDefaultNodes());
    expect(result.text).toBe("");
    expect(result.diagnostics.some((d) => d.code === "export.failed")).toBe(
      true,
    );
  });

  it("toPure and serialize hooks shape the text the Code tab shows", () => {
    undo.push(
      pipeline.use("toPure.node", (pure, node) =>
        node.type === "level"
          ? [...pure, { type: "extra", options: {} }]
          : pure,
      ),
      pipeline.use("export.serialize", (text) => `// edited\n${text}`),
    );
    const result = analyze(createDefaultNodes());
    expect(result.text.startsWith("// edited\n")).toBe(true);
    expect(result.config.nodes.some((n) => n.type === "extra")).toBe(true);
  });
});

describe("import stages", () => {
  it("import.parse rewrites the parsed JSON before it is read as a config", () => {
    undo.push(
      pipeline.use("import.parse", (value) => {
        const legacy = value as { steps?: unknown[] };
        return legacy.steps === undefined
          ? value
          : { nodes: legacy.steps, preprocess: [] };
      }),
    );
    const nodes = stringToNodes(
      JSON.stringify({
        steps: [
          {
            type: "level",
            options: {
              gamma: 2,
              low_input: 0,
              high_input: 255,
              low_output: 0,
              high_output: 255,
            },
          },
        ],
      }),
    );
    expect(nodes.map((n) => n.type)).toEqual(["level"]);
  });
});
