# Reline plugins

**English** · [Русский](PLUGINS.ru.md)

A plugin is one ES module with a `plugin.json` next to it. A user installs it **by link** to
`plugin.json`; the editor shows what the plugin asks for, checks the code hash, keeps the install
in `localStorage` and starts the plugin on every load. A plugin can add and change nodes, the UI,
pipeline stages (import, validation, export, run), store actions and requests to the runner.

- [For users](#for-users)
- [Quick start](#quick-start)
- [Local development](#local-development)
- [Manifest](#manifest)
- [API](#api)
- [Pipeline stages](#pipeline-stages)
- [Security — what is and is not guaranteed](#security)
- [Building and publishing](#building-and-publishing)
- [Getting into the catalog](#getting-into-the-catalog)
- [Examples](#examples)
- [Testing a plugin](#testing-a-plugin)
- [Author checklist](#author-checklist)

## For users

**Installing.** The "Plugins" tab → paste a link to `plugin.json` → "Check". The editor downloads
the manifest and the code, computes SHA-384 and shows a card: source, version, hash, where the
plugin runs and which permissions it asks for (each can be taken away). "Install" — and the plugin
runs. A link like `https://editor/?plugin=<link to plugin.json>` opens the same card; **nothing is
installed by a link alone**.

**Catalog.** Below the installed list there is a collapsed "Verified plugins" section: a list read
from `plugins/index.json`, which is served next to the editor (`public/plugins/index.json`). It is
loaded on first expand and has a search (name, id, description in any language, permissions).
"Install" fills in the entry's link, opens the same card and scrolls to it; the rest is exactly
the manual flow. "Verified" means: the entry names the SHA-384 of the code, and the manifest it
points to must pin that same hash — otherwise the install is refused ("the plugin no longer
matches its catalog entry"). The catalog is a shop window, not a gate: installing by link works
without it. If the file is missing or broken, the tab still works and the section says "The list
is unavailable" with "Retry".

**Description.** A plugin's description is shown in the interface language when the author wrote
`descriptions.en` / `descriptions.ru`; otherwise `description`, otherwise whichever exists.

**What is remembered.** In `localStorage`: the installed list (`reline-web:plugins`), the verified
code (`reline-web:plugin-code:<id>` — the plugin starts from the cache, no network), the plugin's
own data (`reline-web:plugin:<id>:…`, at most 256 KB per plugin).

**Switching off and removing.** The switch on a plugin turns it off at once, without a reload:
everything it registered (nodes, tabs, hooks, actions) is taken away. Its data stays. Nodes of its
types stay in the config as they are ("orphans") and come back to life when the plugin is switched
on again.

**If something breaks.**

- `?plugins=off` in the address — safe mode: no plugin is loaded.
- If the page freezes (Solid halts all reactivity on any uncaught error inside an effect), an
  overlay offers "Disable plugins and reload".
- If the previous run never got to "the page is alive" (the tab was killed, the page froze), the
  plugins that started then are switched off at the next open, and the Plugins tab says so.
- A hook that throws 3 times in a row is disabled; failures are listed in the Plugins tab.

**Restricting sources.** `localStorage["reline-web:plugins:allow"] = ["https://plugins.example"]` —
then plugins can be installed only from there (empty = from anywhere, under the rules below).

## Quick start

```ts
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
      // Form, schema, toPure, fromPure, validate… — all optional
    });
  },
});
```

```ts
// vite.config.ts
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";
import { relinePlugin } from "@reline/plugin-sdk/vite"; // sdk/vite.ts in this repository

export default defineConfig({
  plugins: [
    relinePlugin({
      manifest: {
        id: "acme.border",
        name: "Border",
        version: "1.0.0",
        caps: ["nodes", "i18n"],
      },
    }),
    solid(),
  ],
  build: { outDir: "dist", lib: { entry: "src/index.tsx", formats: ["es"] } },
});
```

`vite build` puts the module and a `plugin.json` with the hash into `dist/`. Publish both over
https — the link to `plugin.json` is the install link.

No build is fine too: a plain ES module without imports, `export default { activate(api) {…} }`,
plus a `plugin.json` with a hash (`scripts/pin-plugin.mjs`). Take Solid from `api.solid` / `api.web`.

## Local development

1. Put the built plugin into `public/plugins/<name>/` of the editor repository (`plugin.json` and
   the module side by side) and run `pnpm dev`. The install link is
   `http://localhost:3000/plugins/<name>/plugin.json`. For `localhost` a hash is optional and
   `http:` is allowed.
2. "Plugins" tab → paste the link → "Check" → "Install". Or open
   `http://localhost:3000/?plugin=<link to plugin.json>`: the card appears by itself, but you still
   install by hand.
3. After a rebuild the hash changes: press "Update" on the plugin (or check the link again) — the
   editor shows an update card. Bump the manifest `version` on every release, otherwise users with
   a cached copy will not see a difference.
4. Your own server on another port works if it sends CORS (`Access-Control-Allow-Origin`) and the
   module lives on the same origin as the manifest (a different origin requires `integrity`).
5. If something breaks so badly the page will not open — `?plugins=off` in the address.

A plugin's log (`api.log`) and hook failures are visible in the Plugins tab.

## Manifest

```jsonc
{
  "id": "acme.border", // a.b[.c…], lower-case, [a-z0-9-]; prefix of everything the plugin owns
  "name": "Border",
  "version": "1.0.0",
  "api": 1, // generation of the editor API; incompatible plugins are refused
  "description": "…", // one language; the fallback for every reader
  "descriptions": { "ru": "…", "en": "…" }, // optional, either; shown in the reader's language
  "entry": "border.js", // relative to the manifest
  "integrity": "sha384-…", // required, except on a local development server
  "caps": ["nodes", "ui"], // what it asks for
  "requires": { "acme.base": "1.2.0" }, // other plugins (id → minimum version), started first
  "sandbox": "page", // or "worker" (see below)
}
```

Loading rules: only `https:` (or `http://localhost`); code on another origin is accepted only with
`integrity`; manifest ≤ 64 KB, code ≤ 1 MB; no cookies and no cache; exactly the hashed code runs
(imported from a Blob, not re-fetched by link).

**Permissions (`caps`)**: `nodes`, `ui`, `pipeline`, `store`, `ws`, `i18n`, `storage`, `run`,
`config`. The `api` object contains **only** the namespaces that were granted; there are no others.

## API

`activate(api)` is called once; it may be `async` (up to 5 s) and may return a cleanup function.
Everything registered through `api.*` is removed when the plugin is switched off. Always present:
`api.id`, `api.version`, `api.solid`, `api.web` (**the editor's own copies of Solid — use them**; a
Solid bundled into the plugin does not work with the editor), `api.log(...)`, `api.onDispose(fn)`.

Names owned by a plugin start with its id: node types `<id>.<name>`, store actions `<id>:<name>`,
WS methods `x.<id>.<name>`; hooks get the `<id>:` prefix automatically.

### `api.nodes`

`define(def)` · `patch(type, changes)` · `hide(type)` · `get` · `list` · `create(type)`.
`NodeDef` is the single description of a type: `defaults()`, `schema` (valibot), `normalize`,
`Form`, `doc`, `toPure`/`fromPure` (how a node becomes the runner config and back), `validate`,
`prepare` (the last chance to change a node before a run). `patch` changes **any** type,
built-ins included. Nodes of a type that has no definition are not lost: they are kept as they are,
and when a definition appears their options are brought to its schema.

### `api.ui`

- `slot(name, Component, {order})` — `topbar` (the toolbar above the stack, its right side:
  badges and small buttons), `stack.footer` (below the node list), `node.card.header` and
  `node.card.footer` (the last two receive `{ node }`). Every contribution has its own error boundary.
- `override(id, wrap)` — replace or wrap `NodeCard`, `NodeBody`, `AddNodeMenu`: `wrap` receives the
  previous component and returns the new one. If the new one throws while rendering, the previous
  one is drawn.
- `panelTab({id, label, Component, order, scroll})` — a tab of the right panel (the built-in tabs
  use orders 10–50). The panel scrolls a plugin tab's content itself (`scroll` defaults to
  `true`); `scroll: false` if the tab manages scrolling on its own.
- `kit` — the editor's own controls as components: `Button` (`variant="primary"`), `IconButton`
  (`icon`, `label` — both the aria-label and the tooltip), `Switch`, `Input`, `Icon` (icon names
  are `IconName`, for example `plus`, `trash`, `pencil`, `arrow-up`, `refresh`, `play`). Use them
  instead of your own `<button>`s and checkboxes: the plugin's panel looks like the other tabs, and
  density, touch sizes and tokens come from the editor.
- `styles(css)` — global CSS after the editor's; may change tokens (`:root{--color-…}`). Keep your
  own selectors under your own class.

An error **inside an effect** (not in a render) halts all of Solid's reactivity — an error boundary
does not catch it. Wrap effect code in `try/catch`.

### `api.pipeline`

`use(stage, fn, {id, before, after, timeoutMs})` — a stage hook (below). `failures()` — failures of
your hooks.

### `api.store`

`nodes()` (the live stack, reactive), `dispatch(action)`, `action(type, reducer)` — your own
actions, `observe(fn)`. A node can carry data: `CHANGE` with `ext: { "<id>": … }` (merged by key);
it travels with the node into the storage, the export (`meta.ext`) and the import.

### `api.ws`

`method({name, request, response, timeoutMs})` (valibot schemas; name `x.<id>.<name>`),
`call(name, data)` — request and response are checked against the schemas, `request`,
`on(method, fn)` — server pushes, `open()`. Frames can be intercepted with the `ws.send` /
`ws.receive` hooks.

### `api.i18n`

`add(locale, {key: string})`, `text(key, params)` — a `LocalText` for labels, diagnostics and tabs,
`t(key, params)` — a string now (reactive in JSX). Lookup order: interface language → en → any → the key.

### `api.storage`

`get/set/remove/getJson/setJson` under the plugin's prefix, 256 KB quota (`set` returns `false`).

### `api.run` and `api.config`

`run.start(config)` → `Promise<{ok, cancelled, text}>` when the run ends (rejects if a run is
already going), `run.stop()`, `run.phase()`, `run.progress()`, `run.onFinish(fn)`.
`config.analyze(nodes)` → `{config, text, diagnostics, errors}`, `toPure`, `fromPure`,
`parse(text)`, `replaceStack(nodes)`.

### The worker tier (`"sandbox": "worker"`)

A worker plugin gets a smaller `api`: `id`, `version`, `log(...)` and one hook,
`api.pipeline.beforeRun(fn)`, where `fn(config)` returns the config (or a promise of it). There is
no Solid, no DOM, no other namespace. Write it as a plain ES module — see
`examples/writer-suffix/writer-suffix.js`:

```js
export default {
  activate(api) {
    api.pipeline.beforeRun((config) => ({
      ...config /* change what you need */,
    }));
  },
};
```

## Pipeline stages

| Stage                    | In → out                           | When                                   |
| ------------------------ | ---------------------------------- | -------------------------------------- |
| `import.parse`           | parsed JSON → JSON                 | config pasted/opened, before parsing   |
| `import.sanitize`        | `unknown[]` of nodes → `unknown[]` | any import, before the built-in checks |
| `validate`               | stack → `Diagnostic[]`             | always; **an error blocks the run**    |
| `toPure.node`            | `PureNode[]`, node → `PureNode[]`  | building the config, per node          |
| `toPure.config`          | config, stack → config             | building the whole config              |
| `beforeRun`              | config → config (**async**)        | right before sending to the runner     |
| `export.serialize`       | text, config → text                | the Code tab, copy, file               |
| `ws.send` / `ws.receive` | frame → frame / `null`             | every frame (heartbeat excluded)       |
| `store.action`           | action → action / `null`           | every action on the stack              |

A hook that returns nothing leaves the value as is (mutate it in place if you like); one that
returns a value of the right shape replaces it. A wrong shape, an exception, a hang (`beforeRun`:
10 s), a promise in a synchronous stage — a failure: it is recorded, the hook is skipped, the value
goes on. Three in a row and the hook is disabled. Order is by registration, refined with
`before`/`after` (another plugin's hook id is `<plugin id>:<hook id>`).

`validate` returns `Diagnostic { code, severity: "error"|"warn", message: LocalText, uid?, path? }`.

## Security

**A `page` plugin (the default) is code on the editor's page with the same rights.** It sees your
configs and `localStorage` and can send requests to the runner (and the runner can clean folders and
delete sources). The `caps` list and the card are **information for the user**, not a sandbox: the
`api` object holds nothing extra, but a plugin that wants to will reach `localStorage` directly.
The protection is the user's consent, the pinned hash (what was approved is what runs; swapping the
code behind a link does not work), allowed sources, safe mode and rollback after a crash. Install
only what you would trust as code.

**A `"sandbox": "worker"` plugin** runs in a Web Worker: no DOM, no `localStorage`, none of the
editor's objects. The only input is the run config that arrives in its `beforeRun`; the only output
is the config it returns. Permissions are limited to `pipeline` (a manifest asking for anything else
is refused). This is the only tier where the limits are **enforced**. But a worker can still reach
the network and sees the configs it is given — isolation limits what a plugin can _get_, not what it
does with what it received. Hooks of other stages cannot be moved into a worker: they are synchronous
and run inside a `memo`, which cannot wait for a message.

## Building and publishing

- `relinePlugin()` (`sdk/vite.ts`) rewrites the `solid-js` and `@solidjs/web` imports into reads from
  `globalThis.__RELINE__` (the editor's copies) and, after the build, writes `plugin.json` with the
  SHA-384. The list of names is in `sdk/host-exports.json`; after a Solid update run
  `pnpm sdk:exports` (`sdk/sdk.test.ts` fails when the list is stale).
- A built plugin must not be formatted or edited by hand: the hash is pinned byte for byte
  (`public/plugins/**` is excluded from `oxfmt` and `oxlint`).
- In this repository: `pnpm plugin:build` builds Config sequence and refreshes the catalog
  `public/plugins/index.json`; `pnpm plugin:pin` publishes the no-build Writer suffix example to
  `public/plugins/examples/writer-suffix/` (**outside the catalog**); `pnpm plugin:catalog` only
  rebuilds the catalog. CI rebuilds everything and requires `public/plugins` to stay unchanged.
- Publishing: any static host over https. `http://localhost` is enough for development (the hash is
  optional). An update is a new `version` and a new hash; the editor shows an update card and
  highlights the **new** permissions.

## Getting into the catalog

The catalog is `public/plugins/index.json` in the editor repository, and it is not maintained by hand.

1. Build the plugin so that `public/plugins/<name>/` holds the module and a `plugin.json` **with a
   hash** (`relinePlugin()` does it).
2. Write the description: `description` and, optionally, `descriptions: { ru, en }`.
3. `pnpm plugin:catalog` — the entry appears in the catalog (id, name, version, descriptions,
   permissions, hash).
4. `pnpm test` checks that the catalog matches the manifests and that the hash is the hash of the
   real file.

Plugins in deeper subdirectories (`public/plugins/examples/…`) are not seen by the catalog: that is
where samples that must not be recommended live.

## Examples

### Config sequence (in the catalog)

`examples/sequence/` (built into `public/plugins/sequence/`, installed with the link
`./plugins/sequence/plugin.json`). Builds a pipeline out of several configs and runs them one after
another.

Permissions: `ui` (a "Sequence" tab and a "Sequence 2/4" badge in the toolbar above the stack, visible
from any tab), `storage` (steps survive a reload), `run` (starting a step and waiting for its end),
`config` (reading, validating and building the steps' configs), `store` (take the current stack as a
step), `i18n` (ru/en).

- **A step** = a full config. Sources: "Add current stack", "Import configs…" (several files; read
  by the same import as the Code tab, so the legacy format works too), "Replace with the current
  stack".
- **Order and content**: ↑↓, a switch per step, renaming, "Load into the editor" (the step becomes
  the stack for editing), removal.
- **Running**: only enabled steps run, strictly one at a time — the next starts when the previous
  has ended. Before starting, every step passes the same checks as a normal run
  (`config.analyze`); with an error the step is `failed` and is not sent to the runner. "Stop at the
  first failure" (on by default) or carry on. "Stop" stops the current run and drops the rest.
- If a run is already going (started from the Run tab), the step does not queue behind it but fails.

The UI is built from `ui.kit`, so it looks like the native tabs.

The source is a model for your own plugins: it uses `createStore`, the split
`createEffect(compute, apply)`, `ui.slot`, `ui.panelTab`, `ui.styles` and an ru/en dictionary.

### Writer suffix (example only)

`examples/writer-suffix/` — a sample of the `worker` tier: a plain ES module without a build that, in
`beforeRun`, appends `-sandboxed` to every writer's folder. It is not in the catalog; install it with
`./plugins/examples/writer-suffix/plugin.json` (after `pnpm plugin:pin`).

## Testing a plugin

The contract is checked against the real API: `createPluginApi` plus a real stack; only `runClient`
is replaced (see `examples/sequence/sequence.test.tsx`). For install checks there are
`setModuleLoader` and `setWorkerFactory` (jsdom cannot import a Blob and has no Worker).

## Author checklist

- `id` like `acme.border`; everything the plugin owns starts with it (node types, actions `<id>:…`,
  WS methods `x.<id>.…`, `localStorage` keys — through `api.storage`).
- Only the `caps` you need. If `pipeline` is enough — make it `"sandbox": "worker"`.
- Solid only from the editor (`relinePlugin()` rewrites the imports; without a build — `api.solid`).
- Every effect: reactive reads go into the first function of `createEffect(compute, apply)`; inside
  `apply` read nothing reactive (`untrack`); wrap the body in `try/catch`.
- Do not serialise a large store from an effect over the whole `store` (thousands of subscriptions):
  save from a change counter instead.
- UI from `api.ui.kit`; colours and spacing from the tokens `--color-*`, `--space-*`, `--radius-*`;
  your selectors under your own class; icon-only buttons with a `label`.
- Every string through `api.i18n` in ru and en; the plugin description as `description` +
  `descriptions`.
- Every `validate` diagnostic gets a readable `message` (`LocalText`) and a `severity`.
- Bump the version on every release, rebuild the hash, check the update with "Update".
- Test: the contract against the real `createPluginApi` (see "Testing a plugin").
