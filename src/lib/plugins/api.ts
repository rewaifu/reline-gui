import type { Accessor, Component, Store } from "solid-js";
import * as solid from "solid-js";
import * as web from "@solidjs/web";
import type { ActionReducer } from "~/context/actions";
import { onStoreAction, storeActions } from "~/context/actions";
import { dispatchAction, stackNodes } from "~/context/store-bridge";
import { analyze, stringToNodes, type Analysis } from "~/lib/config";
import { convertToStack, exportConfig } from "~/lib/convert";
import {
  pluginDictionary,
  pluginText,
  render,
  type Locale,
  type LocalText,
  type MessageParams,
} from "~/lib/i18n";
import { modelUrl } from "~/lib/model-db";
import { createNode, nodeRegistry, type NodeDef } from "~/lib/nodes";
import { pipeline } from "~/lib/pipeline/hooks";
import type {
  HookOptions,
  HookFailure,
  Stage,
  StageHooks,
} from "~/lib/pipeline/hooks";
import {
  runClient,
  type RunOutcome,
  type RunPhase,
  type RunProgress,
} from "~/lib/run-client";
import { storage } from "~/lib/storage";
import { Icon, Input, UiButton, UiIconButton, UiSwitch } from "~/components/ui";
import { uiRegistry } from "~/lib/ui/registry";
import type {
  OverridableId,
  OverrideWrap,
  PanelTabDef,
  SlotContext,
  SlotName,
  SlotOptions,
} from "~/lib/ui/registry";
import {
  endpoint,
  wsHub,
  wsMethods,
  type RequestOptions,
  type WsMethod,
} from "~/lib/ws";
import type { AnyAction } from "~/types/actions";
import { NodesActionType } from "~/types/actions";
import type { PureConfig, StackNode } from "~/types/node";
import type { Capability, PluginManifest } from "./manifest";
import { PLUGIN_API_VERSION } from "./manifest";

/**
 * The object a plugin's `activate` receives. Each namespace exists only when the
 * manifest asked for its capability *and* the user granted it; everything a
 * namespace registers is undone when the plugin is switched off.
 *
 * Names a plugin owns are prefixed with its id so two plugins cannot collide and
 * the host's own can never be shadowed: node types `<id>.<name>`, store actions
 * `<id>:<name>`, WS methods `x.<id>.<name>`, storage keys under the plugin.
 */
type Dispose = () => void;

export interface NodesApi {
  /** Add a node type. `def.type` must be `<id>.<name>`. */
  define(def: NodeDef): Dispose;
  /** Change fields of any node type — a built-in's defaults, form, converters. */
  patch(type: string, changes: Partial<NodeDef>): Dispose;
  /** Keep a type out of the add and swap menus. */
  hide(type: string): Dispose;
  get(type: string): NodeDef | undefined;
  list(): NodeDef[];
  /** A new node with the type's defaults and its own uid. */
  create(type: string): StackNode | undefined;
}

/** The editor's own controls, so a plugin's panel looks like the rest of the
 * app and follows its tokens, density and touch sizes. Components, not class
 * names: the host's styles are scoped and a plugin cannot name them. */
export interface UiKit {
  Button: typeof UiButton;
  IconButton: typeof UiIconButton;
  Switch: typeof UiSwitch;
  Input: typeof Input;
  Icon: typeof Icon;
}

export interface UiApi {
  /** The host's controls — use these instead of drawing your own. */
  readonly kit: UiKit;
  /** Put a component into a slot; it receives that slot's context. */
  slot<N extends SlotName>(
    name: N,
    Component: Component<SlotContext[N]>,
    options?: Pick<SlotOptions, "order">,
  ): Dispose;
  /** Replace or wrap a host component: `wrap` gets the one that was there. */
  override<I extends OverridableId>(id: I, wrap: OverrideWrap<I>): Dispose;
  /** Add a settings-panel tab; its id is made unique with the plugin's. */
  panelTab(def: PanelTabDef): Dispose;
  /** Global CSS, after the host's. Scope your own selectors. */
  styles(css: string): Dispose;
}

