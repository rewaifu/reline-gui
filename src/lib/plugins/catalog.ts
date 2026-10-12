import * as v from "valibot";
import { MAX_MANIFEST_BYTES, PluginLoadError, fetchText } from "./loader";
import { Integrity, PluginManifestObject } from "./manifest";

/**
 * The plugins the web build vouches for: a JSON file served next to the app
 * (`plugins/index.json`), listing manifests it ships and the exact code (its
 * SHA-384) each one is allowed to have. It is a shop window, not a gate — an
 * entry is installed through the same preview and consent as a link typed by
 * hand, and an entry whose manifest no longer carries the listed hash is
 * refused.
 *
 * Generated from the manifests by `scripts/build-catalog.mjs`; a test keeps the
 * two from drifting.
 */
const CatalogEntrySchema = v.object({
  ...v.pick(PluginManifestObject, [
    "id",
    "name",
    "version",
    "description",
    "descriptions",
    "caps",
    "sandbox",
  ]).entries,
  /** The manifest, as a URL relative to the catalog. */
  manifest: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  /** SHA-384 of the entry code the manifest must pin. */
  integrity: Integrity,
});

const CATALOG_SCHEMA_VERSION = 1;

const CatalogSchema = v.pipe(
  v.object({
    schema: v.literal(CATALOG_SCHEMA_VERSION),
    name: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
    plugins: v.array(CatalogEntrySchema),
  }),
  v.check(
    (catalog) =>
      new Set(catalog.plugins.map((entry) => entry.id)).size ===
      catalog.plugins.length,
    "plugin ids must be unique",
  ),
);

export type CatalogEntry = v.InferOutput<typeof CatalogEntrySchema>;

/** A catalog entry with the manifest link resolved: what the install flow takes. */
export interface CatalogPlugin extends CatalogEntry {
  manifestUrl: string;
}

export interface Catalog {
  name: string;
  plugins: CatalogPlugin[];
}

/** Where the built-in catalog lives: beside the app, like its other assets. */
const defaultCatalogUrl = (): string =>
  new URL(`${import.meta.env.BASE_URL}plugins/index.json`, window.location.href)
    .href;

/** Read and check a catalog. Any failure is a `PluginLoadError` — the catalog
 * is a convenience, and the Plugins tab keeps working without it. */
export const loadCatalog = async (
  url: string = defaultCatalogUrl(),
): Promise<Catalog> => {
  const text = await fetchText(new URL(url), MAX_MANIFEST_BYTES);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PluginLoadError("manifest", "the catalog is not JSON");
  }
  const parsed = v.safeParse(CatalogSchema, json);
  if (!parsed.success) {
    const issue = parsed.issues[0];
    throw new PluginLoadError(
      "manifest",
      `catalog ${issue.path?.map((p) => String(p.key)).join(".") ?? ""}: ${issue.message}`,
    );
  }
  const base = new URL(url);
  return {
    name: parsed.output.name,
    plugins: parsed.output.plugins.map((entry) => ({
      ...entry,
      manifestUrl: new URL(entry.manifest, base).href,
    })),
  };
};

/** The entries that match every word of `query` in the name, id, either
 * description, the permissions or the tier. An empty query keeps them all. */
export const searchCatalog = (
  plugins: readonly CatalogPlugin[],
  query: string,
): CatalogPlugin[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...plugins];
  return plugins.filter((plugin) => {
    const haystack = [
      plugin.name,
      plugin.id,
      plugin.description,
      plugin.descriptions?.ru,
      plugin.descriptions?.en,
      plugin.sandbox,
      ...plugin.caps,
    ]
      .filter((part) => part !== undefined)
      .join("\n")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
};
