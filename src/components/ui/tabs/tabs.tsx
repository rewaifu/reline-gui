import { omit, type Component, For } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Tabs } from "@kobalte/core/tabs";
import { t, type MessageKey } from "~/lib/i18n";
import styles from "./tabs.module.scss";

export interface UiTabDef {
  value: string;
  /** A dictionary key, not text: the label has to follow the language, and a
   * tab list is a module-level constant in every caller. */
  labelKey: MessageKey;
}

export interface UiTabsProps {
  value: string;
  onChange: (value: string) => void;
  tabs: readonly UiTabDef[];
  content: (value: string) => JSX.Element;
  class?: string;
}

export const UiTabs: Component<UiTabsProps> = (props) => {
  const rest = omit(props, "value", "onChange", "tabs", "content", "class");

  return (
    <Tabs
      class={[styles.tabs, props.class]}
      value={props.value}
      onChange={props.onChange}
      {...rest}
    >
      <Tabs.List class={styles.list}>
        <For each={props.tabs}>
          {(tab) => (
            <Tabs.Trigger value={tab.value} class={styles.trigger}>
              {t(tab.labelKey)}
            </Tabs.Trigger>
          )}
        </For>
      </Tabs.List>
      <Tabs.Content value={props.value} class={styles.content}>
        {props.content(props.value)}
      </Tabs.Content>
    </Tabs>
  );
};
