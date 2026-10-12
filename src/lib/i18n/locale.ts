import { createSignal } from "solid-js";
import { storage } from "~/lib/storage";

/** The languages the UI ships. The type is deliberately narrow: every
 * dictionary is keyed by it, so a third language stays a type error until its
 * messages exist. */
export type Locale = "ru" | "en";

/** Language names in their own language: a switcher reading "Английский" is
 * useless to the person who needs English. */
export const LOCALE_NAMES: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
};

const STORAGE_KEY = "reline-web:locale";

const stored = (): Locale | undefined => {
  // blocked storage (private mode) reads as nothing: detect per session
  const raw = storage.get(STORAGE_KEY);
  return raw === "ru" || raw === "en" ? raw : undefined;
};

/** Stored choice first, then the browser's languages. Russian is the default
 * for anything unrecognised: the content the app is built around is
 * Russian-first. */
const initial = (): Locale => {
  const kept = stored();
  if (kept !== undefined) return kept;
  // no DOM (prerender, a test): the shell is Russian, the same default an
  // unrecognised browser gets
  if (typeof navigator === "undefined") return "ru";
  const langs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  return langs.some((lang) => lang.toLowerCase().startsWith("ru"))
    ? "ru"
    : "en";
};

const [locale, setLocaleSignal] = createSignal<Locale>(initial());

export { locale };

/** Switching costs one write and one signal set: every label in the app reads
 * `locale()` through `t()`, so nothing else has to be invalidated by hand. */
export const setLocale = (next: Locale): void => {
  setLocaleSignal(next);
  // storage unavailable — the choice lives for this session
  storage.set(STORAGE_KEY, next);
};
