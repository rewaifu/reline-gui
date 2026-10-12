import { createSignal } from "solid-js";
import * as v from "valibot";
import { storage } from "~/lib/storage";
import {
  CAPABILITIES,
  Integrity,
  PluginManifestSchema,
  type Capability,
  type PluginManifest,
} from "./manifest";

/** What the user installed, as it is kept in `localStorage`. */
const InstalledSchema = v.object({
  manifest: PluginManifestSchema,
  manifestUrl: v.string(),
  entryUrl: v.string(),
  /** SHA-384 of the entry as it was installed. The code that runs must hash to
   * this, whether it comes from the cache or from the network. */
  integrity: Integrity,
  grantedCaps: v.array(v.picklist(CAPABILITIES)),
  enabled: v.boolean(),
  installedAt: v.number(),
  updatedAt: v.number(),
  /** Set when the host switched the plugin off, not the user. */
  disabledReason: v.optional(v.picklist(["crash", "error"])),
});

export type InstalledPlugin = v.InferOutput<typeof InstalledSchema>;

const REGISTRY_KEY = "reline-web:plugins";
const CODE_PREFIX = "reline-web:plugin-code:";
/** Cached entries above this are not kept: `localStorage` has ~5 MB for
 * everything, and a plugin that does not fit is simply refetched. */
const MAX_CACHED_CODE = 200 * 1024;

const load = (): InstalledPlugin[] => {
  const stored = storage.getJson(REGISTRY_KEY);
  if (!Array.isArray(stored)) return [];
  // entry by entry: one corrupt record must not take the others with it
  return stored.flatMap((item) => {
    const parsed = v.safeParse(InstalledSchema, item);
    return parsed.success ? [parsed.output] : [];
  });
};

// The list answers immediately (a write is deferred in Solid 2, and `put` is
// followed at once by a `get`); the signal only tells subscribers to ask again.
// `ownedWrite`: installing and switching happen from event handlers and from the
// runtime's own async code alike.
let current: readonly InstalledPlugin[] = load();
const [revision, setRevision] = createSignal(0, { ownedWrite: true });

const persist = (next: readonly InstalledPlugin[]): void => {
  current = next;
  setRevision((n) => n + 1);
  storage.setJson(REGISTRY_KEY, next);
};

export const pluginStore = {
  /** Installed plugins, in install order. Reactive. */
  list(): readonly InstalledPlugin[] {
    revision();
    return current;
  },

  get(id: string): InstalledPlugin | undefined {
    revision();
    return current.find((p) => p.manifest.id === id);
  },

  /** Add a plugin or replace the one with the same id. */
  put(plugin: InstalledPlugin): void {
    const all = current;
    const at = all.findIndex((p) => p.manifest.id === plugin.manifest.id);
    persist(
      at === -1 ? [...all, plugin] : all.map((p, i) => (i === at ? plugin : p)),
    );
  },

  patch(id: string, changes: Partial<Omit<InstalledPlugin, "manifest">>): void {
    persist(
      current.map((p) => (p.manifest.id === id ? { ...p, ...changes } : p)),
    );
  },

  remove(id: string): void {
    persist(current.filter((p) => p.manifest.id !== id));
    storage.remove(`${CODE_PREFIX}${id}`);
  },

  /** Keep the verified code so the plugin loads offline and at once. Returns
   * `false` when it is too big or the storage is full — the plugin still works,
   * it is just fetched on each start. */
  cacheCode(id: string, code: string): boolean {
    if (code.length > MAX_CACHED_CODE) {
      storage.remove(`${CODE_PREFIX}${id}`);
      return false;
    }
    return storage.set(`${CODE_PREFIX}${id}`, code);
  },

  cachedCode(id: string): string | undefined {
    return storage.get(`${CODE_PREFIX}${id}`);
  },
};

export type { Capability, PluginManifest };
