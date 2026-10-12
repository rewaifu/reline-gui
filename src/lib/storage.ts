/**
 * The one door to `localStorage`.
 *
 * Every read and write in the app goes through here, so the failure modes
 * (storage blocked in private mode, a full quota, a prerender or test runner
 * with no storage at all, text that is not JSON) are handled once instead of
 * in a dozen hand-written `try/catch` blocks. `localStorage` is looked up on
 * every call, never captured: tests stub the global after import.
 *
 * Writers report whether the value landed; a caller that can degrade (keep the
 * value in memory) ignores the result, one that must tell the user checks it.
 */
const area = (): Storage | undefined => {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

export const storage = {
  /** The stored text, or `undefined` when missing or storage is unreadable. */
  get(key: string): string | undefined {
    try {
      return area()?.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  },

  /** `true` when the value was stored. */
  set(key: string, value: string): boolean {
    try {
      const target = area();
      if (target === undefined) return false;
      target.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },

  /** Every stored key that starts with `prefix`. */
  keys(prefix: string): string[] {
    try {
      const target = area();
      if (target === undefined) return [];
      const found: string[] = [];
      for (let i = 0; i < target.length; i++) {
        const key = target.key(i);
        if (key !== null && key.startsWith(prefix)) found.push(key);
      }
      return found;
    } catch {
      return [];
    }
  },

  remove(key: string): void {
    try {
      area()?.removeItem(key);
    } catch {
      // storage unavailable: nothing was kept, nothing to remove
    }
  },

  /** Parsed JSON, or `undefined` when missing, unreadable or not JSON. The
   * shape is the caller's to check — storage can hold anything an older build
   * or a hand edit left behind. */
  getJson(key: string): unknown {
    const text = storage.get(key);
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  },

  /** `true` when the value was serialised and stored. */
  setJson(key: string, value: unknown): boolean {
    try {
      return storage.set(key, JSON.stringify(value));
    } catch {
      return false;
    }
  },
};
