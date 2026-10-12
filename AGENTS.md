# AGENTS.md — reline-web

Instructions for AI agents working in this repository. Human-facing docs: [README.md](README.md)
(en) / [README.ru.md](README.ru.md) (ru). Details live in the project skills (`.omp/skills/`); read the
matching one **before** touching its area.

## What this is

A static single-page editor for Reline image-processing pipelines: a stack of nodes edited as JSON,
validated, and run on a Python runner over WebSocket ([WS_API.md](WS_API.md)). Solid **2.0-rc.6**
(not 1.x), SCSS modules, Vite 8, pnpm 12, Node ≥ 24. A plugin system lets users install extensions by
link ([docs/PLUGINS.en.md](docs/PLUGINS.en.md)).

Talk to the user in the language they write in (they write Russian). Be terse: facts, decisions,
evidence. Final answer: what changed, how it was verified, what remains.

## Skills — read first

| Skill                  | Read it when                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `reline-web`           | editing `src/**`: store/reducer, WebSocket, persistence, layout, phones, plugins runtime, UI verification. The canonical project rules.  |
| `reline-plugin-author` | writing, reviewing or debugging a plugin (`examples/`, `public/plugins/`, `sdk/`): the plugin API, manifest, hooks, pitfalls, checklist. |
| `layout-verification`  | any UI/SCSS layout change (flex/grid, overflow, pagers) — measure in a browser, do not eyeball.                                          |
| `solid-js-patterns`    | Solid reactivity questions; `reline-web` records the project-specific traps.                                                             |
| `kobalte-primitives`   | importing or styling Kobalte parts.                                                                                                      |

## Commands and gates

```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm lint                # oxlint --type-aware --type-check (also type-checks tests)
pnpm typecheck           # tsc --noEmit
pnpm test                # vitest, jsdom
pnpm build               # static site into dist/client
pnpm format              # oxfmt (ignores public/plugins/** and sdk/host-exports.json)
pnpm plugin:build        # build examples/sequence and regenerate public/plugins/index.json
pnpm plugin:pin          # publish examples/writer-suffix to public/plugins/examples/
pnpm plugin:catalog      # regenerate the catalog only
pnpm sdk:exports         # regenerate sdk/host-exports.json after a Solid update
```

A change is done only when `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass and the
changed behaviour was exercised (a test, or the browser for UI). Test files run isolated (vitest default): a suite must not
depend on another file having run first — CI has no timing cache and orders files differently. Do not run the whole suite to check
one thing — run the specific test first.

Long-running processes (`pnpm dev`) must run as named background services and be stopped by PID.
Never `pkill -f`. Never start a second dev server without checking the first one is gone.

## Rules that are easy to break

**Code style**

- No `any` — use `unknown`/generics and a valibot schema to narrow. No local `isRecord`-style
  guards. No `ReturnType<typeof fn>` for published contracts: name the type.
- No tiny one-expression wrapper functions unless they have ≥ 3 call sites or are an exported
  domain concept.
- Clean cutover: when something is replaced, migrate every caller and delete the old code. No stubs,
  no TODOs, no compatibility aliases.
- Every user-visible string needs **ru and en** entries in `src/lib/i18n/messages/*.ts`; call `t()`
  where it renders, never at module level (it would freeze the language).
- Colours, spacing, radii come from `src/styles/_tokens.scss` tokens. Icon-only buttons need
  `aria-label` + `title`. Touch targets use `--touch-min`.

**Solid 2 traps** (details in `reline-web`)

- Signal writes are deferred: reading right after a write returns the old value (`flush()` in
  tests). Effects are split: `createEffect(compute, apply)`; read reactive values in `compute`, use
  `untrack` in `apply`. `onCleanup` is not allowed inside `onSettled`; a callback passed to
  `onSettled` must not return a value. Component bodies read props untracked.
- An uncaught error inside an effect halts the whole reactive system; keep effect bodies safe.
- `For` gives the item as a plain value and the index as an accessor.

**Data model**

- `uid` is the only node identity (`StackNode` has no `id`). Never clone survivors in reducers; merge
  options in place; mint uids at construction.
- Everything that reads or writes `localStorage` goes through `src/lib/storage.ts`.
- Node types are an open registry (string ids, not an enum): `src/lib/nodes/registry.ts` +
  `src/nodes/builtin.ts`; built-in forms are registered in `src/nodes/builtin-ui.ts`. Behaviour that
  differs per type belongs in a `NodeDef` field, not in a `switch` on the type.

**Plugins**

- The plugin API surface is `src/lib/plugins/api.ts` + `sdk/index.ts`. A change that breaks plugins
  bumps `PLUGIN_API_VERSION` in `manifest.ts`.
- `public/plugins/**` is generated and hash-pinned: never edit or format those files by hand; run
  `pnpm plugin:build` / `pnpm plugin:pin`. Bump a plugin's version when its code changes.
- The catalog (`public/plugins/index.json`) is generated; `catalog.test.ts` fails if it drifts.
- Plugin UI uses `api.ui.kit`, not hand-drawn controls.

**Models**: the upscale model list comes from `https://mdb.yor.ovh/v1/files` (`src/lib/model-db.ts`;
payload validated with valibot, cached in `reline-web:mdb:v2` for 6 h).

## UI verification

Layout changes must be verified in a real browser with measured geometry (overflow, widths): desktop
1400 px, stacked ≈ 800 px, phone 390 and 320 px with `isMobile` + `hasTouch`. Clear
`reline-web:layout:v2` in `localStorage` before layout sweeps (the layout is persisted). Kobalte
controls need dispatched pointer events, not bare `click()`. Capture console `warn` **and** `error`
(puppeteer names `console.warn` `warn`). Phone rules: `PHONE_QUERY` has the same text in
`workspace.tsx` and `workspace.module.scss`; a phone shows two panels (stack, settings) with a bottom
switcher.

## Map

```
src/routes/workspace/   three-column workspace; stack toolbar replaces the old top bar
src/components/         node-card (stack), nodes-list (outline), config-panel (right tabs),
                        plugins (tab), stack-toolbar, ui (UI kit: Button, Select, SearchMenu, Tabs…)
src/context/            reducer + actions + store bridge (plugins dispatch through it)
src/lib/convert/        config <-> UI conversion, legacy import
src/lib/pipeline/       stage hooks (import/validate/toPure/beforeRun/export/ws/store)
src/lib/ws/             codec, connection, hub, protocol
src/lib/plugins/        manifest, loader, runtime, catalog, api, worker host
src/lib/ui/registry.ts  slots, overrides, panel tabs
sdk/                    @reline/plugin-sdk (definePlugin, relinePlugin Vite helper)
examples/               sequence (in the catalog), writer-suffix (example only)
```
