import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

/** The runner's `models` reply: entries as the database sends them, plus the
 * runner's own freshness fields. */
const FILES = [
  {
    filename: "4x_b.tar.xz",
    name: "4x_b",
    ext: "tar.xz",
    size: 1,
    uploaded: "2024-01-01T00:00:00.000Z",
    url: "https://bucket.yor.ovh/torch_models/4x_b.tar.xz",
  },
  {
    filename: "2x_a.tar.xz",
    name: "2x_a",
    ext: "tar.xz",
    size: 2,
    uploaded: "2024-01-02T00:00:00.000Z",
    url: "https://bucket.yor.ovh/torch_models/2x_a.tar.xz",
  },
];

const hub = vi.hoisted(() => ({
  call: vi.fn<
    (name: string, data?: Record<string, unknown>) => Promise<unknown>
  >(),
}));
vi.mock("~/lib/ws", () => ({ wsHub: hub }));

const fresh = async () => {
  vi.resetModules();
  return import("./model-db");
};

const answer = () => ({
  files: FILES,
  fetched_at: 1_700_000_000,
  stale: false,
});

beforeEach(() => {
  hub.call.mockReset();
  hub.call.mockImplementation(async () => answer());
  vi.stubGlobal("localStorage", new MemoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("model database", () => {
  it("asks the runner, not the network, and sorts by name", async () => {
    const db = await fresh();
    const models = await db.modelNames();
    expect(hub.call).toHaveBeenCalledWith("models", {});
    expect(models.map((m) => m.name)).toEqual(["2x_a", "4x_b"]);
    expect(db.modelUrl("4X_B")).toBe(
      "https://bucket.yor.ovh/torch_models/4x_b.tar.xz",
    );
  });

  it("asks once while the list is fresh", async () => {
    const db = await fresh();
    await db.modelNames();
    await db.modelNames();
    expect(hub.call).toHaveBeenCalledTimes(1);
  });

  it("concurrent callers share one request", async () => {
    const db = await fresh();
    await Promise.all([db.modelNames(), db.modelNames(), db.modelNames()]);
    expect(hub.call).toHaveBeenCalledTimes(1);
  });

  it("treats a reply of another shape as a failure and asks again next time", async () => {
    const db = await fresh();
    hub.call.mockResolvedValueOnce({ files: "nope" });
    await expect(db.modelNames()).rejects.toThrow();
    expect(db.modelsLoaded()).toBe(false);
    await expect(db.modelNames()).resolves.toHaveLength(2);
  });

  it("a runner that cannot answer is a failure, not an empty list", async () => {
    const db = await fresh();
    hub.call.mockRejectedValueOnce(new Error("runner is not connected"));
    await expect(db.modelNames()).rejects.toThrow("runner is not connected");
    expect(db.modelsLoaded()).toBe(false);
  });

  it("snaps a typed name to the closest model", async () => {
    const db = await fresh();
    expect((await db.resolveModelName("4x_B"))?.name).toBe("4x_b");
    expect((await db.resolveModelName("2x"))?.name).toBe("2x_a");
    expect(await db.resolveModelName("  ")).toBeUndefined();
  });

  it("seeding reads the localStorage copy and never touches the runner", async () => {
    const first = await fresh();
    await first.modelNames();
    hub.call.mockClear();

    const second = await fresh();
    expect(second.modelsLoaded()).toBe(false);
    second.seedModelNames();
    expect(second.modelsLoaded()).toBe(true);
    expect(hub.call).not.toHaveBeenCalled();
    expect(second.modelUrl("2x_a")).toBe(
      "https://bucket.yor.ovh/torch_models/2x_a.tar.xz",
    );
  });

  it("a stale copy answers at once and is refreshed behind the caller", async () => {
    vi.useFakeTimers();
    const first = await fresh();
    await first.modelNames();
    hub.call.mockClear();

    // past the six-hour TTL, in a new session that only has the stored copy
    vi.setSystemTime(Date.now() + 7 * 60 * 60 * 1000);
    const second = await fresh();
    second.seedModelNames();
    const served = await second.modelNames();
    expect(served).toHaveLength(2);
    expect(hub.call).toHaveBeenCalledTimes(1);
  });

  it("preload fills the index for a synchronous reader, and never rejects", async () => {
    const db = await fresh();
    await db.preloadModelNames();
    expect(db.modelUrl("4x_b")).toBeDefined();

    // a new visitor: no stored copy, and the runner is not there
    vi.stubGlobal("localStorage", new MemoryStorage());
    const offline = await fresh();
    hub.call.mockRejectedValueOnce(new Error("no runner"));
    await expect(offline.preloadModelNames()).resolves.toBeUndefined();
    expect(offline.modelsLoaded()).toBe(false);
  });
});
