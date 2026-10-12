import { createRoot, createSignal } from "solid-js";
import * as solid from "solid-js";
import * as web from "@solidjs/web";
import * as v from "valibot";
import { storage } from "~/lib/storage";
import { pipeline } from "~/lib/pipeline/hooks";
import { createPluginApi } from "./api";
import {
  PluginLoadError,
  fetchEntry,
  fetchManifest,
  isLoopback,
  sha384,
  type ManifestCandidate,
} from "./loader";
import {
  PLUGIN_API_VERSION,
  compareVersions,
  type Capability,
} from "./manifest";
import { loadModule } from "./module-loader";
import { pluginStore, type InstalledPlugin } from "./store";
import { startWorker } from "./worker-host";

/**
 * Loads, runs, switches and removes plugins.
 *
 * A plugin is the code of a URL the user chose, installed after seeing what it
 * asks for, pinned to the SHA-384 of that code, and run from the cached bytes.
 * The runtime owns everything that makes that survivable:
 *
 * - the code that runs is the code that was hashed (a Blob import of verified
 *   text, never a fresh fetch of the URL);
 * - each plugin gets a reactive root and a list of disposers, so switching it
 *   off undoes every registration it made without a reload;
 * - a plugin that throws, hangs or is incompatible ends in `error` and takes
 *   nothing else with it;
 * - **safe mode** (`?plugins=off`) loads none, and a boot that never proved
 *   itself healthy (the watchdog confirms it) switches the plugins that were
 *   starting off on the next load.
 */
type Dispose = () => void;

export type PluginState = "off" | "loading" | "active" | "error";

export interface PluginStatus {
  state: PluginState;
  error?: string;
}

export interface LogLine {
  at: number;
  text: string;
}

const BOOT_KEY = "reline-web:plugins:booting";
const ACTIVATE_TIMEOUT_MS = 5000;
const MAX_LOG_LINES = 100;

// `ownedWrite`: statuses change from activation, which runs inside the
// plugin's own reactive root, and from event handlers alike
const [statuses, setStatuses] = createSignal<ReadonlyMap<string, PluginStatus>>(
  new Map(),
  { ownedWrite: true },
);
const [logs, setLogs] = createSignal<ReadonlyMap<string, readonly LogLine[]>>(
  new Map(),
  { ownedWrite: true },
);
const [bootInfo, setBootInfo] = createSignal<{
  safeMode: boolean;
  /** Plugins switched off because the previous start did not come up healthy. */
  crashed: readonly string[];
}>({ safeMode: false, crashed: [] }, { ownedWrite: true });
const [pendingInstall, setPendingInstall] = createSignal<string | undefined>(
  undefined,
  { ownedWrite: true },
);

const setStatus = (id: string, status: PluginStatus): void => {
  setStatuses((all) => new Map(all).set(id, status));
};

const appendLog = (id: string, text: string): void => {
  setLogs((all) => {
    const next = new Map(all);
    next.set(
      id,
      [...(all.get(id) ?? []), { at: Date.now(), text }].slice(-MAX_LOG_LINES),
    );
    return next;
  });
};

/** The host's own Solid, for plugins built to take it from here rather than
 * bundle a second copy — two copies of the reactive core do not talk to each
 * other. Set before any plugin code runs. */
const exposeHost = (): void => {
  (globalThis as Record<string, unknown>).__RELINE__ = {
    apiVersion: PLUGIN_API_VERSION,
    solid,
    web,
  };
};
exposeHost();

const ModuleShape = v.object({
  default: v.object({ activate: v.function() }),
});

interface Running {
  dispose: Dispose;
}
const running = new Map<string, Running>();

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const withTimeout = <T>(
  work: Promise<T>,
  ms: number,
  what: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${what} did not finish within ${ms} ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
};

/** The entry's code, checked against the hash recorded at install. The cache is
 * used when it still verifies; otherwise the network is, and what it returns
 * must verify too. */
const verifiedCode = async (plugin: InstalledPlugin): Promise<string> => {
  const id = plugin.manifest.id;
  const cached = pluginStore.cachedCode(id);
  if (cached !== undefined && (await sha384(cached)) === plugin.integrity)
    return cached;
  const fetched = await fetchEntry({
    manifest: plugin.manifest,
    entryUrl: plugin.entryUrl,
  });
  if (fetched.integrity !== plugin.integrity)
    throw new PluginLoadError(
      "integrity",
      "the code at the URL changed since it was installed — update the plugin to accept it",
    );
  pluginStore.cacheCode(id, fetched.code);
  return fetched.code;
};

const missingRequirements = (plugin: InstalledPlugin): string[] =>
  Object.entries(plugin.manifest.requires ?? {}).flatMap(([id, minimum]) => {
    const other = pluginStore.get(id);
    return running.has(id) &&
      other !== undefined &&
      compareVersions(other.manifest.version, minimum) >= 0
      ? []
      : [`${id} ≥ ${minimum}`];
  });

