import { locale } from "./locale";
import { pluginDictionary } from "./plugin-dict";
import { en, ru, type Messages } from "./messages";

export { locale, setLocale, LOCALE_NAMES, type Locale } from "./locale";
export { pluginDictionary } from "./plugin-dict";

/** Dotted path to a leaf of the dictionary (`"form.upscale.model"`). Keys are
 * checked at compile time, so a typo never reaches the screen as `undefined`. */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type MessageKey = Paths<Messages>;

/** Text that came from outside the dictionaries — a label the runner sent, a
 * file name, a run log. Kept verbatim: it must never be looked up as a key. */
export interface RawText {
  readonly raw: string;
}

/** A message that is formatted when it renders, not when it is written: the
 * run journal stores these so a line written in one language reads in the
 * other after a switch. */
export interface MessageDescriptor {
  readonly key: MessageKey;
  readonly params?: MessageParams;
}

/** A line from a plugin's own words (`pluginDictionary`), found by plugin id and
 * key at render time, so it follows the language like any other. */
export interface PluginText {
  readonly plugin: string;
  readonly key: string;
  readonly params?: MessageParams;
}

export type LocalText = MessageKey | MessageDescriptor | RawText | PluginText;

/** Values for `{name}` placeholders. A plain string is used verbatim (server
 * text, a URL, a name); pass a descriptor or `raw(...)` when the value itself
 * must be translated. */
export type MessageParams = Record<
  string,
  string | number | RawText | MessageDescriptor | PluginText
>;

const walk = (dict: Messages, key: string): string | undefined =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      dict,
    ) as string | undefined;

/** `{name}` placeholders. A name with no value is left verbatim: a typo shows
 * up as `{nmae}` on the screen instead of silently eating the text. */
const interpolate = (
  text: string,
  params: MessageParams | undefined,
): string =>
  params === undefined
    ? text
    : text.replace(/\{(\w+)\}/gu, (match, name: string) => {
        const value = params[name];
        if (value === undefined) return match;
        return typeof value === "object" ? render(value) : String(value);
      });

/** A message in the language the user picked.
 *
 * Reading `locale()` here is what makes every call site reactive: a component
 * that formats inside JSX re-renders on a switch, with no subscription
 * bookkeeping anywhere. Do not hoist a `t(...)` result into a module
 * constant — that freezes one language for the whole session (keep the key
 * and call `t` where it renders instead). */
export const t = (key: MessageKey, params?: MessageParams): string => {
  const dict = locale() === "ru" ? ru : en;
  return interpolate(walk(dict, key) ?? walk(en, key) ?? key, params);
};

export const raw = (value: string): RawText => ({ raw: value });

export const pluginText = (
  plugin: string,
  key: string,
  params?: MessageParams,
): PluginText => ({ plugin, key, params });

export const message = (
  key: MessageKey,
  params?: MessageParams,
): MessageDescriptor => ({ key, params });

/** Render stored text in the current language. Journal lines keep the key they
 * were born with, so a line written during a Russian session is readable after
 * the switcher flips to English. */
export const render = (value: LocalText): string =>
  typeof value === "string"
    ? t(value)
    : "raw" in value
      ? value.raw
      : "plugin" in value
        ? interpolate(
            pluginDictionary.lookup(value.plugin, value.key),
            value.params,
          )
        : t(value.key, value.params);
