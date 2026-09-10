/** Remote model database (mdb.yor.ovh): the non-own-model picker completes
 * against these entries; the download link goes into the Download
 * preprocessor, the upscale keeps only the bare name. */
const ENDPOINT = "https://cdn.animeai.ovh/wtp_forover/files.json";

/** The list changes slowly: a warm copy in localStorage lets a reload
 * complete model names without touching the network at all. */
const CACHE_KEY = "reline-web:mdb";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface MdbModel {
  name: string;
  url: string;
}

interface ModelFile {
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
/** In-flight fetch; a rejection clears it, so the next call retries. */
let inflight: Promise<MdbModel[]> | undefined;

const normalize = (files: readonly ModelFile[]): MdbModel[] =>
  files
    .map((f) => ({ name: f.name, url: f.url }))
    .sort((a, b) => a.name.localeCompare(b.name));

const readCache = (): MdbCache | undefined => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as MdbCache;
    if (!Array.isArray(parsed.models) || typeof parsed.at !== "number") {
      return undefined;
    }
    return parsed;
  } catch {
    // unreadable or invalid cache — fall back to the network
    return undefined;
  }
};

const writeCache = (all: MdbModel[]): void => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), models: all } satisfies MdbCache),
    );
  } catch {
    // quota or storage disabled — the in-memory index still works
  }
};

/** The whole database is fetched once per session and kept in memory: the
 * completion list used to refetch it on the first interaction, which showed
 * up as a lag exactly when a model was being picked. */
const fetchModels = (): Promise<MdbModel[]> => {
  inflight ??= fetch(ENDPOINT)
    .then((r) => {
      if (!r.ok) throw new Error(`mdb: ${r.status}`);
      return r.json() as Promise<ModelFile[]>;
    })
    .then((files) => {
      const all = normalize(files);
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
