import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginApi } from "~/lib/plugins/api";

/** The plugin runtime end to end, with a fake web and a fake module loader:
 * what is fetched and checked before anything runs, what a plugin gets for the
 * permissions it was given, and that switching it off leaves nothing behind. */

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

type Activate = (api: PluginApi) => unknown;

/** A plugin as the test sees it: its code is a tag, its module a closure. */
interface Fixture {
  id: string;
  caps: string[];
  code: string;
  activate: Activate;
  version?: string;
  requires?: Record<string, string>;
}

let files: Map<string, string>;
let modules: Map<string, { default: { activate: Activate } }>;
let mem: MemoryStorage;

const setLocation = (search: string) => {
  window.history.replaceState({}, "", `/${search}`);
};

const fresh = async () => {
  vi.resetModules();
  const [
    runtime,
    store,
    loader,
    manifest,
    moduleLoader,
    nodes,
    ui,
    pipeline,
    i18n,
    actions,
    ws,
  ] = await Promise.all([
    import("~/lib/plugins/runtime"),
    import("~/lib/plugins/store"),
    import("~/lib/plugins/loader"),
    import("~/lib/plugins/manifest"),
    import("~/lib/plugins/module-loader"),
    import("~/lib/nodes"),
    import("~/lib/ui/registry"),
    import("~/lib/pipeline"),
    import("~/lib/i18n"),
    import("~/context/actions"),
    import("~/lib/ws"),
  ]);
  moduleLoader.setModuleLoader(async (code) => {
    const mod = modules.get(code);
    if (mod === undefined) throw new Error("no such module");
    return mod;
  });
  return {
    ...runtime,
    ...store,
    ...loader,
    ...manifest,
    nodes,
    ui,
    pipeline,
    i18n,
    actions,
    ws,
  };
};
type World = Awaited<ReturnType<typeof fresh>>;

const publish = async (
  w: World,
  f: Fixture,
  origin = "https://plugins.example",
) => {
  const integrity = await w.sha384(f.code);
  files.set(
    `${origin}/${f.id}/plugin.json`,
    JSON.stringify({
      id: f.id,
      name: f.id,
      version: f.version ?? "1.0.0",
      api: 1,
      entry: "index.js",
      integrity,
      caps: f.caps,
      requires: f.requires,
    }),
  );
  files.set(`${origin}/${f.id}/index.js`, f.code);
  modules.set(f.code, { default: { activate: f.activate } });
  return `${origin}/${f.id}/plugin.json`;
};

const install = async (w: World, f: Fixture, grant?: string[]) => {
  const url = await publish(w, f);
  const preview = await w.pluginRuntime.preview(url);
  await w.pluginRuntime.install(preview, (grant ?? f.caps) as never);
  flush();
  return preview;
};

beforeEach(() => {
  files = new Map();
  modules = new Map();
  mem = new MemoryStorage();
  vi.stubGlobal("localStorage", mem);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string) => {
      const body = files.get(String(input));
      return body === undefined
        ? new Response("nope", { status: 404 })
        : new Response(body, { status: 200 });
    }),
  );
  setLocation("");
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLocation("");
});

