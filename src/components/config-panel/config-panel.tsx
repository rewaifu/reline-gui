import {
  type Accessor,
  type Component,
  Errored,
  Show,
  createEffect,
  createMemo,
  createSignal,
} from "solid-js";
import { Dynamic } from "@solidjs/web";
import { UiTabs } from "~/components/ui";
import { pipeline } from "~/lib/pipeline/hooks";
import { uiRegistry } from "~/lib/ui/registry";
import { pluginRuntime } from "~/lib/plugins/runtime";
import "./builtin-tabs";
import styles from "./config-panel.module.scss";

export interface ConfigPanelProps {
  selectedUid: () => string | null;
}

const FALLBACK_TAB = "code";

/** The settings panel: a tab strip over whatever the panel registry holds — the
 * host's four tabs and any a plugin added. Each tab renders inside its own error
 * boundary, so a plugin tab that throws costs that tab, not the panel. */
export const ConfigPanel: Component<ConfigPanelProps> = (props) => {
  const [chosen, setChosen] = createSignal<string>(FALLBACK_TAB);
  // a `?plugin=` link opens the tab that asks the user about it
  createEffect(
    () => pluginRuntime.pendingInstall(),
    (link) => {
      if (link !== undefined) setChosen("plugins");
    },
  );
  const tabs = () => uiRegistry.panelTabs();
  // the chosen tab can disappear (its plugin was switched off): fall back
  // instead of showing an empty panel
  // a memo, not a function: `value` is read inside the panel's children, and a
  // plain function would re-run them (remounting the open tab, state and all)
  // on every registry change — a plugin registering a tab is one — even when
  // the answer is the same tab
  const active = createMemo(() =>
    tabs().some((tab) => tab.id === chosen()) ? chosen() : FALLBACK_TAB,
  );

  return (
    <UiTabs
      value={active()}
      onChange={setChosen}
      tabs={tabs().map((tab) => ({ value: tab.id, label: tab.label }))}
      class={styles.panel}
      content={(value) => (
        <Show when={tabs().find((tab) => tab.id === value)}>
          {(tab) => (
            <Errored
              fallback={(error: Accessor<unknown>) => {
                pipeline.report("ui", `tab:${tab().id}`, error());
                return null;
              }}
            >
              <Show
                when={tab().scroll}
                fallback={
                  <Dynamic
                    component={tab().Component}
                    selectedUid={props.selectedUid}
                  />
                }
              >
                <div class={styles.tabScroll}>
                  <Dynamic
                    component={tab().Component}
                    selectedUid={props.selectedUid}
                  />
                </div>
              </Show>
            </Errored>
          )}
        </Show>
      )}
    />
  );
};
