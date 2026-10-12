import { describe, expect, it } from "vitest";
import { nodeRegistry } from "~/lib/nodes";
import { INSTRUCTION_DOCS } from "./instructions-tab";

/** The guides are found by a glob relative to the file that holds it — moving
 * the file silently empties the map and every guide disappears. */
describe("node guides", () => {
  it("exist in both languages for every built-in node type", () => {
    const missing = nodeRegistry
      .list()
      .flatMap((def) => ["ru", "en"].map((l) => `${l}/${def.type}`))
      .filter((key) => !INSTRUCTION_DOCS[key]);
    expect(missing).toEqual([]);
  });
});
