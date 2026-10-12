import {
  createEffect,
  createMemo,
  createSignal,
  omit,
  untrack,
  type Component,
  For,
} from "solid-js";
import type { JSX } from "@solidjs/web";
import { Tabs } from "@rebase-ui/solid/tabs";
import { render, t, type LocalText } from "~/lib/i18n";
import { UiSelect } from "../select/select";
import { fitTabs } from "./fit";
import styles from "./tabs.module.scss";

export interface UiTabDef {
  value: string;
  /** Not formatted text: the label has to follow the language, and a tab list
   * is often a module-level constant. A dictionary key, or `raw()` for a
   * plugin's. */
  label: LocalText;
}

export interface UiTabsProps {
  value: string;
  onChange: (value: string) => void;
  tabs: readonly UiTabDef[];
  content: (value: string) => JSX.Element;
  class?: string;
}

const sameSet = (a: ReadonlySet<number> | undefined, b: ReadonlySet<number>) =>
  a !== undefined && a.size === b.size && [...b].every((i) => a.has(i));

/**
 * One row of tabs. What does not fit (plugins add their own, the panel is
 * narrow) moves into a burger menu at the end of the row; the selected tab
 * always stays on the row, so choosing one from the menu swaps it in. Tabs are
 * measured at their natural width while all of them stay mounted — the ones
 * in the menu are only taken out of the flow, so they keep their place in the
 * tab list for the roving focus and the panel wiring.
 */
export const UiTabs: Component<UiTabsProps> = (props) => {
  const rest = omit(props, "value", "onChange", "tabs", "content", "class");
  // indexes kept on the row; undefined until measured (everything shows)
  const [kept, setKept] = createSignal<ReadonlySet<number> | undefined>();
  let strip: HTMLDivElement | undefined;
  let list: HTMLDivElement | undefined;
  let burger: HTMLButtonElement | undefined;

  const onRow = (index: number) => kept()?.has(index) ?? true;
  const overflow = createMemo(() =>
    props.tabs.flatMap((tab, i) => (onRow(i) ? [] : [tab])),
  );
  const labelOf = (value: string) => {
    const tab = props.tabs.find((candidate) => candidate.value === value);
    return tab === undefined ? value : render(tab.label);
  };

  const measure = () => {
    if (strip === undefined || list === undefined || burger === undefined)
      return;
    const triggers = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
    const next = fitTabs({
      widths: triggers.map((trigger) => trigger.offsetWidth),
      active: props.tabs.findIndex((tab) => tab.value === props.value),
      available: strip.clientWidth,
      gap: parseFloat(getComputedStyle(list).columnGap) || 0,
      menu: burger.offsetWidth,
    });
    if (!sameSet(kept(), next)) setKept(next);
  };

  // re-fit when the tabs, their wording (language) or the selection change, and
  // whenever the strip or any tab changes size (window, fonts)
  createEffect(
    () => [props.value, props.tabs.map((tab) => render(tab.label)).join("\0")],
    () => {
      // the measurement reads the tabs and the selection itself; the compute
      // above is what subscribes to them
      untrack(measure);
      if (strip === undefined || list === undefined) return;
      const observer = new ResizeObserver(measure);
      observer.observe(strip);
      for (const trigger of list.querySelectorAll('[role="tab"]'))
        observer.observe(trigger);
      return () => observer.disconnect();
    },
  );

  return (
    <Tabs.Root
      {...rest}
      class={[styles.tabs, props.class]}
      value={props.value}
      onValueChange={(value) => props.onChange(value)}
    >
      <div ref={strip} class={styles.strip}>
        <Tabs.List ref={list} class={styles.list}>
          <For each={props.tabs}>
            {(tab, index) => (
              <Tabs.Tab
                value={tab.value}
                class={styles.trigger}
                // out of the flow, unfocusable and skipped by the arrow keys
                disabled={!onRow(index())}
                data-overflow={onRow(index()) ? undefined : ""}
              >
                {render(tab.label)}
              </Tabs.Tab>
            )}
          </For>
        </Tabs.List>
        <UiSelect
          ref={burger}
          variant="icon"
          class={styles.burger}
          // measured while idle, so it stays in the DOM and only leaves the flow
          data-idle={overflow().length === 0 ? "" : undefined}
          value={null}
          items={overflow().map((tab) => tab.value)}
          itemLabel={labelOf}
          onChange={props.onChange}
          ariaLabel={t("ui.moreTabs")}
        />
      </div>
      <Tabs.Panel value={props.value} class={styles.content}>
        {props.content(props.value)}
      </Tabs.Panel>
    </Tabs.Root>
  );
};