export interface PipelineApi {
  /** Hook a stage. Pass an `id` to be ordered against (`before` / `after`). */
  use<S extends Stage>(
    stage: S,
    fn: StageHooks[S],
    options?: HookOptions,
  ): Dispose;
  failures(): readonly HookFailure[];
}

export interface StoreApi {
  /** The live stack. Reads inside a component or effect are reactive. */
  nodes(): Store<StackNode[]>;
  dispatch(action: AnyAction): void;
  /** Define an action. `type` must be `<id>:<name>`. */
  action(type: string, reducer: ActionReducer): Dispose;
  /** Told after every action that went through. */
  observe(
    listener: (action: { type: string; payload?: unknown }) => void,
  ): Dispose;
}

export interface WsApi {
  /** Declare a request/response method. `name` must be `x.<id>.<name>`. */
  method<Req, Res>(def: WsMethod<Req, Res>): Dispose;
  /** Call a declared method of yours (or the core's `ls`). */
  call(name: string, data?: Record<string, unknown>): Promise<unknown>;
  request(
    method: string,
    data?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<Record<string, unknown>>;
  /** Frames of one of your methods the runner pushes. */
  on(method: string, handler: (data: Record<string, unknown>) => void): Dispose;
  /** Keep the shared connection up (for pushes). */
  open(): void;
}

export interface I18nApi {
  /** Add lines for a language. Keys are yours; dotted is fine. */
  add(locale: Locale, entries: Record<string, string>): Dispose;
  /** A line that renders in the reader's language — for `Diagnostic.message`,
   * node labels, tab labels. */
  text(key: string, params?: MessageParams): LocalText;
  /** The line as a string now (reactive in JSX). */
  t(key: string, params?: MessageParams): string;
}

export interface StorageApi {
  get(key: string): string | undefined;
  set(key: string, value: string): boolean;
  remove(key: string): void;
  getJson(key: string): unknown;
  setJson(key: string, value: unknown): boolean;
  /** Bytes (characters) in use of the plugin's quota. */
  usage(): number;
}

export interface RunApi {
  /** Start a run and wait for how it ends. Rejects when one is already going. */
  start(config: PureConfig): Promise<RunOutcome>;
  stop(): void;
  phase: Accessor<RunPhase>;
  progress: Accessor<RunProgress | undefined>;
  endpoint(): string;
  onFinish(listener: (outcome: RunOutcome) => void): Dispose;
}

export interface ConfigApi {
  /** Serialise and validate a stack. */
  analyze(nodes: readonly StackNode[]): Analysis;
  toPure(nodes: readonly StackNode[]): PureConfig;
  fromPure(config: PureConfig): StackNode[];
  /** A config's JSON text as nodes. */
  parse(text: string): StackNode[];
  /** Replace the editor's stack. */
  replaceStack(nodes: StackNode[]): void;
}

export interface PluginApi {
  readonly id: string;
  readonly version: string;
  readonly apiVersion: typeof PLUGIN_API_VERSION;
  /** The host's own copies of Solid — a plugin must use these, never its own. */
  readonly solid: typeof solid;
  readonly web: typeof web;
  /** A line in the plugin's log (shown in the Plugins tab). */
  log(...parts: unknown[]): void;
  /** Run `fn` when the plugin is switched off. */
  onDispose(fn: () => void): void;
  readonly nodes?: NodesApi;
  readonly ui?: UiApi;
  readonly pipeline?: PipelineApi;
  readonly store?: StoreApi;
  readonly ws?: WsApi;
  readonly i18n?: I18nApi;
  readonly storage?: StorageApi;
  readonly run?: RunApi;
  readonly config?: ConfigApi;
}

/** What the runtime gives `createPluginApi` to work with. */
export interface PluginScope {
  manifest: PluginManifest;
  granted: ReadonlySet<Capability>;
  /** Run when the plugin is switched off, last registered first. */
  own(dispose: Dispose): void;
  log(line: string): void;
}

/** Plugin storage quota, in characters of key + value. */
const PLUGIN_STORAGE_QUOTA = 256 * 1024;

const OWN_PREFIX = "reline-web:plugin:";

/** Hooks of the stages that touch more than the config. */
const STAGE_CAPS: Partial<Record<Stage, Capability>> = {
  "ws.send": "ws",
  "ws.receive": "ws",
  "store.action": "store",
};

const describe = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

export const createPluginApi = (scope: PluginScope): PluginApi => {
  const { manifest, granted } = scope;
  const id = manifest.id;
  const has = (cap: Capability) => granted.has(cap);
  const track = (dispose: Dispose): Dispose => {
    scope.own(dispose);
    return dispose;
  };
  const fail = (what: string, rule: string): never => {
    throw new Error(`${id}: ${what} ${rule}`);
  };
  const requirePrefix = (value: string, prefix: string, what: string) => {
    if (!value.startsWith(prefix))
      fail(`${what} "${value}"`, `must start with "${prefix}"`);
  };

  /** A plugin's code in the middle of the host's flow must not take it down:
   * these run while a node is sanitised or created. */
  const guard =
    <A extends unknown[], R>(
      name: string,
      fn: (...args: A) => R,
      fallback: R,
    ): ((...args: A) => R) =>
    (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        pipeline.report("nodes", `${id}:${name}`, error);
        return fallback;
      }
    };

