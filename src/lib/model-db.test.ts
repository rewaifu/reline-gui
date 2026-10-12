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

let reply: () => Response;
let calls: string[];

const fresh = async () => {
  vi.resetModules();
  return import("./model-db");
};

beforeEach(() => {
  calls = [];
  reply = () => new Response(JSON.stringify(FILES));
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      calls.push(String(input));
      return reply();
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("model database", () => {
  it("reads the model bucket's file list, sorted by name", async () => {
    const db = await fresh();
    const models = await db.modelNames();
    expect(calls).toEqual(["https://mdb.yor.ovh/v1/files"]);
    expect(models.map((m) => m.name)).toEqual(["2x_a", "4x_b"]);
    expect(db.modelUrl("4X_B")).toBe(
      "https://bucket.yor.ovh/torch_models/4x_b.tar.xz",
    );
  });

  it("fetches once per session", async () => {
    const db = await fresh();
    await db.modelNames();
    await db.modelNames();
    expect(calls).toHaveLength(1);
  });

  it("treats a payload of another shape as a failure and retries next time", async () => {
    const db = await fresh();
    reply = () => new Response(JSON.stringify({ files: [] }));
    await expect(db.modelNames()).rejects.toThrow();
    expect(db.modelsLoaded()).toBe(false);
    reply = () => new Response(JSON.stringify(FILES));
    await expect(db.modelNames()).resolves.toHaveLength(2);
  });

  it("a server error is a failure too", async () => {
    const db = await fresh();
    reply = () => new Response("nope", { status: 500 });
    await expect(db.modelNames()).rejects.toThrow("mdb: 500");
  });

  it("snaps a typed name to the closest model", async () => {
    const db = await fresh();
    expect((await db.resolveModelName("4x_B"))?.name).toBe("4x_b");
    expect((await db.resolveModelName("2x"))?.name).toBe("2x_a");
    expect(await db.resolveModelName("  ")).toBeUndefined();
  });

  it("a warm copy completes names without touching the network", async () => {
    const first = await fresh();
    await first.preloadModelNames();
    expect(calls).toHaveLength(1);
    const second = await fresh();
    await second.preloadModelNames();
    expect(calls).toHaveLength(1);
    expect(second.modelsLoaded()).toBe(true);
  });
});