const activate = async (plugin: InstalledPlugin): Promise<void> => {
  const id = plugin.manifest.id;
  if (running.has(id)) return;
  setStatus(id, { state: "loading" });
  const disposers: Dispose[] = [];
  let closed = false;
  let rootDispose: Dispose | undefined;
  const teardown = () => {
    closed = true;
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch {
        // one plugin's bad cleanup must not leave the rest of it registered
      }
    }
    rootDispose?.();
  };
  try {
    const missing = missingRequirements(plugin);
    if (missing.length > 0) throw new Error(`requires ${missing.join(", ")}`);
    const code = await verifiedCode(plugin);
    if (plugin.manifest.sandbox === "worker") {
      // the sandboxed tier: the code never runs in this page. It gets no api
      // object, only the config of a run through `beforeRun`
      const handle = await startWorker({
        id,
        version: plugin.manifest.version,
        code,
        onLog: (line) => appendLog(id, line),
      });
      disposers.push(() => handle.dispose());
      disposers.push(
        pipeline.use("beforeRun", (config) => handle.beforeRun(config), {
          id: `${id}:worker`,
        }),
      );
      running.set(id, { dispose: teardown });
      setStatus(id, { state: "active" });
      return;
    }
    const parsed = v.safeParse(ModuleShape, await loadModule(code));
    if (!parsed.success)
      throw new Error(
        "the module does not `export default definePlugin({ activate })`",
      );
    const { activate: run } = parsed.output.default;
    const api = createPluginApi({
      manifest: plugin.manifest,
      granted: new Set<Capability>(plugin.grantedCaps),
      // a registration that arrives after a timeout tore the plugin down is
      // undone at once instead of leaking
      own: (dispose) => {
        if (closed) dispose();
        else disposers.push(dispose);
      },
      log: (text) => appendLog(id, text),
    });
    // the plugin's own reactive root: effects and memos its `activate` creates
    // belong to it and are disposed with it
    const result = createRoot((dispose) => {
      rootDispose = dispose;
      return (run as (api: unknown) => unknown)(api);
    });
    const cleanup = await withTimeout(
      Promise.resolve(result),
      ACTIVATE_TIMEOUT_MS,
      "activate()",
    );
    if (typeof cleanup === "function") disposers.push(cleanup as Dispose);
    running.set(id, { dispose: teardown });
    setStatus(id, { state: "active" });
  } catch (error) {
    teardown();
    setStatus(id, { state: "error", error: messageOf(error) });
    appendLog(id, `activation failed: ${messageOf(error)}`);
  }
};

const deactivate = (id: string): void => {
  running.get(id)?.dispose();
  running.delete(id);
  setStatus(id, { state: "off" });
};

/** Plugins in an order that starts what others `require` first. A cycle or an
 * unknown requirement falls back to install order: `activate` reports it. */
const startOrder = (list: readonly InstalledPlugin[]): InstalledPlugin[] => {
  const byId = new Map(list.map((p) => [p.manifest.id, p]));
  const out: InstalledPlugin[] = [];
  const seen = new Set<string>();
  const visit = (plugin: InstalledPlugin) => {
    if (seen.has(plugin.manifest.id)) return;
    seen.add(plugin.manifest.id);
    for (const dep of Object.keys(plugin.manifest.requires ?? {})) {
      const needed = byId.get(dep);
      if (needed !== undefined) visit(needed);
    }
    out.push(plugin);
  };
  list.forEach(visit);
  return out;
};

/** What the user is shown before anything is installed. */
export interface InstallPreview extends ManifestCandidate {
  code: string;
  /** SHA-384 of `code` — what the install will pin. */
  integrity: string;
  /** Where it comes from: the origin the user is trusting. */
  origin: string;
  /** Plugins already installed under this id (an update). */
  existing?: InstalledPlugin;
  /** Capabilities the plugin asks for that the installed version did not. */
  newCaps: Capability[];
  /** Nothing pins the code (a development server). */
  unpinned: boolean;
  /** Requirements that are not met right now. */
  missing: string[];
}

let stalled = false;