  const hardened = <T extends Partial<NodeDef>>(def: T): T => {
    const copy = { ...def };
    if (copy.defaults !== undefined)
      copy.defaults = guard("defaults", copy.defaults, {});
    if (copy.normalize !== undefined) {
      const normalize = copy.normalize;
      copy.normalize = (options) => {
        try {
          normalize(options);
        } catch (error) {
          pipeline.report("nodes", `${id}:normalize`, error);
        }
      };
    }
    return copy;
  };

  const api: {
    -readonly [K in keyof PluginApi]: PluginApi[K];
  } = {
    id,
    version: manifest.version,
    apiVersion: PLUGIN_API_VERSION,
    solid,
    web,
    log: (...parts) => scope.log(parts.map(describe).join(" ")),
    onDispose: (fn) => scope.own(fn),
  };

  if (has("nodes"))
    api.nodes = {
      define: (def) => {
        if (def.type !== id) requirePrefix(def.type, `${id}.`, "node type");
        return track(nodeRegistry.define(hardened(def)));
      },
      patch: (type, changes) =>
        track(nodeRegistry.patch(type, hardened(changes))),
      hide: (type) => track(nodeRegistry.hide(type)),
      get: (type) => nodeRegistry.get(type),
      list: () => nodeRegistry.list(),
      create: (type) => createNode(type),
    };

  if (has("ui"))
    api.ui = {
      kit: {
        Button: UiButton,
        IconButton: UiIconButton,
        Switch: UiSwitch,
        Input,
        Icon,
      },
      slot: (name, Component, options) =>
        track(uiRegistry.slot(name, Component, { ...options, owner: id })),
      override: (target, wrap) => track(uiRegistry.override(target, wrap, id)),
      panelTab: (def) =>
        track(
          uiRegistry.panelTab({ scroll: true, ...def, id: `${id}:${def.id}` }),
        ),
      styles: (css) => track(uiRegistry.styles(css, id)),
    };

  if (has("pipeline"))
    api.pipeline = {
      use: (stage, fn, options = {}) => {
        const needed = STAGE_CAPS[stage];
        if (needed !== undefined && !has(needed))
          fail(`stage "${stage}"`, `needs the "${needed}" capability`);
        anonymousHooks += 1;
        return track(
          pipeline.use(stage, fn, {
            ...options,
            id: `${id}:${options.id ?? `${stage}#${anonymousHooks}`}`,
          }),
        );
      },
      failures: () =>
        pipeline
          .failures()
          .filter((failure) => failure.id.startsWith(`${id}:`)),
    };
  let anonymousHooks = 0;

