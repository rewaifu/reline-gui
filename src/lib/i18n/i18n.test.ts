import { flush } from "solid-js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  locale,
  message,
  raw,
  render,
  setLocale,
  t,
  type MessageKey,
} from "~/lib/i18n";
import { en, ru } from "~/lib/i18n/messages";

/** The dictionary as a flat `path → text` map, for parity checks. */
const flatten = (value: unknown, prefix = ""): [string, string][] => {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix === "" ? key : `${prefix}.${key}`),
  );
};

/** Solid 2 defers a signal write to the next flush, so a test that reads a
 * message right after switching the language has to flush first. */
const use = (next: "ru" | "en") => {
  setLocale(next);
  flush();
};

describe("messages", () => {
  beforeEach(() => use("ru"));

  it("follows the switcher", () => {
    expect(t("node.upscale")).toBe("Апскейл");
    use("en");
    expect(t("node.upscale")).toBe("Upscale");
    expect(locale()).toBe("en");
    use("ru");
    expect(t("node.upscale")).toBe("Апскейл");
  });

  it("fills placeholders", () => {
    expect(t("chrome.enable", { name: "Upscale" })).toBe("Включить Upscale");
    use("en");
    expect(t("chrome.enable", { name: "Upscale" })).toBe("Enable Upscale");
    expect(t("panel.status.presetApplied", { name: "Mangascale" })).toBe(
      "Preset “Mangascale” applied",
    );
  });

  it("resolves a nested message used as a parameter", () => {
    use("en");
    expect(
      render(
        message("panel.status.invalidJson", {
          detail: message("run.unknown"),
        }),
      ),
    ).toBe("Invalid JSON: unknown");
  });

  it("leaves a placeholder it has no value for", () => {
    expect(t("chrome.enable", {})).toBe("Включить {name}");
  });

  it("renders keys, descriptors and foreign text", () => {
    expect(render("node.level")).toBe("Уровни");
    expect(render(message("run.stopped"))).toBe("Остановлено");
    expect(render(raw("4x_wtp_MangaScale_GfisrV2"))).toBe(
      "4x_wtp_MangaScale_GfisrV2",
    );
    // a description saved before i18n is plain text, not a key: the cast is
    // the point of the test — a stored string from an older build must come
    // back untouched instead of being lost to the lookup
    const legacy = "Пользовательский пресет" as MessageKey;
    expect(render(legacy)).toBe("Пользовательский пресет");
  });

  it("keeps the two dictionaries in step", () => {
    const ruEntries = flatten(ru);
    const enEntries = flatten(en);
    expect(enEntries.map(([key]) => key)).toEqual(
      ruEntries.map(([key]) => key),
    );
    // an empty string is a translation that was never written
    expect(enEntries.filter(([, text]) => text.trim() === "")).toEqual([]);
    expect(ruEntries.filter(([, text]) => text.trim() === "")).toEqual([]);
  });
});
