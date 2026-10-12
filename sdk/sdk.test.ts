import { describe, expect, it } from "vitest";
import * as web from "@solidjs/web";
import * as solid from "solid-js";
import hostExports from "./host-exports.json";

/** The SDK's build helper re-exports `solid-js` and `@solidjs/web` from the host
 * by name. If an upgrade adds or removes a name, a plugin built against the old
 * list would import something that is not there — regenerate the list
 * (`pnpm sdk:exports`) when this fails. */
describe("sdk host exports", () => {
  it("lists every name the host's Solid builds export", () => {
    const names = (ns: object) =>
      Object.keys(ns)
        .filter((n) => n !== "default")
        .sort();
    expect(hostExports["solid-js"]).toEqual(names(solid));
    expect(hostExports["@solidjs/web"]).toEqual(names(web));
  });
});