describe("manifest", () => {
  it("accepts a namespaced id and refuses the rest", async () => {
    const w = await fresh();
    const base = {
      name: "n",
      version: "1.0.0",
      api: 1,
      entry: "e.js",
      caps: [],
    };
    const { safeParse } = await import("valibot");
    for (const id of ["acme.blur", "acme-tools.blur2", "a1.b2.c3"])
      expect(
        safeParse(w.PluginManifestSchema, { ...base, id }).success,
        id,
      ).toBe(true);
    for (const id of [
      "blur",
      "Acme.Blur",
      "acme..blur",
      ".acme",
      "acme.",
      "ac me.x",
      "../x.y",
    ])
      expect(
        safeParse(w.PluginManifestSchema, { ...base, id }).success,
        id,
      ).toBe(false);
    expect(
      safeParse(w.PluginManifestSchema, { ...base, id: "acme.x", api: 2 })
        .success,
    ).toBe(false);
    expect(
      safeParse(w.PluginManifestSchema, {
        ...base,
        id: "acme.x",
        caps: ["root"],
      }).success,
    ).toBe(false);
  });

  it("compares versions numerically, a pre-release below its release", async () => {
    const w = await fresh();
    expect(w.compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(w.compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(w.compareVersions("1.0.0-beta", "1.0.0")).toBeLessThan(0);
  });
});

describe("fetching a plugin", () => {
  const manifest = (over: object = {}) => ({
    id: "acme.one",
    name: "One",
    version: "1.0.0",
    api: 1,
    entry: "index.js",
    caps: [],
    ...over,
  });
  const PIN = `sha384-${"A".repeat(64)}`;

  it("hashes like an SRI attribute", async () => {
    const w = await fresh();
    // sha384("") in base64
    expect(await w.sha384("")).toBe(
      "sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb",
    );
  });

  it("refuses plain http except on this machine, and a missing pin elsewhere", async () => {
    const w = await fresh();
    files.set(
      "http://plugins.example/p.json",
      JSON.stringify(manifest({ integrity: PIN })),
    );
    await expect(
      w.fetchManifest("http://plugins.example/p.json"),
    ).rejects.toMatchObject({ kind: "policy" });
    files.set("https://plugins.example/p.json", JSON.stringify(manifest()));
    await expect(
      w.fetchManifest("https://plugins.example/p.json"),
    ).rejects.toMatchObject({ kind: "policy" });
    files.set("http://localhost:5173/p.json", JSON.stringify(manifest()));
    await expect(
      w.fetchManifest("http://localhost:5173/p.json"),
    ).resolves.toMatchObject({
      entryUrl: "http://localhost:5173/index.js",
    });
  });

  it("an entry on another origin must be pinned", async () => {
    const w = await fresh();
    files.set(
      "http://localhost:5173/p.json",
      JSON.stringify(manifest({ entry: "https://cdn.example/x.js" })),
    );
    await expect(
      w.fetchManifest("http://localhost:5173/p.json"),
    ).rejects.toMatchObject({ kind: "policy" });
    files.set(
      "http://localhost:5173/q.json",
      JSON.stringify(
        manifest({ entry: "https://cdn.example/x.js", integrity: PIN }),
      ),
    );
    await expect(
      w.fetchManifest("http://localhost:5173/q.json"),
    ).resolves.toBeDefined();
  });

  it("reports a bad manifest by field, and a missing file as a network error", async () => {
    const w = await fresh();
    files.set(
      "https://plugins.example/bad.json",
      JSON.stringify(manifest({ id: "nope" })),
    );
    await expect(
      w.fetchManifest("https://plugins.example/bad.json"),
    ).rejects.toMatchObject({ kind: "manifest" });
    files.set("https://plugins.example/text.json", "not json");
    await expect(
      w.fetchManifest("https://plugins.example/text.json"),
    ).rejects.toMatchObject({ kind: "manifest" });
    await expect(
      w.fetchManifest("https://plugins.example/missing.json"),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("an allow-list of origins restricts installs", async () => {
    const w = await fresh();
    w.setAllowedOrigins(["https://trusted.example"]);
    files.set(
      "https://plugins.example/p.json",
      JSON.stringify(manifest({ integrity: PIN })),
    );
    await expect(
      w.fetchManifest("https://plugins.example/p.json"),
    ).rejects.toMatchObject({ kind: "policy" });
  });

  it("refuses code that does not match its pin", async () => {
    const w = await fresh();
    files.set("https://plugins.example/index.js", "evil()");
    await expect(
      w.fetchEntry({
        manifest: manifest({ integrity: PIN }) as never,
        entryUrl: "https://plugins.example/index.js",
      }),
    ).rejects.toMatchObject({ kind: "integrity" });
  });

  it("refuses an oversized entry", async () => {
    const w = await fresh();
    files.set("https://plugins.example/big.js", "x".repeat(1024 * 1024 + 1));
    await expect(
      w.fetchEntry({
        manifest: manifest() as never,
        entryUrl: "https://plugins.example/big.js",
      }),
    ).rejects.toMatchObject({ kind: "size" });
  });
});

describe("installing and running", () => {
  it("runs the verified code with only the namespaces it was granted", async () => {
    const w = await fresh();
    let seen: PluginApi | undefined;
    await install(
      w,
      {
        id: "acme.caps",
        caps: ["nodes", "ui", "storage"],
        code: "// caps",
        activate: (api) => {
          seen = api;
        },
      },
      ["nodes", "storage"],
    );
    expect(w.pluginRuntime.status("acme.caps").state).toBe("active");
    expect(seen?.nodes).toBeDefined();
    expect(seen?.storage).toBeDefined();
    expect(seen?.ui).toBeUndefined();
    expect(seen?.store).toBeUndefined();
    // the host's own Solid, never a second copy
    expect(
      (globalThis as { __RELINE__?: { solid: unknown } }).__RELINE__?.solid,
    ).toBe(seen?.solid);
  });

  it("persists the install and caches the verified code", async () => {
    const w = await fresh();
    await install(w, {
      id: "acme.keep",
      caps: [],
      code: "// keep",
      activate: () => {},
    });
    const stored = JSON.parse(mem.getItem("reline-web:plugins")!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      enabled: true,
      manifest: { id: "acme.keep" },
    });
    expect(mem.getItem("reline-web:plugin-code:acme.keep")).toBe("// keep");
  });

  it("everything a plugin registers goes away with it", async () => {
    const w = await fresh();
    await install(w, {
      id: "acme.all",
      caps: ["nodes", "ui", "pipeline", "store", "i18n", "ws"],
      code: "// all",
      activate: (api) => {
        api.nodes!.define({
          type: "acme.all.thing",
          label: api.i18n!.text("n"),
          defaults: () => ({}),
        });
        api.ui!.slot("topbar", () => null);
        api.ui!.panelTab({
          id: "t",
          label: api.i18n!.text("t"),
          Component: () => null,
        });
        api.pipeline!.use("export.serialize", (t) => t + "!", { id: "ser" });
        api.store!.action("acme.all:go", () => {});
        api.ws!.method({ name: "x.acme.all.ping" });
        api.i18n!.add("en", { n: "Thing" });
      },
    });
    const hasAll = () => ({
      node: w.nodes.nodeRegistry.get("acme.all.thing") !== undefined,
      slot: w.ui.uiRegistry.slotEntries("topbar").length > 0,
      tab: w.ui.uiRegistry.panelTabs().some((t) => t.id === "acme.all:t"),
      hook: w.pipeline.pipeline.status().some((h) => h.id === "acme.all:ser"),
      action: w.actions.storeActions.get("acme.all:go") !== undefined,
      method: w.ws.wsMethods.get("x.acme.all.ping") !== undefined,
    });
    expect(Object.values(hasAll()).every(Boolean)).toBe(true);
    w.pluginRuntime.disable("acme.all");
    flush();
    expect(Object.values(hasAll()).some(Boolean)).toBe(false);
    expect(w.pluginRuntime.status("acme.all").state).toBe("off");
  });

  it("a plugin can only name things under its own id", async () => {
    const w = await fresh();
    const errors: string[] = [];
    await install(w, {
      id: "acme.ns",
      caps: ["nodes", "store", "ws", "pipeline"],
      code: "// ns",
      activate: (api) => {
        const attempt = (fn: () => unknown) => {
          try {
            fn();
          } catch (e) {
            errors.push((e as Error).message);
          }
        };
        attempt(() =>
          api.nodes!.define({
            type: "level",
            label: "node.level",
            defaults: () => ({}),
          }),
        );
        attempt(() => api.store!.action("CHANGE", () => {}));
        attempt(() => api.ws!.method({ name: "start" }));
        attempt(() => api.ws!.call("start"));
      },
    });
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain('must start with "acme.ns."');
    // the built-in is untouched
    expect(w.nodes.nodeRegistry.get("level")?.label).toBe("node.level");
  });

  it("a stage that touches the wire or the store needs that permission too", async () => {
    const w = await fresh();
    const errors: string[] = [];
    await install(w, {
      id: "acme.stage",
      caps: ["pipeline"],
      code: "// stage",
      activate: (api) => {
        for (const stage of ["ws.send", "ws.receive", "store.action"] as const)
          try {
            api.pipeline!.use(stage, () => {});
          } catch (e) {
            errors.push((e as Error).message);
          }
        // a config stage is fine
        api.pipeline!.use("validate", () => {});
      },
    });
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('needs the "ws" capability');
    expect(errors[2]).toContain('needs the "store" capability');
  });

  it("hook ids are prefixed so two plugins cannot replace each other's", async () => {
    const w = await fresh();
    for (const id of ["acme.a1", "acme.b2"])
      await install(w, {
        id,
        caps: ["pipeline"],
        code: `// ${id}`,
        activate: (api) => {
          api.pipeline!.use("export.serialize", (t) => `${t}${id};`, {
            id: "same",
          });
        },
      });
    expect(
      w.pipeline.pipeline.apply("export.serialize", "", {
        nodes: [],
        preprocess: [],
      }),
    ).toBe("acme.a1;acme.b2;");
  });

  it("a throwing activate ends in error with nothing left registered", async () => {
    const w = await fresh();
    await install(w, {
      id: "acme.bad",
      caps: ["nodes"],
      code: "// bad",
      activate: (api) => {
        api.nodes!.define({
          type: "acme.bad.x",
          label: "node.level",
          defaults: () => ({}),
        });
        throw new Error("kaput");
      },
    });
    expect(w.pluginRuntime.status("acme.bad")).toMatchObject({
      state: "error",
      error: "kaput",
    });
    expect(w.nodes.nodeRegistry.get("acme.bad.x")).toBeUndefined();
  });

  it("a module without a default activate is refused", async () => {
    const w = await fresh();
    const url = await publish(w, {
      id: "acme.shape",
      caps: [],
      code: "// shape",
      activate: () => {},
    });
    modules.set("// shape", {} as never);
    await w.pluginRuntime.install(await w.pluginRuntime.preview(url), []);
    expect(w.pluginRuntime.status("acme.shape").state).toBe("error");
  });

  it("an activate that never finishes times out, and a late registration is undone", async () => {
    vi.useFakeTimers();
    const w = await fresh();
    let late!: () => void;
    const url = await publish(w, {
      id: "acme.slow",
      caps: ["nodes"],
      code: "// slow",
      activate: (api) =>
        new Promise<void>((resolve) => {
          late = () => {
            api.nodes!.define({
              type: "acme.slow.x",
              label: "node.level",
              defaults: () => ({}),
            });
            resolve();
          };
        }),
    });
    const preview = await w.pluginRuntime.preview(url);
    const done = w.pluginRuntime.install(preview, ["nodes"]);
    // fetching and hashing run on real async work: wait until activate() is
    // pending before moving the clock
    await vi.waitFor(() => expect(late).toBeTypeOf("function"));
    await vi.advanceTimersByTimeAsync(5100);
    await done;
    expect(w.pluginRuntime.status("acme.slow").state).toBe("error");
    late();
    expect(w.nodes.nodeRegistry.get("acme.slow.x")).toBeUndefined();
    vi.useRealTimers();
  });

  it("a plugin's cleanup function and onDispose run, newest first", async () => {
    const w = await fresh();
    const order: string[] = [];
    await install(w, {
      id: "acme.clean",
      caps: [],
      code: "// clean",
      activate: (api) => {
        api.onDispose(() => order.push("a"));
        api.onDispose(() => order.push("b"));
        return () => order.push("returned");
      },
    });
    w.pluginRuntime.disable("acme.clean");
    expect(order).toEqual(["returned", "b", "a"]);
  });

  it("runs the cached code when it still verifies, refetches and re-checks when not", async () => {
    const w = await fresh();
    await install(w, {
      id: "acme.cache",
      caps: [],
      code: "// cache",
      activate: () => {},
    });
    w.pluginRuntime.disable("acme.cache");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    await w.pluginRuntime.enable("acme.cache");
    expect(fetchMock).not.toHaveBeenCalled();
    // a tampered cache fails the hash and falls back to the network
    w.pluginRuntime.disable("acme.cache");
    mem.setItem("reline-web:plugin-code:acme.cache", "// tampered");
    await w.pluginRuntime.enable("acme.cache");
    expect(fetchMock).toHaveBeenCalled();
    expect(w.pluginRuntime.status("acme.cache").state).toBe("active");
    expect(mem.getItem("reline-web:plugin-code:acme.cache")).toBe("// cache");
  });

  it("refuses code that changed at its URL since the install", async () => {
    const w = await fresh();
    await install(w, {
      id: "acme.drift",
      caps: [],
      code: "// v1",
      activate: () => {},
    });
    w.pluginRuntime.disable("acme.drift");
    mem.removeItem("reline-web:plugin-code:acme.drift");
    // the server now serves other bytes under the same URL (and an unpinned manifest)
    files.set("https://plugins.example/acme.drift/index.js", "// v2");
    await w.pluginRuntime.enable("acme.drift");
    expect(w.pluginRuntime.status("acme.drift")).toMatchObject({
      state: "error",
    });
    expect(w.pluginRuntime.status("acme.drift").error).toContain("integrity");
  });

  it("starts what another plugin requires first, and reports a missing requirement", async () => {
    const w = await fresh();
    const order: string[] = [];
    await publish(w, {
      id: "acme.base",
      caps: [],
      code: "// base",
      activate: () => {
        order.push("base");
      },
    });
    await publish(w, {
      id: "acme.top",
      caps: [],
      code: "// top",
      requires: { "acme.base": "1.0.0" },
      activate: () => {
        order.push("top");
      },
    });
    // installed in the wrong order, started in the right one
    const top = await w.pluginRuntime.preview(
      "https://plugins.example/acme.top/plugin.json",
    );
    await w.pluginRuntime.install(top, []);
    expect(w.pluginRuntime.status("acme.top").error).toContain(
      "requires acme.base",
    );
    const base = await w.pluginRuntime.preview(
      "https://plugins.example/acme.base/plugin.json",
    );
    await w.pluginRuntime.install(base, []);
    order.length = 0;
    for (const id of ["acme.top", "acme.base"]) w.pluginRuntime.disable(id);
    await w.pluginRuntime.enable("acme.base");
    await w.pluginRuntime.enable("acme.top");
    expect(order).toEqual(["base", "top"]);
  });

  it("refuses what no longer matches the hash its catalog entry vouches for", async () => {
    const w = await fresh();
    const url = await publish(w, {
      id: "acme.pinned",
      caps: [],
      code: "// listed",
      activate: () => {},
    });
    const listed = await w.sha384("// listed");
    await expect(w.pluginRuntime.preview(url, listed)).resolves.toMatchObject({
      manifest: { id: "acme.pinned" },
    });
    await expect(
      w.pluginRuntime.preview(url, `sha384-${"B".repeat(64)}`),
    ).rejects.toMatchObject({ kind: "integrity" });
  });

  it("an update with new permissions is flagged, and replaces the running one", async () => {
    const w = await fresh();
    let version = 0;
    await install(w, {
      id: "acme.up",
      caps: ["nodes"],
      code: "// up1",
      activate: () => {
        version = 1;
      },
    });
    const url = await publish(w, {
      id: "acme.up",
      caps: ["nodes", "run"],
      code: "// up2",
      version: "1.1.0",
      activate: () => {
        version = 2;
      },
    });
    const preview = await w.pluginRuntime.preview(url);
    expect(preview.existing?.manifest.version).toBe("1.0.0");
    expect(preview.newCaps).toEqual(["run"]);
    await w.pluginRuntime.install(preview, ["nodes", "run"]);
    expect(version).toBe(2);
    expect(w.pluginStore.get("acme.up")?.grantedCaps).toEqual(["nodes", "run"]);
    expect(w.pluginStore.list()).toHaveLength(1);
  });

  it("removing a plugin deletes its record and cached code", async () => {
    const w = await fresh();
    await install(w, {
      id: "acme.gone",
      caps: [],
      code: "// gone",
      activate: () => {},
    });
    w.pluginRuntime.remove("acme.gone");
    flush();
    expect(w.pluginStore.list()).toHaveLength(0);
    expect(mem.getItem("reline-web:plugin-code:acme.gone")).toBeNull();
  });
});

describe("storage quota and i18n", () => {
  it("keeps a plugin's keys under its own prefix and enforces the quota", async () => {
    const w = await fresh();
    let api!: PluginApi;
    await install(w, {
      id: "acme.store",
      caps: ["storage"],
      code: "// store",
      activate: (a) => {
        api = a;
      },
    });
    expect(api.storage!.set("k", "v")).toBe(true);
    expect(mem.getItem("reline-web:plugin:acme.store:k")).toBe("v");
    expect(api.storage!.setJson("big", { a: "x".repeat(300 * 1024) })).toBe(
      false,
    );
    expect(api.storage!.getJson("k")).toBeUndefined();
    expect(api.storage!.usage()).toBeGreaterThan(0);
    // replacing a value counts the new size, not old + new
    expect(api.storage!.set("k", "w".repeat(100 * 1024))).toBe(true);
    expect(api.storage!.set("k", "w".repeat(200 * 1024))).toBe(true);
  });

  it("a plugin's words render in the reader's language and fall back to English", async () => {
    const w = await fresh();
    let api!: PluginApi;
    await install(w, {
      id: "acme.words",
      caps: ["i18n"],
      code: "// words",
      activate: (a) => {
        api = a;
      },
    });
    api.i18n!.add("en", { hi: "Hello {who}", only: "English only" });
    api.i18n!.add("ru", { hi: "Привет {who}" });
    w.i18n.setLocale("ru");
    flush();
    expect(api.i18n!.t("hi", { who: "A" })).toBe("Привет A");
    expect(api.i18n!.t("only")).toBe("English only");
    expect(api.i18n!.t("missing")).toBe("missing");
    w.i18n.setLocale("en");
    flush();
    expect(api.i18n!.t("hi", { who: "A" })).toBe("Hello A");
  });
});

describe("start, safe mode and crash recovery", () => {
  const seed = async (w: World, id: string, enabled = true) => {
    await install(w, { id, caps: [], code: `// ${id}`, activate: () => {} });
    if (!enabled) w.pluginRuntime.disable(id);
  };

  it("starts the enabled plugins on boot", async () => {
    let w = await fresh();
    let ran = 0;
    const url = await publish(w, {
      id: "acme.boot",
      caps: [],
      code: "// boot",
      activate: () => {
        ran += 1;
      },
    });
    await w.pluginRuntime.install(await w.pluginRuntime.preview(url), []);
    expect(ran).toBe(1);
    // a new page load: same storage, fresh modules
    const stored = new Map(files);
    const kept = new Map(modules);
    w = await fresh();
    files = stored;
    modules = kept;
    await w.pluginRuntime.start();
    expect(ran).toBe(2);
    expect(w.pluginRuntime.status("acme.boot").state).toBe("active");
  });

  it("?plugins=off loads nothing", async () => {
    let w = await fresh();
    let ran = 0;
    const url = await publish(w, {
      id: "acme.safe",
      caps: [],
      code: "// safe",
      activate: () => {
        ran += 1;
      },
    });
    await w.pluginRuntime.install(await w.pluginRuntime.preview(url), []);
    w = await fresh();
    setLocation("?plugins=off");
    ran = 0;
    await w.pluginRuntime.start();
    expect(ran).toBe(0);
    flush();
    expect(w.pluginRuntime.boot().safeMode).toBe(true);
  });

  it("a start that never confirmed itself switches its plugins off next time", async () => {
    let w = await fresh();
    await seed(w, "acme.crashy");
    // the boot flag was written and never cleared: the page died or froze
    mem.setItem("reline-web:plugins:booting", JSON.stringify(["acme.crashy"]));
    w = await fresh();
    let ran = 0;
    modules.set("// acme.crashy", {
      default: {
        activate: () => {
          ran += 1;
        },
      },
    });
    await w.pluginRuntime.start();
    flush();
    expect(ran).toBe(0);
    expect(w.pluginStore.get("acme.crashy")).toMatchObject({
      enabled: false,
      disabledReason: "crash",
    });
    expect(w.pluginRuntime.boot().crashed).toEqual(["acme.crashy"]);
  });

  it("writes the boot flag while starting and clears it once healthy", async () => {
    const w = await fresh();
    await seed(w, "acme.flag");
    await w.pluginRuntime.start();
    expect(mem.getItem("reline-web:plugins:booting")).toBe(
      JSON.stringify(["acme.flag"]),
    );
    w.pluginRuntime.confirmHealthy();
    expect(mem.getItem("reline-web:plugins:booting")).toBeNull();
  });

  it("disableAllStored switches everything off synchronously (the halt overlay)", async () => {
    const w = await fresh();
    await seed(w, "acme.one1");
    await seed(w, "acme.two2");
    expect(w.pluginRuntime.hasEnabled()).toBe(true);
    w.pluginRuntime.disableAllStored();
    expect(w.pluginRuntime.hasEnabled()).toBe(false);
    expect(
      JSON.parse(mem.getItem("reline-web:plugins")!).every(
        (p: { disabledReason: string }) => p.disabledReason === "crash",
      ),
    ).toBe(true);
  });

  it("a ?plugin= link is held for the user, never installed", async () => {
    const w = await fresh();
    setLocation(
      "?plugin=https%3A%2F%2Fplugins.example%2Fx%2Fplugin.json&keep=1",
    );
    await w.pluginRuntime.start();
    flush();
    expect(w.pluginRuntime.pendingInstall()).toBe(
      "https://plugins.example/x/plugin.json",
    );
    expect(w.pluginStore.list()).toHaveLength(0);
    expect(window.location.search).toBe("?keep=1");
  });
});

describe("the sandboxed (worker) tier", () => {
  /** A worker that speaks the host's protocol, run on this thread: it checks the
   * host's side of it. (The bootstrap itself runs in a real worker — see the
   * browser check; jsdom has neither Worker nor Blob imports.) */
  const fakeWorker = (
    plugin: (api: {
      pipeline: { beforeRun: (fn: (c: never) => unknown) => void };
    }) => void,
  ) => {
    const created: { terminated: boolean; worker: unknown }[] = [];
    return {
      created,
      factory: (_script: string, _name: string) => {
        let hook: ((c: never) => unknown) | undefined;
        const record = { terminated: false, worker: undefined as unknown };
        const worker = {
          onmessage: null as ((e: { data: unknown }) => void) | null,
          onerror: null as ((e: { message?: string }) => void) | null,
          terminate: () => {
            record.terminated = true;
          },
          postMessage: (msg: {
            type: string;
            call?: number;
            config?: never;
          }) => {
            const reply = (data: unknown) =>
              queueMicrotask(() => worker.onmessage?.({ data }));
            if (msg.type === "activate") {
              try {
                plugin({
                  pipeline: {
                    beforeRun: (fn) => {
                      hook = fn;
                    },
                  },
                });
                reply({ type: "ready" });
              } catch (e) {
                reply({ type: "failed", message: (e as Error).message });
              }
            } else if (msg.type === "beforeRun") {
              Promise.resolve(
                hook ? hook(msg.config as never) : msg.config,
              ).then(
                (config) => reply({ type: "result", call: msg.call, config }),
                (e: Error) =>
                  reply({ type: "result", call: msg.call, error: e.message }),
              );
            }
          },
        };
        record.worker = worker;
        created.push(record);
        return worker;
      },
    };
  };

  const workerFixture = (id = "acme.work"): Fixture => ({
    id,
    caps: ["pipeline"],
    code: `// ${id}`,
    activate: () => {},
  });

  const publishWorker = async (w: World, f: Fixture) => {
    const url = await publish(w, f);
    const parsed = JSON.parse(files.get(url)!);
    files.set(url, JSON.stringify({ ...parsed, sandbox: "worker" }));
    return url;
  };

  it("a worker plugin may only ask for pipeline", async () => {
    const w = await fresh();
    const { safeParse } = await import("valibot");
    const base = {
      id: "acme.w",
      name: "w",
      version: "1.0.0",
      api: 1,
      entry: "e.js",
      sandbox: "worker",
    };
    expect(
      safeParse(w.PluginManifestSchema, { ...base, caps: ["pipeline"] })
        .success,
    ).toBe(true);
    expect(
      safeParse(w.PluginManifestSchema, {
        ...base,
        caps: ["pipeline", "store"],
      }).success,
    ).toBe(false);
    expect(
      safeParse(w.PluginManifestSchema, { ...base, caps: ["storage"] }).success,
    ).toBe(false);
    // the page tier is unchanged
    expect(
      safeParse(w.PluginManifestSchema, {
        ...base,
        sandbox: "page",
        caps: ["store", "ui"],
      }).success,
    ).toBe(true);
  });

  it("runs in a worker, never in the page, and its beforeRun rewrites the config of a run", async () => {
    const w = await fresh();
    const { setWorkerFactory } = await import("~/lib/plugins/worker-host");
    const fake = fakeWorker((api) => {
      api.pipeline.beforeRun((config: never) => ({
        ...(config as object),
        preprocess: [{ type: "from-worker", options: {} }],
      }));
    });
    setWorkerFactory(fake.factory);
    const f = workerFixture();
    const pageActivate = vi.fn();
    f.activate = pageActivate;
    const url = await publishWorker(w, f);
    await w.pluginRuntime.install(await w.pluginRuntime.preview(url), [
      "pipeline",
    ]);
    flush();
    expect(w.pluginRuntime.status("acme.work").state).toBe("active");
    // the page-side module was never loaded
    expect(pageActivate).not.toHaveBeenCalled();
    const out = await w.pipeline.pipeline.applyAsync(
      { nodes: [], preprocess: [] },
      [],
    );
    expect(out.preprocess).toEqual([{ type: "from-worker", options: {} }]);
  });

  it("switching it off terminates the worker and removes its hook", async () => {
    const w = await fresh();
    const { setWorkerFactory } = await import("~/lib/plugins/worker-host");
    const fake = fakeWorker(() => {});
    setWorkerFactory(fake.factory);
    const url = await publishWorker(w, workerFixture("acme.stop"));
    await w.pluginRuntime.install(await w.pluginRuntime.preview(url), [
      "pipeline",
    ]);
    w.pluginRuntime.disable("acme.stop");
    expect(fake.created[0].terminated).toBe(true);
    expect(
      w.pipeline.pipeline.status().some((h) => h.id === "acme.stop:worker"),
    ).toBe(false);
  });

  it("a worker whose activate fails ends in error and is terminated", async () => {
    const w = await fresh();
    const { setWorkerFactory } = await import("~/lib/plugins/worker-host");
    const fake = fakeWorker(() => {
      throw new Error("worker kaput");
    });
    setWorkerFactory(fake.factory);
    const url = await publishWorker(w, workerFixture("acme.wbad"));
    await w.pluginRuntime.install(await w.pluginRuntime.preview(url), [
      "pipeline",
    ]);
    expect(w.pluginRuntime.status("acme.wbad")).toMatchObject({
      state: "error",
      error: "worker kaput",
    });
    expect(fake.created[0].terminated).toBe(true);
  });

  it("a hook that throws inside the worker is a recorded failure, the run goes on", async () => {
    const w = await fresh();
    const { setWorkerFactory } = await import("~/lib/plugins/worker-host");
    setWorkerFactory(
      fakeWorker((api) => {
        api.pipeline.beforeRun(() => {
          throw new Error("hook broke");
        });
      }).factory,
    );
    const url = await publishWorker(w, workerFixture("acme.whook"));
    await w.pluginRuntime.install(await w.pluginRuntime.preview(url), [
      "pipeline",
    ]);
    const config = { nodes: [], preprocess: [] };
    await expect(w.pipeline.pipeline.applyAsync(config, [])).resolves.toBe(
      config,
    );
    flush();
    expect(w.pipeline.pipeline.failures().at(-1)).toMatchObject({
      id: "acme.whook:worker",
      message: "hook broke",
    });
  });
});
