import { describe, expect, it } from "vitest";
import { faviconStatusFor } from "~/lib/favicon-status";

describe("favicon run status", () => {
  it("stays panda on a fresh page", () => {
    expect(faviconStatusFor("idle", undefined, undefined)).toEqual({
      kind: "idle",
    });
  });

  it("rings while busy, even at 0 %", () => {
    for (const phase of ["connecting", "running", "stopping"] as const) {
      expect(faviconStatusFor(phase, undefined, undefined)).toEqual({
        kind: "running",
        percent: 0,
      });
    }
    expect(faviconStatusFor("running", 42, "ok")).toEqual({
      kind: "running",
      percent: 42,
    });
  });

  it("keeps the last outcome after the run goes idle", () => {
    expect(faviconStatusFor("idle", 100, "ok")).toEqual({ kind: "ok" });
    expect(faviconStatusFor("idle", 100, "error")).toEqual({ kind: "error" });
    expect(faviconStatusFor("idle", 100, "info")).toEqual({ kind: "idle" });
  });
});
