/**
 * @reline/plugin-sdk — what a Reline plugin imports.
 *
 * A plugin is one ES module whose default export is `definePlugin({ activate })`,
 * published next to a `plugin.json` manifest. The host calls `activate(api)` once;
 * everything the plugin registers through `api` is undone when it is switched off.
 * See docs/PLUGINS.en.md (English) and docs/PLUGINS.ru.md (Russian).
 */
import type {
  PluginApi,
  NodesApi,
  UiApi,
  UiKit,
  PipelineApi,
  StoreApi,
  WsApi,
  I18nApi,
  StorageApi,
  RunApi,
  ConfigApi,
} from "../src/lib/plugins/api";
import type { Capability } from "../src/lib/plugins/manifest";

export type {
  PluginApi,
  NodesApi,
  UiApi,
  UiKit,
  PipelineApi,
  StoreApi,
  WsApi,
  I18nApi,
  StorageApi,
  RunApi,
  ConfigApi,
  Capability,
};
export type { PluginManifest } from "../src/lib/plugins/manifest";
export type { NodeDef } from "../src/lib/nodes/types";
export type { Diagnostic } from "../src/lib/pipeline/types";
export type { Frame } from "../src/lib/ws/codec";
export type { StageHooks, Stage, HookOptions } from "../src/lib/pipeline/hooks";
export type { AnyAction } from "../src/types/actions";
export type { RunOutcome } from "../src/lib/run-client";
export type {
  PureConfig,
  PureNode,
  StackNode,
  NodeOptions,
} from "../src/types/node";
export type { Analysis } from "../src/lib/config";
export type { LocalText, MessageParams } from "../src/lib/i18n";

/** The namespaces of the permissions a plugin was written for are present — not
 * optional: declare the same list in `plugin.json` and the user is asked for
 * exactly that. */
export type PluginApiFor<C extends Capability> = Omit<PluginApi, C> &
  Required<Pick<PluginApi, C>>;

export interface PluginDefinition<C extends Capability = never> {
  /** Called once when the plugin starts. May be async (give it a few seconds at
   * most). May return a cleanup function. */
  activate(
    api: PluginApiFor<C>,
  ): void | (() => void) | Promise<void | (() => void)>;
}

/** Declare a plugin. The identity function — it exists so the capability list
 * types `api`:
 *
 *   export default definePlugin<"ui" | "storage">({ activate(api) { … } });
 */
export const definePlugin = <C extends Capability = never>(
  definition: PluginDefinition<C>,
): PluginDefinition<C> => definition;
