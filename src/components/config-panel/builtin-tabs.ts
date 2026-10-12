import { uiRegistry } from "~/lib/ui/registry";
import { PluginsTab } from "~/components/plugins/plugins-tab";
import { CodeTab } from "./tabs/code-tab";
import { InstructionsTab } from "./tabs/instructions-tab";
import { PresetsTab } from "./tabs/presets-tab";
import { RunTab } from "./tabs/run-tab";
import { SettingsTab } from "./tabs/settings-tab";

/** The settings panel's own tabs, registered like a plugin's. Orders 10–40
 * leave room before and between: a plugin's tab defaults to 100. */
uiRegistry.panelTab({
  id: "instructions",
  label: "panel.tabs.instructions",
  Component: InstructionsTab,
  order: 10,
});
uiRegistry.panelTab({
  id: "code",
  label: "panel.tabs.code",
  Component: CodeTab,
  order: 20,
});
uiRegistry.panelTab({
  id: "presets",
  label: "panel.tabs.presets",
  Component: PresetsTab,
  order: 30,
});
uiRegistry.panelTab({
  id: "run",
  label: "panel.tabs.run",
  Component: RunTab,
  order: 40,
});
uiRegistry.panelTab({
  id: "settings",
  label: "panel.tabs.settings",
  Component: SettingsTab,
  order: 45,
  scroll: true,
});
uiRegistry.panelTab({
  id: "plugins",
  label: "panel.tabs.plugins",
  Component: PluginsTab,
  order: 50,
  scroll: true,
});
