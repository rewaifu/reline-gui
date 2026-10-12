---
name: reline-plugin-author
description: >
  Writing, reviewing and debugging Reline Web plugins: the manifest, the `api` namespaces
  (nodes, ui, pipeline, store, ws, i18n, storage, run, config), pipeline stage hooks, the
  worker (sandbox) tier, building with the SDK, publishing, the verified catalog, testing.
  Use when touching examples/, public/plugins/, sdk/, src/lib/plugins/, or when a user asks
  how to extend the editor. Human guide: docs/PLUGINS.en.md (ru: docs/PLUGINS.ru.md).
---

# Writing a Reline Web plugin

A plugin = **one ES module + `plugin.json`**, installed by link. Solid is **2.0-rc.6** (not 1.x) —
read `reline-web` §"Solid 2 traps" before writing reactive code. Canonical human doc:
`docs/PLUGINS.en.md`. Working samples: `examples/sequence` (page tier, UI + run + storage),
`examples/writer-suffix` (worker tier, no build).

## 1. Pick the tier first

| Tier                  | Runs in                      | Gets                                                             | Use when                                            |
| --------------------- | ---------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `page` (default)      | the editor page, full rights | `api` with the granted namespaces, host Solid, UI kit            | new nodes, UI, store, WS methods, any non-run hook  |
| `"sandbox": "worker"` | Web Worker, no DOM/storage   | `api.id`, `api.version`, `api.log`, `api.pipeline.beforeRun(fn)` | you only rewrite the run config just before sending |

`caps` on a `page` plugin are **consent information, not a sandbox**. Only `worker` is enforced; a worker
manifest may ask for `pipeline` only. Prefer the worker tier whenever `beforeRun` is enough.

## 2. Minimal plugins

Page tier (built with the SDK):

```tsx
// src/index.tsx
import { definePlugin } from "@reline/plugin-sdk";

export default definePlugin<"nodes" | "i18n">({
  activate(api) {
    api.i18n.add("en", { name: "Border" });
    api.i18n.add("ru", { name: "Рамка" });
    api.nodes.define({
      type: "acme.border.add", // <plugin id>.<name>
      label: api.i18n.text("name"),
      defaults: () => ({ width: 8 }),
    });
  },
});
```

Worker tier (plain module, no imports):

```js
export default {
  activate(api) {
    api.pipeline.beforeRun((config) => ({ ...config })); // return the config or a promise of it
  },
};
```

`activate` runs once, may be `async` (5 s limit), may return a cleanup. Everything registered through `api.*`
is removed on disable. Always present: `api.id`, `api.version`, `api.apiVersion`, `api.solid`, `api.web`,
`api.log(...parts)`, `api.onDispose(fn)`.

## 3. Manifest (`plugin.json`)

| Field          | Rule                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `id`           | 3–64 chars, `^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$` (`acme.border`); prefix of everything the plugin owns |
| `name`         | 1–80 chars                                                                                             |
| `version`      | `x.y.z[-pre]`; **bump on every release** (installed copies are cached by version/hash)                 |
| `api`          | literal `1` (`PLUGIN_API_VERSION`)                                                                     |
| `description`  | ≤ 400 chars, one language (fallback)                                                                   |
| `descriptions` | optional `{ ru?, en? }`, each ≤ 400; shown in the reader's language, then `description`, then any      |
| `entry`        | module path relative to the manifest                                                                   |
| `integrity`    | `sha384-<base64>` of the entry bytes; required except on loopback; required for a cross-origin entry   |
| `caps`         | subset of `nodes ui pipeline store ws i18n storage run config`                                         |
| `requires`     | optional `{ "<plugin id>": "<min version>" }`; those plugins start first                               |
| `sandbox`      | `"page"` (default) or `"worker"`                                                                       |

Load rules: `https:` or `http://localhost`/`127.0.0.1`/`[::1]`; manifest ≤ 64 KB, code ≤ 1 MB; no cookies/cache;
the hashed bytes are what runs (Blob import). Optional origin allow-list: `localStorage["reline-web:plugins:allow"]`.

## 4. API reference (`caps` → namespace)

Names a plugin owns carry its id: node types `<id>.<name>`, store actions `<id>:<name>`, WS methods
`x.<id>.<name>`; hook ids get `<id>:` automatically. Violations throw at registration.

**`nodes`** — `define(def: NodeDef)`, `patch(type, Partial<NodeDef>)` (any type, built-ins too), `hide(type)`,
`get(type)`, `list()`, `create(type): StackNode | undefined`. Each returns/uses a `Dispose`.

`NodeDef` (all but `type`, `label`, `defaults` optional):
`type`, `pureType?` (wire type if different), `label: LocalText`, `defaults(): NodeOptions`, `schema?` (valibot; a
failing field resets to its default), `normalize?(options)` (in place), `Form?: Component<{ node: StackNode }>`,
`doc?: { ru?, en? }` (Markdown guide), `toPure?(node, ctx: {preprocess, postprocess}) => PureNode[]`,
`fromPure?(pure, ctx) => NodeOptions`, `validate?(node) => Omit<Diagnostic,"uid">[]`,
`prepare?(node) => Promise<NodeOptions | undefined>` (last chance before a run). Nodes of a type with no
definition are kept as-is ("orphans") and re-checked when a definition appears.

