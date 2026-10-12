import { describe, expect, it } from "vitest";
import { fitTabs } from "./fit";

const base = { gap: 4, menu: 32 };
const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);

describe("fitTabs", () => {
  it("keeps everything when the row fits, without reserving the menu", () => {
    const kept = fitTabs({
      ...base,
      widths: [50, 50, 50],
      active: 0,
      available: 158,
    });
    expect(sorted(kept)).toEqual([0, 1, 2]);
  });

  it("leaves a prefix and reserves room for the menu when it does not", () => {
    // 4 × 50 + 3 gaps = 212 > 150; room for tabs = 150 − 32 − 4 = 114 → two tabs (104)
    const kept = fitTabs({
      ...base,
      widths: [50, 50, 50, 50],
      active: 0,
      available: 150,
    });
    expect(sorted(kept)).toEqual([0, 1]);
  });

  it("always keeps the selected tab, then fills from the start", () => {
    const kept = fitTabs({
      ...base,
      widths: [50, 50, 50, 50],
      active: 3,
      available: 150,
    });
    expect(sorted(kept)).toEqual([0, 3]);
  });

  it("keeps the selected tab even when it alone is too wide", () => {
    const kept = fitTabs({
      ...base,
      widths: [200, 50],
      active: 0,
      available: 100,
    });
    expect(sorted(kept)).toEqual([0]);
  });

  it("handles no selection", () => {
    const kept = fitTabs({
      ...base,
      widths: [50, 50, 50, 50],
      active: -1,
      available: 150,
    });
    expect(sorted(kept)).toEqual([0, 1]);
  });
});
