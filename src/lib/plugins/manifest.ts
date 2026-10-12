import * as v from "valibot";
import type { Locale } from "~/lib/i18n/locale";

/**
 * What a plugin may ask for. A plugin's `api` object contains only the
 * namespaces it was granted, so reaching for another one is a TypeError the
 * host catches — but this is bookkeeping for the user's consent, not a sandbox:
 * a plugin runs in the page and could do anything the page can. Grant plugins
 * you would run as code.
 */
export const CAPABILITIES = [
  "nodes",
  "ui",
  "pipeline",
  "store",
  "ws",
  "i18n",
  "storage",
  "run",
  "config",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** The host API generation a plugin is written for. A change that breaks
 * plugins bumps it, and old plugins are refused instead of misbehaving. */
export const PLUGIN_API_VERSION = 1;

const PluginId = v.pipe(
  v.string(),
  v.minLength(3),
  v.maxLength(64),
  // dotted, lower-case, like a package name: it prefixes everything the plugin
  // owns (node types, WS methods, action types, storage keys)
  v.regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/, "id like acme.blur"),
);

const Description = v.pipe(v.string(), v.maxLength(400));

const Version = v.pipe(
  v.string(),
  v.regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "version like 1.2.0"),
);

export const Integrity = v.pipe(
  v.string(),
  v.regex(/^sha384-[A-Za-z0-9+/]{64}$/, "integrity like sha384-<base64>"),
);

/** The file a plugin author publishes next to the plugin code. It is read —
 * and shown to the user — before any plugin code runs. */
export const PluginManifestObject = v.object({
  id: PluginId,
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  version: Version,
  /** Host API generation, see `PLUGIN_API_VERSION`. */
  api: v.literal(PLUGIN_API_VERSION),
  /** What it does, in one language — the fallback for every reader. */
  description: v.optional(Description),
  /** The same in the reader's language; either may be left out. */
  descriptions: v.optional(
    v.partial(v.object({ ru: Description, en: Description })),
  ),
  /** The ES module, as a URL relative to the manifest. */
  entry: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  /** SHA-384 of the entry, so the code that runs is the code that was
   * reviewed. Required except for a local development server. */
  integrity: v.optional(Integrity),
  caps: v.array(v.picklist(CAPABILITIES)),
  /** Other plugins that must be active first: id → minimum version. */
  requires: v.optional(v.record(PluginId, Version)),
  /**
   * Where the code runs. `page` (default): in the editor's page with the
   * permissions above — it can do anything the page can. `worker`: in a Web
   * Worker with no DOM, no storage and no host objects; it receives the config
   * of a run (`beforeRun`) and returns it, and nothing else. A worker plugin may
   * ask for `pipeline` only.
   */
  sandbox: v.optional(v.picklist(["page", "worker"])),
});

/** Capabilities a plugin running in a worker may be given: it has no DOM and no
 * host objects, only what the runtime sends it over `postMessage`. */
const WORKER_CAPABILITIES: readonly Capability[] = ["pipeline"];

export const PluginManifestSchema = v.pipe(
  PluginManifestObject,
  v.check(
    (m) =>
      m.sandbox !== "worker" ||
      m.caps.every((cap) => WORKER_CAPABILITIES.includes(cap)),
    "a worker plugin may only ask for: pipeline",
  ),
);

export type PluginManifest = v.InferOutput<typeof PluginManifestSchema>;

/** Numeric comparison of `x.y.z` (a pre-release tag sorts below its release). */
export const compareVersions = (a: string, b: string): number => {
  const parse = (value: string) => {
    const [core, pre] = value.split("-", 2);
    return { nums: core.split(".").map(Number), pre };
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (left.nums[i] ?? 0) - (right.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (left.pre === right.pre) return 0;
  if (left.pre === undefined) return 1;
  if (right.pre === undefined) return -1;
  return left.pre < right.pre ? -1 : 1;
};

/** The description a plugin shows to a reader of `locale`: their language when
 * the author wrote it, else the plain `description`, else whatever there is. */
export const pluginDescription = (
  source: {
    description?: string;
    descriptions?: Partial<Record<Locale, string>>;
  },
  locale: Locale,
): string | undefined =>
  source.descriptions?.[locale] ??
  source.description ??
  source.descriptions?.en ??
  source.descriptions?.ru;
