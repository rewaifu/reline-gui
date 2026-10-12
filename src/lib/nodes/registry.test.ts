import { afterEach, describe, expect, it } from "vitest";
import { createEffect, createRoot, flush } from "solid-js";
import { raw } from "~/lib/i18n";
import {
  createNode,
  defaultOptions,
  nodeLabel,
  nodeMenuEntries,
  nodeRegistry,
  type NodeDef,
} from "~/lib/nodes";

/** The registry is where "what is a node of type X" is answered. Plugins add,
 * patch and remove types at runtime, so every mutation must be undoable by its
 * own disposer and visible to readers that are already mounted. */
const blur = (over: Partial<NodeDef> = {}): NodeDef => ({
  type: "test.blur",
  label: raw("Blur"),
  defaults: () => ({ radius: 3 }),
  ...over,
});

const undo: (() => void)[] = [];
const keep = (dispose: () => void) => {
  undo.push(dispose);
  return dispose;
};
afterEach(() => {
  while (undo.length > 0) undo.pop()?.();
});

describe("nodeRegistry", () => {
  it("ships the ten built-ins in menu order", () => {
    expect(nodeRegistry.menu().map((def) => def.type)).toEqual([
      "folder_reader",
      "folder_writer",
      "upscale",
      "sharp",
      "resize",
      "screentone",
      "level",
      "cvt_color",
      "hyst_norm",
      "noise",
    ]);
  });

  it("defines a type and removes it with its disposer", () => {
    const dispose = keep(nodeRegistry.define(blur()));
    expect(nodeRegistry.get("test.blur")?.label).toEqual({ raw: "Blur" });
    expect(nodeLabel("test.blur")).toBe("Blur");
    dispose();
    expect(nodeRegistry.get("test.blur")).toBeUndefined();
    // an orphan shows its raw id
    expect(nodeLabel("test.blur")).toBe("test.blur");
  });

  it("a stale disposer does not remove a redefinition", () => {
    const first = nodeRegistry.define(blur());
    keep(nodeRegistry.define(blur({ label: raw("Blur 2") })));
    first();
    expect(nodeLabel("test.blur")).toBe("Blur 2");
  });

  it("maps a wire type back to its definition", () => {
    keep(nodeRegistry.define(blur({ pureType: "gaussian" })));
    expect(nodeRegistry.byPureType("gaussian")?.type).toBe("test.blur");
    expect(nodeRegistry.byPureType("halftone")?.type).toBe("screentone");
    expect(nodeRegistry.byPureType("test.blur")).toBeUndefined();
  });

  it("patches stack, and disposing one leaves the others", () => {
    keep(nodeRegistry.define(blur()));
    const first = keep(
      nodeRegistry.patch("test.blur", { defaults: () => ({ radius: 5 }) }),
    );
    keep(nodeRegistry.patch("test.blur", { label: raw("Soft blur") }));
    expect(defaultOptions("test.blur")).toEqual({ radius: 5 });
    expect(nodeLabel("test.blur")).toBe("Soft blur");
    first();
    expect(defaultOptions("test.blur")).toEqual({ radius: 3 });
    expect(nodeLabel("test.blur")).toBe("Soft blur");
  });

  it("a patch cannot change the identity of a type", () => {
    keep(nodeRegistry.define(blur()));
    keep(nodeRegistry.patch("test.blur", { type: "hijacked" }));
    expect(nodeRegistry.get("test.blur")?.type).toBe("test.blur");
    expect(nodeRegistry.get("hijacked")).toBeUndefined();
  });

  it("a patch applied before the type exists takes effect when it does", () => {
    keep(nodeRegistry.patch("test.blur", { label: raw("Early") }));
    keep(nodeRegistry.define(blur()));
    expect(nodeLabel("test.blur")).toBe("Early");
  });

  it("hide is reference counted and keeps the type itself readable", () => {
    keep(nodeRegistry.define(blur()));
    const a = nodeRegistry.hide("test.blur");
    const b = nodeRegistry.hide("test.blur");
    expect(nodeRegistry.menu().some((d) => d.type === "test.blur")).toBe(false);
    expect(nodeRegistry.get("test.blur")).toBeDefined();
    a();
    a(); // a second release of the same hide changes nothing
    expect(nodeRegistry.menu().some((d) => d.type === "test.blur")).toBe(false);
    b();
    expect(nodeRegistry.menu().some((d) => d.type === "test.blur")).toBe(true);
  });

  it("creates a node with its own fresh options and uid", () => {
    keep(nodeRegistry.define(blur()));
    const one = createNode("test.blur")!;
    const two = createNode("test.blur")!;
    expect(one.options).toEqual({ radius: 3 });
    expect(one.options).not.toBe(two.options);
    expect(one.uid).not.toBe(two.uid);
    expect(createNode("test.nothing")).toBeUndefined();
  });

  it("tells two types with one label apart in the menu", () => {
    keep(nodeRegistry.define(blur({ label: "node.level" })));
    const entries = nodeMenuEntries();
    const texts = entries.map((entry) => entry.text);
    expect(new Set(texts).size).toBe(texts.length);
    const level = entries.find((entry) => entry.type === "level");
    const clash = entries.find((entry) => entry.type === "test.blur");
    expect(level?.text).toContain("(level)");
    expect(clash?.text).toContain("(test.blur)");
    expect(
      nodeMenuEntries("test.blur").some((e) => e.type === "test.blur"),
    ).toBe(false);
  });

  it("notifies a reader that is already mounted", () => {
    let seen = "";
    const dispose = createRoot((stop) => {
      createEffect(
        () => nodeLabel("test.late"),
        (label) => {
          seen = label;
        },
      );
      return stop;
    });
    flush();
    expect(seen).toBe("test.late");
    keep(nodeRegistry.define(blur({ type: "test.late", label: raw("Late") })));
    flush();
    expect(seen).toBe("Late");
    dispose();
  });
});