  if (has("store"))
    api.store = {
      nodes: () => stackNodes(),
      dispatch: (action) => dispatchAction(action),
      action: (type, reducer) => {
        requirePrefix(type, `${id}:`, "action type");
        return track(storeActions.define(type, reducer));
      },
      observe: (listener) => track(onStoreAction(listener)),
    };

  if (has("ws")) {
    const prefix = `x.${id}.`;
    const own = (name: string) => {
      if (name !== "ls") requirePrefix(name, prefix, "WS method");
    };
    api.ws = {
      method: (def) => {
        requirePrefix(def.name, prefix, "WS method");
        return track(wsMethods.define(def));
      },
      call: (name, data) => {
        own(name);
        return wsHub.call(name, data);
      },
      request: (method, data, options) => {
        own(method);
        return wsHub.request(method, data, options);
      },
      on: (method, handler) => {
        requirePrefix(method, prefix, "WS method");
        return track(wsHub.on(method, (data) => handler(data)));
      },
      open: () => wsHub.open(),
    };
  }

  if (has("i18n")) {
    const text = (key: string, params?: MessageParams) =>
      pluginText(id, key, params);
    api.i18n = {
      add: (language, entries) =>
        track(pluginDictionary.add(id, language, entries)),
      text,
      t: (key, params) => render(text(key, params)),
    };
  }

  if (has("storage")) {
    const prefix = `${OWN_PREFIX}${id}:`;
    const used = (): number =>
      storage
        .keys(prefix)
        .reduce(
          (sum, key) => sum + key.length + (storage.get(key)?.length ?? 0),
          0,
        );
    const room = (key: string, value: string): boolean => {
      const existing = storage.get(prefix + key);
      const after =
        used() -
        (existing === undefined
          ? 0
          : prefix.length + key.length + existing.length) +
        prefix.length +
        key.length +
        value.length;
      return after <= PLUGIN_STORAGE_QUOTA;
    };
    api.storage = {
      get: (key) => storage.get(prefix + key),
      set: (key, value) => room(key, value) && storage.set(prefix + key, value),
      remove: (key) => storage.remove(prefix + key),
      getJson: (key) => storage.getJson(prefix + key),
      setJson: (key, value) => {
        let text: string | undefined;
        try {
          text = JSON.stringify(value);
        } catch {
          return false;
        }
        return (
          text !== undefined &&
          room(key, text) &&
          storage.set(prefix + key, text)
        );
      },
      usage: used,
    };
  }

  if (has("run"))
    api.run = {
      start: (config) =>
        new Promise<RunOutcome>((resolve, reject) => {
          // attached first: a run that fails to even dial ends inside `start`
          const stop = runClient.onFinish((outcome) => {
            stop();
            resolve(outcome);
          });
          track(stop);
          if (!runClient.start(endpoint().trim(), config)) {
            stop();
            reject(
              new Error("a run is already in progress, or no address is set"),
            );
          }
        }),
      stop: () => runClient.stop(),
      phase: runClient.phase,
      progress: runClient.progress,
      endpoint: () => endpoint(),
      onFinish: (listener) => track(runClient.onFinish(listener)),
    };

  if (has("config"))
    api.config = {
      analyze: (nodes) => analyze(nodes),
      toPure: (nodes) => exportConfig(nodes).config,
      fromPure: (config) => convertToStack(config, { urlOf: modelUrl }),
      parse: (text) => stringToNodes(text, { urlOf: modelUrl }),
      replaceStack: (nodes) =>
        dispatchAction({ type: NodesActionType.IMPORT, payload: nodes }),
    };

  return api;
};
