import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadCatalog,
  searchCatalog,
  type CatalogEntry,
  type CatalogPlugin,
} from "./catalog";
import { pluginDescription } from "./manifest";

const PIN = `sha384-${"A".repeat(64)}`;
const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: "acme.one",
  name: "One",
  version: "1.0.0",
  caps: ["ui"],
  manifest: "one/plugin.json",
  integrity: PIN,
  ...over,
});

let body: unknown;
beforeEach(() => {
  body = { schema: 1, name: "Test", plugins: [entry()] };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(typeof body === "string" ? body : JSON.stringify(body)),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("loadCatalog", () => {
  it("resolves manifest links against the catalog's own URL", async () => {
    const catalog = await loadCatalog(
      "https://app.example/x/plugins/index.json",
    );
    expect(catalog.name).toBe("Test");
    expect(catalog.plugins[0].manifestUrl).toBe(
      "https://app.example/x/plugins/one/plugin.json",
    );
  });

  it.each([
    ["not JSON", "{nope"],
    ["a newer schema", { schema: 2, name: "x", plugins: [] }],
    ["a bad id", { schema: 1, name: "x", plugins: [entry({ id: "Nope" })] }],
    [
      "a missing pin",
      { schema: 1, name: "x", plugins: [entry({ integrity: "" })] },
    ],
    ["duplicate ids", { schema: 1, name: "x", plugins: [entry(), entry()] }],
  ])("rejects %s with a manifest error", async (_name, value) => {
    body = value;
    await expect(
      loadCatalog("https://app.example/plugins/index.json"),
    ).rejects.toMatchObject({ kind: "manifest" });
  });

  it("reports an unreachable catalog as a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    await expect(
      loadCatalog("https://app.example/plugins/index.json"),
    ).rejects.toMatchObject({ kind: "network" });
  });
});

/** The shipped catalog is generated; this is what stops it drifting from the
 * plugins it lists (run `pnpm plugin:catalog`). */
describe("the catalog shipped with the app", () => {
  const root = join(process.cwd(), "public/plugins");
  const shipped = JSON.parse(
    readFileSync(join(root, "index.json"), "utf8"),
  ) as {
    plugins: CatalogEntry[];
  };

  it("is valid", async () => {
    body = shipped;
    await expect(
      loadCatalog("https://app.example/plugins/index.json"),
    ).resolves.toBeDefined();
  });

  it("lists every plugin directory and nothing else", () => {
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter(
        (d) => d.isDirectory() && existsSync(join(root, d.name, "plugin.json")),
      )
      .map((d) => `${d.name}/plugin.json`)
      .sort();
    expect(shipped.plugins.map((p) => p.manifest).sort()).toEqual(dirs);
  });

  it.each(shipped.plugins.map((p) => [p.id, p] as const))(
    "%s matches its manifest and its code",
    (_id, listed) => {
      const manifestPath = join(root, listed.manifest);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        descriptions: manifest.descriptions,
        caps: manifest.caps,
        integrity: manifest.integrity,
      }).toEqual({
        id: listed.id,
        name: listed.name,
        version: listed.version,
        description: listed.description,
        descriptions: listed.descriptions,
        caps: listed.caps,
        integrity: listed.integrity,
      });
      const code = readFileSync(join(manifestPath, "..", manifest.entry));
      expect(
        `sha384-${createHash("sha384").update(code).digest("base64")}`,
      ).toBe(listed.integrity);
    },
  );
});

describe("searchCatalog", () => {
  const plugin = (over: Partial<CatalogPlugin>): CatalogPlugin => ({
    ...entry(),
    manifestUrl: "https://app.example/plugins/one/plugin.json",
    ...over,
  });
  const all = [
    plugin({
      id: "acme.blur",
      name: "Blur",
      descriptions: { ru: "Размытие изображений", en: "Blur images" },
    }),
    plugin({
      id: "acme.queue",
      name: "Queue",
      caps: ["run"],
      sandbox: undefined,
    }),
    plugin({
      id: "acme.suffix",
      name: "Suffix",
      caps: ["pipeline"],
      sandbox: "worker",
    }),
  ];
  const ids = (query: string) => searchCatalog(all, query).map((p) => p.id);

  it("keeps everything for an empty query", () => {
    expect(ids("  ")).toEqual(["acme.blur", "acme.queue", "acme.suffix"]);
  });
  it("finds by name, id, either description language, permission and tier", () => {
    expect(ids("blur")).toEqual(["acme.blur"]);
    expect(ids("ACME.QUE")).toEqual(["acme.queue"]);
    expect(ids("размытие")).toEqual(["acme.blur"]);
    expect(ids("images")).toEqual(["acme.blur"]);
    expect(ids("pipeline")).toEqual(["acme.suffix"]);
    expect(ids("worker")).toEqual(["acme.suffix"]);
  });
  it("requires every word to match", () => {
    expect(ids("blur размытие")).toEqual(["acme.blur"]);
    expect(ids("blur queue")).toEqual([]);
  });
});

describe("pluginDescription", () => {
  it("prefers the reader's language, then the plain description", () => {
    const both = {
      description: "plain",
      descriptions: { ru: "по-русски", en: "english" },
    };
    expect(pluginDescription(both, "ru")).toBe("по-русски");
    expect(pluginDescription(both, "en")).toBe("english");
    expect(
      pluginDescription(
        { description: "plain", descriptions: { ru: "по-русски" } },
        "en",
      ),
    ).toBe("plain");
    expect(pluginDescription({ descriptions: { en: "english" } }, "ru")).toBe(
      "english",
    );
    expect(pluginDescription({}, "ru")).toBeUndefined();
  });
});
