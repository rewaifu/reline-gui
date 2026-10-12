import type { Component } from "solid-js";
import { Label, UiSelect } from "~/components/ui";
import { LOCALE_NAMES, locale, setLocale, t, type Locale } from "~/lib/i18n";
import styles from "../config-panel.module.scss";

const LOCALES = Object.keys(LOCALE_NAMES) as Locale[];

/** Preferences of the editor itself, as opposed to the config it edits. Today:
 * the interface language. */
export const SettingsTab: Component = () => (
  <div class={styles.settings}>
    <Label for="ui-language">{t("panel.settings.language")}</Label>
    <UiSelect
      id="ui-language"
      value={locale()}
      items={LOCALES}
      itemLabel={(code) => LOCALE_NAMES[code as Locale]}
      onChange={(code) => setLocale(code as Locale)}
    />
  </div>
);
