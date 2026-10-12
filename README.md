# Reline Web

**English** · [Русский](README.ru.md)

A browser editor for **Reline image-processing pipelines**. You build a chain of nodes — read a
folder, upscale with a neural model, sharpen, screentone, resize, level, convert colour, write the
result — check it, and run it on a Reline runner over WebSocket. Nothing is processed in the
browser: the page is a static site that edits a JSON config and talks to the runner.

- **Node stack.** Add, drag to reorder, enable/disable, rename, swap a node's type, fold. A large
  config stays manageable: a toolbar with fold-all and a searchable "+" menu, an optional outline
  panel.
- **Per-node forms and guides.** Every node has a form with ranges, selects and path autocomplete
  (folders and weights come from the runner, upscale models from the model database) and a guide
  in Russian and English.
- **Live diagnostics.** The config is validated as you edit; a node with a problem is marked and
  a run with an error is blocked.
- **Presets and JSON.** Stock presets (Default, Mangascale, Default color, Heavy color), your own
  presets, and a Code tab to read, edit, copy, import and export the config. Older flat configs
  import and are migrated.
- **Runs.** Start, watch phases, speed and ETA, stop, reconnect and resume a run that is still going
  on the runner. See [WS_API.md](WS_API.md) for the protocol.
- **Plugins.** Install a plugin by link: new node types, UI, pipeline hooks, runner methods. A
  verified catalog ships with the editor. See [docs/PLUGINS.en.md](docs/PLUGINS.en.md).
- **Russian and English** interface; works on a phone (two panels and a bottom switcher).
- **Fails softly.** A crash screen keeps your nodes; a watchdog catches a frozen reactive system;
  `?plugins=off` starts without plugins.

## Quick start

Requirements: Node.js ≥ 24 and [pnpm](https://pnpm.io) 12 (the exact version is pinned in
`package.json`).

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

The editor needs a runner to execute anything. Point it at one with the `api` query parameter:

```
http://localhost:3000/?api=ws://127.0.0.1:8000/run
```

(`http(s)://` is rewritten to `ws(s)://`; without the parameter the address from the Run tab, then
`ws://127.0.0.1:8000/run`, is used.) Editing, presets and import/export work without a runner.

### Scripts

| Command               | What it does                                                      |
| --------------------- | ----------------------------------------------------------------- |
| `pnpm dev`            | Vite dev server on port 3000                                      |
| `pnpm build`          | Static site into `dist/client` (relative paths: any static host)  |
| `pnpm serve`          | Serve the production build locally                                |
| `pnpm lint`           | `oxlint --type-aware --type-check` (Solid rules included)         |
| `pnpm typecheck`      | `tsc --noEmit`                                                    |
| `pnpm test`           | Vitest (jsdom)                                                    |
| `pnpm format`         | `oxfmt`                                                           |
| `pnpm plugin:build`   | Build the Config sequence plugin and refresh the plugin catalog   |
| `pnpm plugin:pin`     | Publish the no-build example plugin to `public/plugins/examples/` |
| `pnpm plugin:catalog` | Rebuild `public/plugins/index.json`                               |
| `pnpm sdk:exports`    | Regenerate the Solid export list the plugin SDK relies on         |

Before calling a change done, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`.

## Configs

A config is a JSON object with a node list; each node has a `type` and `options`:

```json
{
  "nodes": [
    {
      "type": "folder_reader",
      "options": { "path": "/data/raws", "mode": "gray", "recursive": false }
    },
    {
      "type": "upscale",
      "options": {
        "model": "4x_dwtp_ds_moesr_v2",
        "dtype": "F32",
        "tiler": "exact"
      }
    },
    {
      "type": "folder_writer",
      "options": { "path": "/data/out", "format": "png" }
    }
  ]
}
```

Built-in node types: `folder_reader`, `upscale`, `sharp`, `resize`, `screentone`, `level`,
`cvt_color`, `hyst_norm`, `noise`, `folder_writer`. The editor keeps extra UI state (the "use a model
from the database" flag, node names, plugin data) out of what the runner receives: the **Code** tab
shows exactly what will be sent.

### Models

Upscale models that are not your own are picked from the model database,
[`https://mdb.yor.ovh/v1/files`](https://mdb.yor.ovh/v1/files). The **runner** fetches and keeps
the list (the `models` method), so whether the database is reachable depends on where the runner
lives, not on the visitor's network; the browser caches the answer for six hours. Picking a model
adds a download step to the run, and the upscale node keeps only the model's bare name.

## Plugins

The **Plugins** tab installs a plugin from a link to its `plugin.json`, or from the built-in
**Verified plugins** catalog (collapsed, with search). The editor shows the plugin's permissions and
code hash before anything is installed. The catalog is `public/plugins/index.json`, generated from
the manifests in `public/plugins/*/`.

To write one, start with [docs/PLUGINS.en.md](docs/PLUGINS.en.md) (Russian:
[docs/PLUGINS.ru.md](docs/PLUGINS.ru.md)). Examples: `examples/sequence` (in the catalog: run several
configs one after another) and `examples/writer-suffix` (a sandboxed worker plugin, not in the
catalog).

## Project layout

```
src/
  App.tsx, Document.tsx      app root and the prerendered document shell
  routes/workspace/          the three-column workspace (outline · stack · settings)
  components/                node cards, forms, settings tabs, plugin UI, UI kit (components/ui)
  context/                   node store: reducer, actions, bridge for plugins
  hooks/                     drag reorder, columns layout, node actions
  lib/
    convert/, nodes/         node registry and config <-> UI conversion
    pipeline/                stage hooks: import, validate, export, run, ws, store
    ws/, run-client.ts       WebSocket hub and the run client
    plugins/                 manifest, loader, runtime, catalog, worker host
    i18n/                    ru/en dictionaries
  instructions/{ru,en}/      per-node guides (Markdown)
  nodes/                     the built-in node definitions
sdk/                         plugin SDK (definePlugin, Vite helper)
examples/                    example plugins
public/plugins/              published plugins and the catalog
docs/                        plugin guide (en, ru)
WS_API.md                    runner protocol
AGENTS.md                    instructions for AI agents working on the repo
```

## For contributors and AI agents

[AGENTS.md](AGENTS.md) lists the commands, the architecture invariants that are easy to break (node
identity, deferred writes in Solid 2, the plugin boundary) and the project skills in `.omp/skills/`.

## License

MIT
