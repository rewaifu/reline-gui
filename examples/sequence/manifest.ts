import type { PluginManifestSource } from "../../sdk/vite";

/** What the plugin asks for, and why:
 *  - ui:      the "Sequence" tab and a progress badge in the top bar
 *  - storage: the list of steps survives a reload
 *  - run:     start each step on the runner and wait for it to end
 *  - config:  read the steps' configs, validate them, replace the editor's stack
 *  - store:   read the editor's stack ("add current stack as a step")
 *  - i18n:    its own wording, Russian and English
 */
export const manifest: PluginManifestSource = {
  id: "reline.sequence",
  name: "Config sequence",
  version: "1.2.0",
  description:
    "Build a pipeline out of several configs and run them one after another.",
  descriptions: {
    ru: "Собирает пайплайн из нескольких конфигов и запускает их по очереди.",
    en: "Build a pipeline out of several configs and run them one after another.",
  },
  caps: ["ui", "storage", "run", "config", "store", "i18n"],
};
