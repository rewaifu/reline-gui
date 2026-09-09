/** Remote model database (mdb.yor.ovh): the non-own-model picker completes
 * against these entries; the download link goes into the Download
 * preprocessor, the upscale keeps only the bare name. */
const ENDPOINT = "https://cdn.animeai.ovh/wtp_forover/files.json";

export interface MdbModel {
  name: string;
  url: string;
}

interface ModelFile {
  name: string;
  url: string;
}

let cache: Promise<MdbModel[]> | undefined;

export const modelNames = (): Promise<MdbModel[]> => {
  if (cache === undefined) {
    cache = fetch(ENDPOINT)
      .then((r) => {
        if (!r.ok) throw new Error(`mdb: ${r.status}`);
        return r.json() as Promise<ModelFile[]>;
      })
      .then((files) =>
        files
          .map((f) => ({ name: f.name, url: f.url }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    // a failed fetch must not poison the cache — retry on the next focus
    cache.catch(() => {
      cache = undefined;
    });
  }
  return cache;
};

/** Levenshtein distance — model names are short, O(n*m) is fine. */
const levenshtein = (a: string, b: string): number => {
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
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
  input: string
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