**`ui`** — `slot(name, Component, { order? })` with names `topbar` (stack toolbar, right side), `stack.footer`,
`node.card.header` / `node.card.footer` (context `{ node }`); `override("NodeCard" | "NodeBody" | "AddNodeMenu", wrap)`
(`wrap(previous) => Component`; a throwing override falls back to the previous one);
`panelTab({ id, label: LocalText, Component, order?, scroll? })` (right panel; built-ins use orders 10–50; `scroll`
defaults to `true` for plugin tabs: the panel scrolls the content); `styles(css)` (global CSS after the host's);
`kit: { Button, IconButton, Switch, Input, Icon }` — **use these instead of your own controls**:
`<Button variant="primary">`, `<IconButton icon="trash" label="Remove" onClick/>` (label = aria-label + title),
`<Switch checked onChange ariaLabel label?/>`, `<Input …/>`, `<Icon name size?/>` (`IconName`: plus, trash, pencil, x,
check, upload, download, copy, swap, search, refresh, play, stop, arrow-up, arrow-down, chevron-_, chevrons-_, menu-2).

**`pipeline`** — `use(stage, fn, { id?, before?, after?, timeoutMs? })`, `failures()`.

**`store`** — `nodes()` (live reactive stack), `dispatch(action)`, `action(type, reducer)` (type `<id>:<name>`),
`observe(listener)`. Built-in actions (type strings): `ADD {payload: StackNode}`, `DELETE {payload: uid}`,
`CHANGE {payload: { uid, options?: Partial, name?, enabled?, collapsed?, ext? }}`, `MOVE {from, to}`, `IMPORT
{payload: StackNode[]}`, `SWAP {uid, nodeType}`, `NORMALIZE {payload: type}`. Per-plugin node data: `CHANGE` with
`ext: { "<your id>": … }` (merged by key; exported as `meta.ext`).

**`ws`** — `method({ name, request, response, timeoutMs? })` (valibot schemas), `call(name, data)`,
`request(method, data, opts)`, `on(method, handler)` (server pushes), `open()`. Frames: hooks `ws.send`/`ws.receive`.

**`i18n`** — `add(locale, flatKeys)`, `text(key, params) → LocalText` (labels, diagnostics, tab labels),
`t(key, params) → string` (reactive in JSX). Lookup: UI language → en → any → key.

**`storage`** — `get/set/remove/getJson/setJson` under the plugin prefix; 256 KB quota; `set` returns `false` on overflow.

**`run`** — `start(config) → Promise<{ ok, cancelled, text }>` (rejects if a run is going), `stop()`, `phase()`,
`progress()`, `endpoint()`, `onFinish(fn)`.

**`config`** — `analyze(nodes) → { config, text, diagnostics, errors }`, `toPure(nodes)`, `fromPure(config)`,
`parse(text)`, `replaceStack(nodes)`.

## 5. Pipeline stages

| Stage                    | Hook signature                                     | Notes                                               |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------- |
| `import.parse`           | `(raw: unknown) => unknown`                        | parsed JSON before it is read as a config           |
| `import.sanitize`        | `(nodes: unknown[]) => unknown[]`                  | migrate renamed types / old option shapes           |
| `validate`               | `(nodes) => Diagnostic[] \| void`                  | results concatenated; **an `error` blocks the run** |
| `toPure.node`            | `(pure: PureNode[], node) => PureNode[] \| void`   | per node                                            |
| `toPure.config`          | `(config, nodes) => PureConfig \| void`            | whole config                                        |
| `beforeRun`              | `(config, nodes) => PureConfig \| void \| Promise` | **only async stage**; default timeout 10 s          |
| `export.serialize`       | `(text, config) => string \| void`                 | Code tab, copy, download                            |
| `ws.send` / `ws.receive` | `(frame) => Frame \| null \| void`                 | needs `ws` cap; `null` swallows                     |
| `store.action`           | `(action) => AnyAction \| null \| void`            | needs `store` cap; `null` refuses                   |

Return nothing = unchanged (mutating in place is fine); return a value of the right shape = replaces it. Wrong
shape / throw / hang / promise in a sync stage = a **recorded failure, hook skipped, value continues**; three in a
row disables the hook. `Diagnostic = { code, severity: "error"|"warn", message: LocalText, uid?, path? }`. To stop a
run, return an `error` from `validate` (throwing in `beforeRun` refuses nothing).

## 6. Rules that prevent the usual breakage

- **Solid only from the host**: the SDK's `relinePlugin()` rewrites `solid-js`/`@solidjs/web` imports to
  `globalThis.__RELINE__`. A plugin's own Solid copy never updates the page.
- **An uncaught error inside an effect halts all reactivity** (error boundaries do not catch it): wrap effect bodies
  in `try/catch`.
- **Effects are split**: `createEffect(() => reactiveReads, (value) => sideEffect)`. Do not read signals/stores in the
  apply function (`STRICT_READ_UNTRACKED`) — use `untrack`. `onSettled` callbacks must not return a value.
- **Signal writes are deferred** in Solid 2: reading right after a write gives the old value; keep a plain variable
  plus a revision signal when you need read-after-write.
- **Never `JSON.stringify(store)` inside an effect** (thousands of subscriptions, `HUGE_FAN_IN`): bump a revision
  counter in your setter and serialise with `untrack` in the apply.
- **Every string in ru and en** (`api.i18n.add` twice); tab/node/diagnostic text as `LocalText` (`api.i18n.text`), not a
  frozen string.
- **UI**: `api.ui.kit` controls; tokens `--color-*`, `--space-*`, `--radius-*`, `--font-size-*` (never hex colours);
  scope custom CSS under your own class (`.acme-…`); icon-only buttons have `label`.
- **Do not format or hand-edit built output** (`public/plugins/**`): the hash pins bytes.
- Panel tab content that grows needs no scroll code of your own (`scroll` is on); tabs that scroll themselves pass
  `scroll: false`.
- Do not mutate `api.store.nodes()` directly — `dispatch` actions.

## 7. Recipe: a node type with a form

```tsx
import { definePlugin } from "@reline/plugin-sdk";
import * as v from "valibot"; // bundle valibot into your plugin; it is not shared

export default definePlugin<"nodes" | "store" | "ui" | "i18n">({
  activate(api) {
    const { Input } = api.ui.kit;
    api.i18n.add("en", { border: "Border", width: "Width" });
    api.i18n.add("ru", { border: "Рамка", width: "Ширина" });
    api.nodes.define({
      type: "acme.border.add",
      label: api.i18n.text("border"),
      defaults: () => ({ width: 8 }),
      schema: v.object({ width: v.pipe(v.number(), v.minValue(0)) }),
      Form: (props) => (
        <Input
          type="number"
          aria-label={api.i18n.t("width")}
          value={String(props.node.options.width)}
          onInput={(e) =>
            api.store.dispatch({
              type: "CHANGE",
              payload: {
                uid: props.node.uid,
                options: { width: Number(e.currentTarget.value) },
              },
            })
          }
        />
      ),
      validate: (node) =>
        Number(node.options.width) > 512
          ? [
              {
                code: "acme.border.wide",
                severity: "warn",
                message: api.i18n.text("tooWide"),
              },
            ]
          : [],
    });
  },
});
```

(Add the `tooWide` key to both dictionaries.) Other recipes live in the samples: persistence + effect + panel tab +
toolbar badge + sequential runs → `examples/sequence/src/index.tsx`; worker rewrite → `examples/writer-suffix/`.

## 8. Build, publish, catalog

- Build: `relinePlugin({ manifest: { id, name, version, caps, description?, descriptions? } })` in `vite.config.ts` (see
  `examples/sequence/vite.config.ts`); `vite build` writes the module and `plugin.json` with `integrity`.
- In this repo: `pnpm plugin:build` (sequence + catalog), `pnpm plugin:pin` (no-build example →
  `public/plugins/examples/writer-suffix/`, **outside the catalog**), `pnpm plugin:catalog`, `pnpm sdk:exports` after a Solid
  upgrade. CI rebuilds and `git diff --exit-code -- public/plugins`.
- **Catalog** = `public/plugins/index.json`, generated from `public/plugins/<name>/plugin.json` (top level only). Each entry
  carries id, name, version, description(s), caps, sandbox, manifest path and the code `integrity`; installing from it refuses
  a manifest whose pin differs. `catalog.test.ts` fails on drift. Examples that must not be recommended go to
  `public/plugins/examples/`.
- Local test: put the build in `public/plugins/<name>/`, `pnpm dev`, open
  `http://localhost:3000/?plugin=http://localhost:3000/plugins/<name>/plugin.json` (opens the consent card; installing is
  manual). After a rebuild press "Update". Safe mode: `?plugins=off`.

## 9. Testing

Run the real plugin source against the real API: `createPluginApi` + a real stack; replace only `runClient` (see
`examples/sequence/sequence.test.tsx`). Tests that need a fresh module graph use `vi.resetModules()` and a stubbed
`localStorage`; jsdom cannot import Blob URLs or create Workers — use `setModuleLoader` / `setWorkerFactory`.
`@solidjs/testing-library` does not auto-clean (no globals): call `cleanup()` in `afterEach`; call `flush()` after
signal writes. Popover components need `@floating-ui/dom` mocked in jsdom.

## 10. Review checklist

1. Right tier; minimal `caps`; `id` format; every owned name prefixed.
2. Solid from the host; effects split, guarded, no reactive reads in apply; no store serialisation in effects.
3. UI from `ui.kit` + tokens; ru **and** en strings; `label` on icon buttons.
4. `validate` diagnostics have `severity` and a `LocalText` message; `beforeRun` is async-safe and idempotent.
5. Version bumped; hash rebuilt (`plugin.json` regenerated, not edited); `description` + `descriptions`.
6. Tests against the real API; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass; catalog regenerated.
