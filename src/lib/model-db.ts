import * as v from "valibot";
import { storage } from "~/lib/storage";

/** Remote model database (mdb.yor.ovh): the non-own-model picker completes
 * against these entries; the download link goes into the Download
 * preprocessor, the upscale keeps only the bare name. The endpoint lists the
 * files of the model bucket; only `name` and `url` of each are used. */
const MODELS_ENDPOINT = "https://mdb.yor.ovh/v1/files";

/** The list changes slowly: a warm copy in localStorage lets a reload
 * complete model names without touching the network at all. */
// v2: the list moved to another endpoint with other download links — a copy
// of the old one must not be served for the next six hours
const CACHE_KEY = "reline-web:mdb:v2";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface MdbModel {
  name: string;
  url: string;
}

const ModelFilesSchema = v.array(
  v.object({ name: v.string(), url: v.pipe(v.string(), v.url()) }),
);
type ModelFile = v.InferOutput<typeof ModelFilesSchema>[number];

interface MdbCache {
  at: number;
  models: MdbModel[];
}

/** In-memory index: the app reads it synchronously (completion, legacy config
 * migration). Undefined until the localStorage cache or a fetch fills it. */
let models: MdbModel[] | undefined;
/** In-flight fetch; a rejection clears it, so the next call retries. */
let inflight: Promise<MdbModel[]> | undefined;

const normalize = (files: readonly ModelFile[]): MdbModel[] =>
  files
    .map((f) => ({ name: f.name, url: f.url }))
    .sort((a, b) => a.name.localeCompare(b.name));

const readCache = (): MdbCache | undefined => {
  // unreadable or invalid cache — fall back to the network
  const parsed = storage.getJson(CACHE_KEY) as Partial<MdbCache> | undefined;
  if (
    parsed === undefined ||
    parsed === null ||
    !Array.isArray(parsed.models) ||
    typeof parsed.at !== "number"
  )
    return undefined;
  return parsed as MdbCache;
};

const writeCache = (all: MdbModel[]): void => {
  // quota or storage disabled — the in-memory index still works
  storage.setJson(CACHE_KEY, {
    at: Date.now(),
    models: all,
  } satisfies MdbCache);
};

/** The whole database is fetched once per session and kept in memory: the
 * completion list used to refetch it on the first interaction, which showed
 * up as a lag exactly when a model was being picked. */
const fetchModels = (): Promise<MdbModel[]> => {
  inflight ??= fetch(MODELS_ENDPOINT)
    .then((r) => {
      if (!r.ok) throw new Error(`mdb: ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then((json) => {
      // a changed or broken payload is an error, not an empty list
      const all = normalize(v.parse(ModelFilesSchema, json));
      models = all;
      writeCache(all);
      return all;
    })
    .catch((err: unknown) => {
      // a failed fetch must not poison the index — retry on the next call
      inflight = undefined;
      throw err;
    });
  return inflight;
};

export const modelNames = (): Promise<MdbModel[]> =>
  models === undefined ? fetchModels() : Promise.resolve(models);

/** True once the index can be read synchronously. */
export const modelsLoaded = (): boolean => models !== undefined;

/** Download link of a model name from the loaded index (no fuzzy matching —
 * legacy configs carry the exact names the database was built from). */
export const modelUrl = (name: string): string | undefined => {
  const index = models;
  const query = name.trim().toLowerCase();
  if (index === undefined || query === "") return undefined;
  return index.find((m) => m.name.toLowerCase() === query)?.url;
};

/** Startup warm-up (called from the app root): seeds the index from the
 * localStorage cache — a reload completes instantly — and refreshes it in the
 * background when that copy is older than the TTL. Never rejects. */
export const preloadModelNames = async (): Promise<void> => {
  const cached = readCache();
  if (cached !== undefined && cached.models.length > 0) {
    models ??= cached.models;
    if (Date.now() - cached.at < CACHE_TTL_MS) return;
  }
  try {
    await fetchModels();
  } catch {
    // offline / CDN hiccup: the caller falls back to what is already loaded
  }
};

/** Levenshtein distance — model names are short, O(n*m) is fine. */
const levenshtein = (a: string, b: string): number => {
  let prev: number[] = Array.from({ length: b.length + 1 }, () => 0);
  let curr: number[] = Array.from({ length: b.length + 1 }, () => 0);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitute = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      curr[j] = Math.min(substitute, prev[j] + 1, curr[j - 1] + 1);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length];
};

/** The mdb entry for a typed model name: exact (case-insensitive) hit, or
 * the closest match, so a typed-but-invalid name can never reach a run. */
export const resolveModelName = async (
  input: string,
): Promise<MdbModel | undefined> => {
  const query = input.trim().toLowerCase();
  if (query === "") return undefined;
  const all = await modelNames();
  const exact = all.find((m) => m.name.toLowerCase() === query);
  if (exact !== undefined) return exact;
  let best: MdbModel | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const m of all) {
    const name = m.name.toLowerCase();
    let score = levenshtein(query, name);
    // a typed prefix/substring of the real name ranks closer than raw edits
    if (name.startsWith(query)) score -= query.length;
    else if (name.includes(query)) score -= query.length / 2;
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
};