export const pluginRuntime = {
  status(id: string): PluginStatus {
    return statuses().get(id) ?? { state: "off" };
  },

  log(id: string): readonly LogLine[] {
    return logs().get(id) ?? [];
  },

  /** `?plugins=off` and plugins switched off after a failed start. Reactive. */
  boot: bootInfo,

  /** A manifest URL from `?plugin=` that waits for the user to look at it. */
  pendingInstall,

  clearPendingInstall: () => setPendingInstall(undefined),

  /** Fetch a manifest and its code and say what installing it would do. Nothing
   * is stored and nothing runs. `pin`: the integrity a catalog entry vouches for. */
  async preview(url: string, pin?: string): Promise<InstallPreview> {
    const candidate = await fetchManifest(url);
    // a catalog entry names the exact code it vouches for: a manifest that
    // moved on since the catalog was written is not what was listed
    if (pin !== undefined && candidate.manifest.integrity !== pin)
      throw new PluginLoadError(
        "integrity",
        "the plugin no longer matches its catalog entry",
      );
    const { code, integrity } = await fetchEntry(candidate);
    const manifestUrl = new URL(candidate.manifestUrl);
    const existing = pluginStore.get(candidate.manifest.id);
    const known = new Set<Capability>(existing?.manifest.caps ?? []);
    return {
      ...candidate,
      code,
      integrity,
      origin: manifestUrl.origin,
      existing,
      newCaps: candidate.manifest.caps.filter((cap) => !known.has(cap)),
      unpinned:
        candidate.manifest.integrity === undefined && isLoopback(manifestUrl),
      missing: Object.entries(candidate.manifest.requires ?? {}).flatMap(
        ([id, minimum]) => {
          const other = pluginStore.get(id);
          return other !== undefined &&
            compareVersions(other.manifest.version, minimum) >= 0
            ? []
            : [`${id} ≥ ${minimum}`];
        },
      ),
    };
  },

  /** Install (or update) what `preview` showed, with the capabilities the user
   * agreed to, and start it. */
  async install(
    preview: InstallPreview,
    granted: readonly Capability[],
  ): Promise<void> {
    const id = preview.manifest.id;
    const allowed = granted.filter((cap) =>
      preview.manifest.caps.includes(cap),
    );
    if (running.has(id)) deactivate(id);
    const now = Date.now();
    pluginStore.put({
      manifest: preview.manifest,
      manifestUrl: preview.manifestUrl,
      entryUrl: preview.entryUrl,
      integrity: preview.integrity,
      grantedCaps: allowed,
      enabled: true,
      installedAt: preview.existing?.installedAt ?? now,
      updatedAt: now,
    });
    pluginStore.cacheCode(id, preview.code);
    const installed = pluginStore.get(id);
    if (installed !== undefined) await activate(installed);
  },

  async enable(id: string): Promise<void> {
    const plugin = pluginStore.get(id);
    if (plugin === undefined) return;
    pluginStore.patch(id, { enabled: true, disabledReason: undefined });
    const fresh = pluginStore.get(id);
    if (fresh !== undefined) await activate(fresh);
  },

  disable(id: string): void {
    deactivate(id);
    pluginStore.patch(id, { enabled: false, disabledReason: undefined });
  },

  remove(id: string): void {
    deactivate(id);
    pluginStore.remove(id);
    setStatuses((all) => {
      const next = new Map(all);
      next.delete(id);
      return next;
    });
  },

  /** Start the enabled plugins. Honours safe mode, repairs a start that never
   * came up, and reads a `?plugin=` link. */
  async start(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const link = params.get("plugin");
    if (link !== null && link.trim() !== "") {
      // never installed on sight: the user is shown what it asks for first
      setPendingInstall(link.trim());
      params.delete("plugin");
      const rest = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${rest === "" ? "" : `?${rest}`}${window.location.hash}`,
      );
    }
    if (params.get("plugins") === "off") {
      setBootInfo({ safeMode: true, crashed: [] });
      return;
    }
    // the previous start wrote this and never cleared it: the page died or
    // froze before it proved itself healthy, so what was starting is suspect
    const previous = storage.getJson(BOOT_KEY);
    const suspects = Array.isArray(previous)
      ? previous.filter((id): id is string => typeof id === "string")
      : [];
    if (suspects.length > 0) {
      for (const id of suspects)
        if (pluginStore.get(id) !== undefined)
          pluginStore.patch(id, { enabled: false, disabledReason: "crash" });
      storage.remove(BOOT_KEY);
      setBootInfo({ safeMode: false, crashed: suspects });
    }
    const enabled = startOrder(pluginStore.list().filter((p) => p.enabled));
    if (enabled.length === 0) return;
    storage.setJson(
      BOOT_KEY,
      enabled.map((p) => p.manifest.id),
    );
    window.addEventListener("pagehide", () => {
      // a page that is closing normally did not crash; one that froze has
      // already been marked and keeps its flag for the next start
      if (!stalled) storage.remove(BOOT_KEY);
    });
    for (const plugin of enabled) await activate(plugin);
  },

  /** The page has been alive and rendering for a while: the plugins that
   * started are not what stops it. */
  confirmHealthy(): void {
    storage.remove(BOOT_KEY);
  },

  /** The watchdog found the reactive system dead. */
  markStalled(): void {
    stalled = true;
  },

  /** Is anything enabled — the halt overlay offers the way out only then. */
  hasEnabled(): boolean {
    return pluginStore.list().some((p) => p.enabled);
  },

  /** Switch every plugin off in storage. Synchronous on purpose: it runs from
   * the halt overlay, where nothing reactive works. */
  disableAllStored(): void {
    for (const plugin of pluginStore.list())
      pluginStore.patch(plugin.manifest.id, {
        enabled: false,
        disabledReason: "crash",
      });
    storage.remove(BOOT_KEY);
  },
};
