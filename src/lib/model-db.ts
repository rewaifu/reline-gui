import * as v from "valibot";
import { storage } from "~/lib/storage";
import { wsHub } from "~/lib/ws";
import { ModelsReply } from "~/lib/ws/core";

/** The model database: the non-own-model picker completes against these
 * entries; the download link goes into the Download preprocessor, the upscale
 * keeps only the bare name. The list comes from the **runner** (`models`
 * method, WS_API.md): the runner fetches and keeps it, so who can reach the
 * database is decided by where the runner lives, not by the visitor's network.
 * Nothing here dials the runner on its own at page load — it is asked when the
 * list is first needed. */
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

interface MdbCache {
  at: number;
  models: MdbModel[];
}

/** In-memory index: the app reads it synchronously (completion, legacy config
 * migration). Undefined until the localStorage cache or a fetch fills it. */
let models: MdbModel[] | undefined;
/** When `models` was fetched (or cached, for a seeded copy). */
let loadedAt: number | undefined;
/** In-flight fetch; a rejection clears it, so the next call retries. */
let inflight: Promise<MdbModel[]> | undefined;

const normalize = (files: readonly MdbModel[]): MdbModel[] =>
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

/** Asks the runner for the list. Concurrent callers share one request; a
 * failure (no runner, an old runner without `models`, a broken reply) rejects
 * and leaves the index as it was, so the next call tries again. */
const fetchModels = (): Promise<MdbModel[]> => {
  inflight ??= wsHub
    .call("models", {})
    .then((reply) => {
      // a changed or broken payload is an error, not an empty list
      const all = normalize(v.parse(ModelsReply, reply).files);
      models = all;
      loadedAt = Date.now();
      writeCache(all);
      return all;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
};

const isStale = (): boolean =>
  loadedAt === undefined || Date.now() - loadedAt >= CACHE_TTL_MS;

/** The model list. Served from memory; a copy past the TTL is served as it is
 * and refreshed behind the caller, so completion never waits for the runner
 * once it has had a list. With no list yet it asks the runner. */
export const modelNames = (): Promise<MdbModel[]> => {
  if (models === undefined) return fetchModels();
  // the stale copy is good enough to answer with; a failed refresh changes nothing
  if (isStale()) void fetchModels().catch(() => undefined);
  return Promise.resolve(models);
};

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

/** Fills the index from the localStorage copy, without any network: a reload
 * completes model names at once. Called when the app starts — the runner is
 * not dialled until someone needs the list. */
export const seedModelNames = (): void => {
  if (models !== undefined) return;
  const cached = readCache();
  if (cached === undefined || cached.models.length === 0) return;
  models = cached.models;
  loadedAt = cached.at;
};

/** Makes the index as complete as it can be before a caller reads it
 * synchronously (the legacy-config import looks download links up): seeds
 * from the localStorage copy and asks the runner when that copy is missing or
 * old. Never rejects — an import without links is better than no import. */
export const preloadModelNames = async (): Promise<void> => {
  seedModelNames();
  if (!isStale()) return;
  try {
    await fetchModels();
  } catch {
    // no runner, or one that does not know `models`: use what is loaded
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
