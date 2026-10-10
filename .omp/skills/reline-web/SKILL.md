---
name: reline-web
description: >
  Project rules for reline-web (Solid 2.0-rc.6 + Kobalte fork + SCSS modules, Vite, pnpm 12).
  Use when editing src/**, running the lint/typecheck/build gates, touching the node
  reducer/store, WebSocket clients, persistence, or verifying UI behaviour in a browser.
  Contains the review-derived invariants (uid identity, projection selection, deferred
  writes) that are easy to break.
---

# reline-web — project practices

Solid **2.0-rc.6**. For framework patterns the `solid-js-patterns` skill is canonical;
this file records the project-specific decisions and the traps this codebase has hit.

## Gates (run all three before calling anything done)

| Command          | What it is                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`      | `oxlint --type-aware --type-check` — solid rules come from `eslint-plugin-solid/configs/v2` through oxlint's JS-plugin bridge, which needs `eslint` + `oxlint-tsgolint` installed. Both are devDependencies; keep them. |
| `pnpm typecheck` | `tsc --noEmit`                                                                                                                                                                                                          |
| `pnpm format`    | `oxfmt` (house standard; `.oxfmtrc.json` pins printWidth 80)                                                                                                                                                            |
| `pnpm test`      | vitest: convert round-trip + reducer invariants                                                                                                                                                                         |
| `pnpm build`     | `vite build` then `rimraf dist/client/.vite` (the solid plugin emits a manifest dir despite `manifest: false`)                                                                                                          |

`lint` is type-aware: it type-checks test files too, so a failing `tsc` also fails lint.

Package manager: **pnpm 12**, pinned via `packageManager` (pnpm self-manages that version) —
install with `pnpm install`, never bun/npm; `bun.lock` and `package-lock.json` must never
reappear. pnpm 12 keeps its settings in `pnpm-workspace.yaml` (non-auth `.npmrc` keys are
ignored) and all three entries there are load-bearing:
`blockExoticSubdeps: false` (the Kobalte fork's `@kobalte/core` points `@kobalte/utils` at its
own git repo — pnpm rejects git specs in subdependencies and an `overrides` entry does _not_
lift the check), `allowBuilds` for `@parcel/watcher` (prebuilt Linux binary is enough) and a
`minimumReleaseAgeExclude` for `sugar-high@2.4.0` (younger than the default 24h window).
`pnpm install` fails loudly if any of them is dropped.

## Identity: `uid` is the only node identity

`StackNode` has **no `id`**. Position comes from `<For>`'s `index()` accessor; everything
that addresses a node (CHANGE/DELETE payloads, `selectedUid`, `data-node-id`,
preprocessor `meta.parents`) uses `uid` (`src/lib/uid.ts`).

Rules that keep keyed rendering cheap (measured before/after in the 2026-09-10 review):

- **Never clone survivors** in MOVE/DELETE. `filter`/`splice` keep references; `<For>` is
  reference-keyed, so survivors' DOM (and their form state, popovers, signals) survives.
  A reindex `.map(node => ({...node, id: index}))` once remounted the whole list per edit.
- New nodes mint uids at construction (`newUid()`); `IMPORT` runs `withFreshUids` so a
  preset applied twice can never share identity; storage/legacy loads use `ensureUids`.
- `StackNodeDraft = Omit<StackNode, "uid">` is the converters' type — uid is minted once
  in `convertPureList`. Don't add uid fields to converters.
- Options merge **in place** through the store proxy (`Object.assign(state[i].options, patch)`)
  — swapping the item reference remounts the card and drops input focus.

## Selection: projection, not per-row comparison

`Workspace` (src/routes/workspace/workspace.tsx) owns `selectedUid` and a
`createProjection<Record<string, boolean>>` keyed by uid. Rows read
`props.isSelected[node.uid]` — one click recomputes only the entering/leaving rows.
Never compare `props.selectedUid() === node.uid` inside every row (that is O(n) per click —
the diagnostics code for it is `HUGE_FAN_OUT`).

## Untrusted nodes and the reactive halt

- **Solid 2 halts the ENTIRE reactive system on an uncaught error** inside a
  computation (JSX render, `createEffect` compute, `createMemo`): the page keeps
  painting and every input ignores the keyboard. `[REACTIVITY_HALTED]` in the
  console is the _symptom_; the cause is the first error above it.
- **An error boundary does not catch effect errors** — it only sees render
  errors, so a form computing on data it did not expect still halts everything.
  `Errored`/`createErrorBoundary` is damage control, not the fix.
- **`Errored` must be the JSX form** (`<Errored fallback={…}><Workspace/></Errored>`).
  Calling `createErrorBoundary(() => <Workspace/>, …)` builds the child in the
  component body, outside the context providers, and dies on `useContext`
  ("Context must either be created with a default value or a value must be
  provided").
- **Node data from outside the app is parsed at the door**: `sanitizeNodes` /
  `sanitizeNode` (`src/lib/node-shape.ts`, valibot) run in `App.loadNodes` and in
  the reducer's ADD/IMPORT. They drop non-nodes, fill options the type declares
  but the payload lacks, and mint missing uids — the store is rendered directly,
  so an unchecked shape (a stale tree, `options: null`, a hand-edited config) is
  a throw in JSX.
- **Enum maps indexed by stored values need a fallback** (`CHANNELS[mode] ??
CHANNELS[default]` in `screentone.tsx`): an unknown member returns `undefined`
  and reaches `<For>`, which throws during render.
- **The halt watchdog** (`src/lib/ui-watchdog.ts`) detects what a boundary
  cannot: a signal is bumped on a timer and one hidden node renders it, so a DOM
  that stops following the beat means the scheduler is dead; then a plain-DOM
  overlay shows the last `window.onerror` text with a reload button. Tests:
  `ui-watchdog.test.ts`, `crash.test.tsx`, `node-shape.test.ts`.

## Solid 2 traps hit in this repo

- **Writes are deferred.** Reading a signal right after `setX()` yields the old value.
  `NumberRow` commits from `e.currentTarget.value`, _not_ from its draft signal: a blur in
  the same task as the last keystroke would otherwise commit the stale draft.
- **Component-body reads need `untrack`.** `createSignal(allPresets()[0]?.name)` in
  `CodeTab` was a `STRICT_READ_UNTRACKED` warning until wrapped in `untrack(...)` — use it
  for deliberate one-time snapshots instead of leaving the warning.
- **Don't hand Kobalte a reactive value its body reads.** `ComboboxBase` reads `options`
  where it cannot track; passing a memo (`createMemo(() => NODE_ORDER.map(...))`) warned,
  passing a module-level array does not.
- **Async continuations capture props they need** before the first `await`/`.then`
  (see `PathRow.lookup`/`onBlur`): untracked reads there are lint warnings and hide bugs.
- **State that outlives a view belongs to the module, not to the component.** The panel
  renders its tabs through a `Switch`, so leaving a tab unmounts it — an object created in
  the component body (the run client did this) closed its WebSocket on the way out, and the
  server read that as a disconnect and cancelled the job. `runClient` is now a module-level
  singleton (`run-client.ts`) and `RunTab` only borrows it; the socket, the progress and the
  journal survive any tab switch.
- Effects are split (`createEffect(compute, apply)`), cleanups are returned from `apply`,
  context wrappers do not exist — call `useContext(NodesContext)` directly (it throws on a
  missing provider by itself).
- **`onCleanup` is forbidden inside `onSettled`** (and `createTrackedEffect`): it throws
  `[CLEANUP_IN_FORBIDDEN_SCOPE]` and, worse, **halts the reactive system** — the app renders
  once and then every click silently does nothing, with no error in the page. Subscribe to
  event listeners the Solid way: return the unsubscribe function from the `onSettled`
  callback. Symptom to recognise: `[REACTIVITY_HALTED] An uncaught error halted the reactive
system` in the console, and clicking anything (even unrelated buttons) has no effect.
  Always capture console/pageerror on a fresh load before believing "the handler is broken".

## Diagnostics workflow (dev)

`vite.config.ts` has `solid({ diagnostics: true })`. Console warnings name a component:
`STRICT_READ_UNTRACKED`, `REACTIVE_WRITE_IN_OWNED_SCOPE`, `HUGE_FAN_OUT`, … The repair table
is `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`.

Current baseline: **4 warnings, all inside `@kobalte/core` (combobox-base) /
`@solid-primitives/controlled-signal`** — app code is clean. Do not chase them here; they are
upstream in the kobalte fork. To attribute a warning, patch `console.warn` via
`page.evaluateOnNewDocument` and read `new Error().stack`.

## UI verification cheatsheet (headless browser)

- Kobalte controls need dispatched pointer events, not `el.click()`:
  `pointerdown` + `pointerup` + `click` (all `bubbles`, `pointerId: 1`, `isPrimary: true`).
- The add-node combobox is `aside input[role='combobox']`; plain `aside input` matches the
  hidden `Switch.Input` checkboxes first (role `switch`).
- `blur()` only fires on a focused element — `el.focus()` before testing commit paths.
- `NumberRow` clamps typed values on commit (`min`/`max`); the stepper buttons clamp too.
- localStorage (`reline-web:config`) holds the raw `StackNode[]`; it is written debounced
  (300 ms), so poll after ~500 ms before asserting persistence.
- `browser.open({ viewport })` ignores `isMobile`/`hasTouch` and `tab.screenshot({ path })`
  does not always write the file — for phone emulation and screenshots use raw Puppeteer
  inside `tab.run`: `page.setViewport({ …, isMobile: true, hasTouch: true })`,
  `page.screenshot({ path })`. `Page.captureScreenshot` intermittently times out when called
  repeatedly — one screenshot per cell.
- CDP `Input.dispatchTouchEvent` is not available in this harness (times out); test touch
  behaviour with synthetic `PointerEvent`s (`pointerType: "touch"`) plus a check of the
  computed `touch-action` on the gesture surface.
- A real `page.mouse.click` is the only way to move a caret into a textarea — synthetic
  `MouseEvent`s do not move it, so a caret assertion built on them proves nothing.

## Layout / data conventions

- **Icon buttons get `@include hit-area`** (`src/styles/_mixins.scss`): a 13px icon
  paints a 17px button, so most of a 38px header strip looks clickable and is not.
  The mixin overlays a transparent `::after`, so nothing moves or resizes. Keep the
  insets at or below half the neighbour gap (`--space-2` = 8px → 4px horizontal):
  expanded buttons then meet at the border instead of covering each other. Verify
  with `document.elementFromPoint` a few px outside the button box, not by eye.
- **Gestures do not rename.** Renaming is the pencil button. A single click
  anywhere on the card's header strip — the name and the wide empty stretch beside
  it included — selects _and_ folds the node; the grip is the one exception (a drop
  must not fold the card it just dropped, and it is marked `data-drag-handle`, not
  detected by tag). Do not give the title its own handler: a zone handler has to
  `stopPropagation` to keep its zone, which is exactly what made the first click
  dead (the header's fold never ran) and made the old double-click-to-rename
  swallow the fold.
- **A whole row as drag source needs no selector list**: `createDragReorder`'s
  `ownsPress` walks from the press target up to the source and refuses the press
  when any step is a control or _wraps_ one — the visible parts of a Kobalte switch
  are plain divs, so matching the target alone misses them.
- **Numeric entry is one component**: `NumberField` (input + ▲/▼ steppers) backs both
  `NumberRow` and `SliderRow`, so limits behave the same everywhere — in-range edits
  commit while typing, out-of-range or half-typed ones clamp on blur/Enter, and the
  steppers never step past `min`/`max`.
- Design tokens only from `src/styles/_tokens.scss`; semantic names must stay semantic
  (`--color-success` green, `--color-danger` red). Hover and selected states must differ by
  more than hue (border tint vs background tint) — they are adjacent states on one element.
- Instructions live in `src/instructions/*.md` (plain Markdown + `marked`), keyed by node
  type, rendered through `import.meta.glob` in `ConfigPanel`.
- The Code tab's JSON view is `sugar-high` (`sugar-high/core` + `sugar-high/lang/json`, not the
  full registry — one format must not pull 29 grammars). It escapes its input and returns an
  HTML string, so it needs an `innerHTML` write with a `solid/no-innerhtml` disable comment.
  Facts that cost real debugging time: its line spans are separated by **literal newlines** and
  `white-space: pre-wrap` breaks them — never set `display: block` on `.sh__line`, that renders
  the newline _and_ a block box, doubling the line pitch.
- Editing is a transparent `<textarea>` stacked on the highlight layer in one grid cell
  (`grid-area: 1 / 1`) inside a single scrolling `.codeStack`. Rules for that overlay:
  - every text metric (font, size, line-height, padding, `white-space`, `overflow-wrap`,
    `tab-size`) must be identical on both layers, and the field must be `position: relative`
    with a `z-index` (the layer below is positioned by `scroll-y` and would otherwise swallow
    clicks);
  - the highlight layer needs `overflow: hidden` **and `scrollbar-gutter: auto`** — `scroll-y`
    reserves 20px of gutter even when hidden, which makes that layer wrap more lines than the
    field and clip the tail of the code;
  - the field is grown to `scrollHeight` in an effect (set height to `0px` first, otherwise a
    shrinking box reports its own height back), so the shell scrolls and the layers never drift;
  - selection tint must stay neutral (`--color-text-muted` at ~35%): the accent tint swallows
    the red string token underneath.
    Verify alignment numerically: `textarea.scrollHeight === pre.scrollHeight`, equal
    `clientWidth`, and a click at a known pixel of line _n_ must put the caret at line _n_.
    Re-highlighting is a single memo over a sub-millisecond parse — no debounce, no cache: do not
    reintroduce either.
- `Ui*` = Kobalte-backed control wrapper (`UiSelect`, `UiCombobox`, `UiSwitch`, `UiTabs`,
  `UiSlider`); plain names = static primitives (`Input`, `Label`, `Icon`). Wording comes from
  the dictionaries — see **i18n** below. Node names are `NODE_DEFS[type].labelKey` rendered
  through `nodeLabel(type)`; nothing matches a node by its display name.
- Icons come from `src/components/ui/icon.tsx` (inline Tabler paths, 24×24 grid, stroke 2) —
  never a text glyph: `⤓` and `↓` in one toolbar were indistinguishable at 16px and only
  differed by a tray line. Icon-only buttons are 32×32 (`.action`), 16px glyph, and carry
  both `aria-label` and `title`. Keep import/export opposite in direction: import = `upload`
  (arrow out of the tray), download = `download` (arrow into it). Remove a path from
  `PATHS` when its last use goes — `IconName` is derived from it, so a stale entry is silently
  dead weight. Text buttons with a leading symbol (`▶ Запустить`, `■ Стоп`) are labels, not
  icon-only controls, and may stay.
- Heartbeat/echo constants live in `src/lib/ws-protocol.ts` — both WS clients
  (`run-client`, `ls-client`) must import them so interval/timeout cannot drift.
  Long-lived timers are always cleared on settle (request timeouts, echo, stop watchdog).
- The run protocol is `WS_API.md` (repo root, shared with the Python runner). Two rules
  there were paid for in bugs: `start.d.pipeline` is a **MessagePack structure**
  (`convertToPure(nodes)`), never a JSON string — a double-encoded config; and a failed run
  ends with `done {ok:false, error}`, never a success `done` after an `error` frame.
- Path bases belong to the deployment, not to the UI: the runner takes `--root` / `--models`
  (or `RELINE_ROOT` / `RELINE_MODELS_DIR`), reports them on `GET /health`, and resolves
  relative config paths against them (absolute or already-under-root paths are left alone, so
  old configs keep working). The client sends `{pipeline}` and nothing else — no `root`/
  `models` in `start`, no `root` in `ls`. The run tab has exactly one setting: the address.
- That address lives in `src/lib/run-client.ts` as a module signal both clients read
  (`endpoint()`, `setEndpoint()`): every keystroke is stored at once, `run` and `ls` dial the
  same value, an edit closes the `ls` socket still pointing at the previous host, and the
  first edit drops `?api=` from the URL so a shared link cannot override what was typed.
- Path completion asks for `./name` when the field holds a bare name
  (`queryPath` in `forms/shared.tsx`): the runner splits the resolved path into
  directory + prefix, so a bare name gives an _empty_ directory, and a runner
  without the `directory = directory or "."` fallback answers an empty list —
  the field looks dead until a slash appears. `./raws`, `raws` and `raws/` must
  all list the same thing on the current runner.
- Verifying the dev server by hand: `curl http://localhost:3100/` returns
  "Cannot GET /" unless you send `Accept: text/html` (the plugin serves the
  document only to document requests) — check `-H 'Accept: text/html'` before
  blaming the app.
- The run UI keeps a **journal** (`RunMessage[]`: `{at, kind, text}`, capped at 50), not a
  single status line: `start` clears it, every `error` frame / dead socket / unconfirmed stop
  appends, and nothing else removes a line. A one-slot notice is what made an error look like
  it "vanished instantly" — the success line of the same run overwrote it.
- `progress` is detailed: `percent` (monotone, one scale per run), `stage`
  (`download|unarchive|read|process|write`), `label` (what runs now), `node` (wire type — the
  editor's own label wins over the runner's `label`), `done/total`, `rate` (images/s; bytes/s
  for `download`), `eta`, `elapsed`, `bytes_done/bytes_total`. Stage line and chips are built
  in the pure `src/lib/run-format.ts` (every formatter is total: garbage → `undefined` →
  chip hidden), so the JSX only picks which chips exist. `rx` bars are 8px; a frame with
  neither stage nor percent shows an indeterminate sweep instead of a strip frozen at 0%.

## i18n (ru / en)

Node names and parameter labels are translated. The **values inside a select are not** —
they stay the raw wire strings (`gray`, `slinear4`, `exact`), the same in both languages, as
the original editor showed them: a list half-translated into Russian («По ширине», «Без
тайлинга») next to library names (Lanczos, Box) reads as a bug, and those are the strings the
runner parses. `src/lib/i18n/`:

- `locale.ts` — `locale()` / `setLocale()` / `LOCALES` / `LOCALE_NAMES`; the choice lives in
  `reline-web:locale`, is detected from `navigator.languages`, and defaults to **ru**.
- `index.ts` — `t(key, params)` (`{name}` placeholders), `render`/`raw`/`message` + the
  `LocalText` type, `MessageKey`, `MessageParams`.
- `messages/{common,nodes,forms,chrome,panel,run}.ts` — one file per area, each with `ru` and
  `en: typeof ru` so a missing or misspelled English key is a compile error;
  `messages/index.ts` merges them. No new wording without both languages.

Rules that the implementation depends on:

- `t()` is typed by the **dotted path** of the merged dictionary — `t("form.upscale.own")`.
  A bad key fails `tsc` (verified: `t("node.upscale.typo")` → TS2345), so there is no runtime
  fallback to chase.
- Never hoist a `t(...)` result into a module constant — it freezes one language for the
  session. Keep the key in the constant (`TABS`, `COLUMN_LABEL_KEYS`, `UiTabDef.labelKey`)
  and call `t` where it renders. `t` reads `locale()` internally, so JSX re-renders on a flip
  with no subscription bookkeeping.
- Option lists are **derived from the enum** — `items={Object.values(ResizeType)}` — never a
  hand-listed set of members; the declaration order in `src/types/enums.ts` is the menu order,
  so adding a member is a one-line change in the enum (plus a line in the node's guide).
  `UiSelect`/`UiCombobox` render `item.rawValue`; there is no option dictionary and nothing to
  keep in sync.
- **Field labels come from the node guides.** `src/instructions/ru/<node>.md` is the reference
  for a parameter's name («Развороты», «Метод тайлинга», «Нижний порог входа» — not «Разброс»,
  «Тайлинг», «Нижний вход»), and the EN guide mirrors it with the EN label. When a label and a
  guide disagree, the guide wins and the label moves: fixing the label alone leaves the doc
  lying, fixing the doc alone leaves the UI lying.
- Never match or compare a node by its display name: `NODE_DEFS[type].labelKey` +
  `nodeLabel(type)`, and `useAddNode(type: NodeType)` takes the type. The old
  `Object.values(NODE_DEFS).find(d => d.label === label)` broke the moment labels localised.
- Text that is stored (the run journal) keeps a **key**, not formatted text: `RunMessage.text`
  is `LocalText`, so lines written in Russian re-read in English after a switch (`render()`);
  server text goes through `raw()` and is never looked up as a key. Same for preset
  descriptions (`LocalText`; an old Russian string stored before i18n renders as itself,
  because `t` falls back to the key text).
- Instructions are per language: `src/instructions/{ru,en}/<node_type>.md`, loaded by the
  `import.meta.glob("../../instructions/*/*.md")` map in `config-panel.tsx` keyed
  `"locale/type"`. `marked` compiles the selected document in a memo that reads `locale()`.
- Placeholders that show an **example wire value** stay identical in both languages:
  `/content/drive/MyDrive/raws`, `/content/models/...`, `1, 2, 3`. A placeholder that is
  wording (`Add node`, `Model name`) is a key like any other label.
- `<html lang>` follows the switcher from an App effect; the prerendered shell ships
  `lang="ru"` (the shell cannot know the visitor). The switcher is ONE button in the top
  bar: it shows the language it switches **to** (`EN` while the UI is Russian — the label is
  a two-letter code so the 320px bar still fits), carries `LOCALE_NAMES` in the `title` and
  `t("app.switchLanguage", { language })` in the `aria-label`. It sits just left of the
  panel toggles with `margin-left: auto`: the toggles keep the right edge they had before
  the switcher existed (verified at 1400px: toggles end at the bar's inner edge, no
  horizontal overflow).
- Tests: `setLocale()` is an ordinary signal write, so a test that reads a message in the same
  tick needs `flush()` from `solid-js` — `src/lib/i18n/i18n.test.ts` and
  `run-format.test.ts` both wrap it in a `use(locale)` helper. `i18n.test.ts` also asserts the
  two dictionaries have identical key sets and no empty strings.

## Phones & touch

Three widths are supported and they are _not_ the same rule:

| width                                                                     | layout                                                           |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| > 860px                                                                   | three side-by-side columns, resizable splitters                  |
| 701–860px                                                                 | columns stacked in one scroll container, each `min-height: 40vh` |
| ≤ 700px, **or** coarse pointer with `max-height: 500px` (landscape phone) | one panel at a time + fixed bottom switcher                      |

- The phone branch is `PHONE_QUERY = "(max-width: 700px), (pointer: coarse) and (max-height: 500px)"` in
  `workspace.tsx` and the **same query text** must stay in `workspace.module.scss` — `createMediaQuery`
  (`src/hooks/use-media-query.ts`) drives the JS side: `shown()` returns one column, `hidden(key)` becomes
  "not the active panel", the bottom nav calls `setPhonePanel` instead of `toggleHidden`, and the toggles are
  never `disabled` there (a switcher always has exactly one active item).
- A phone shows **two** panels — `PHONE_COLUMN_KEYS = ["middle", "right"]`: the node list is a second view of
  the same stack, so it is dropped and what was unique to it moved onto the stack panel, phone-only, driven by
  a `phone` prop (never by CSS alone):
  - `AddNodeMenu` pinned **below** the stack scroller (never inside it — adding a node must not need a scroll);
  - the enable switch in the node card header (`useToggleEnabled` from `src/hooks/use-node-actions.ts`, shared
    with the node list so the "never disable the last enabled node" rule cannot drift);
  - delete out of the always-visible header (a stray thumb used to cost a node) and into the expanded card as a
    labelled 40px row; rename stays as the pencil.
    Result: header = grip, pencil, title, enable, chevron. Measured title width: 152px on 390px (was 88px with the
    trash button still in the row), 82px on 320px.
- Nav height uses `grid-auto-flow: column` / `grid-auto-columns` so the same bar fills with two or three buttons.
- The nav is `position: fixed` (z-index 10, under the 50/60 popper layers) and `.columns` reserves it with
  `padding-bottom: calc(var(--nav-h) + var(--safe-bottom))` — `--nav-h` is defined once on `.workspace`.
  Heights use `dvh`, edges use `--safe-*` (from `env(safe-area-inset-*)`, 0 where there is no cutout), and
  `Document.tsx` must keep `viewport-fit=cover` for those insets to be non-zero.
- `@media (pointer: coarse)` is the touch switch, never a width query: `--font-size-field` becomes 16px
  (iOS zooms the page on focusing anything smaller and never zooms back), `--touch-min` (40px) sizes every
  control, and the number steppers go from stacked to side by side. Coarse rules also apply on a tablet that
  keeps the desktop layout.
- Component reflow is `@container panel (max-width: 460px)` — `.column` is `container: panel / inline-size`,
  so a 220px desktop side column and a 390px phone panel take the same branch (single-column `grid2`/`grid3`,
  full-width preset trigger). Never duplicate those rules as media queries.
- Reordering is pointer-based (`use-drag-reorder.ts`): HTML5 drag-and-drop **never fires on a touch screen**.
  The gesture is captured on the handle (`touch-action: none` there and only there, so lists still scroll),
  starts after a 6px threshold (a tap must still select the row), and the same handle handles
  ArrowUp/ArrowDown for keyboard moves. `dropIndex` stays the raw insertion index (0..n, placeholder before
  the row at that index); `from`/`to` for the reducer are computed at drop.
- Verification that actually proves a phone layout (headless): `page.setViewport({width, height, isMobile: true,
hasTouch: true})` — `browser.open({viewport})` drops `isMobile`/`hasTouch`, so `(pointer: coarse)` stays
  false and every coarse rule silently does not apply. Clear `reline-web:layout` before the sweep, or hidden
  columns from an earlier run make "no page scroll / one column" pass for the wrong reason.

## Remote model list (mdb)

`src/lib/model-db.ts` keeps the list in memory for the whole session:

- `preloadModelNames()` runs once from `App` (`onSettled`) and seeds the index from the
  `reline-web:mdb` localStorage copy (87 entries ≈ 9.5 KB), refreshing only when that copy is
  older than `CACHE_TTL_MS` (6 h). Cold start = exactly **one** `files.json` request, in the
  background; after that a session never refetches (`modelNames()` returns the in-memory array).
- `modelsLoaded()` / `modelUrl(name)` read the index synchronously; `modelNames()` is the async
  view. A failed fetch clears the in-flight promise so the next call retries — never cache a
  rejection.
- Model completion must never wait on the network: `PathRow` skips its 250 ms debounce when
  `source === "mdb" && modelsLoaded()` (measured focus → populated list: ~5 ms vs a fetch plus
  250 ms before). Keep the debounce for `ls` sources — it exists to spare the runner.
- `modelUrl` is an exact name match on purpose (legacy configs carry the database's own names);
  `resolveModelName` is the fuzzy one used for typed input.

## Legacy configs (pre-preprocess format)

A top-level **array** (instead of `{nodes, preprocess}`) is the old shape: `download` /
`unarchive` sit inline in the pipeline and models are addressed as
`/content/models/<name>.pth`. Import migrates it in `src/lib/convert/index.ts`:

- `importContext(nodes, preprocess, options)` absorbs inline preprocessors into the _same_
  context as the `preprocess` section (inline ones are additionally reported), so a legacy
  `unarchive{path: <dir>}` becomes the reader's `unarchive: true` flag and its `.zip` archive on
  the way out; a legacy `download{name}` makes the upscale an mdb model.
- The download link is looked up by name through `StackImportOptions.urlOf` — pass
  `modelUrl` from `model-db.ts`. `convertToStack`/`stringToNodes` take `{urlOf, onLegacy}`; the
  Code tab awaits `preloadModelNames()` before parsing (instant when warm) and renders
  `LegacyMigration` as the status notice.
- **Oldness check** = the produced `LegacyMigration` has any non-empty list. A current config
  yields `undefined` → no notice (verified in the browser: re-importing the app's own export
  says just «Конфиг применён»).
- Don't invent models: a bare name with no download entry stays `is_own_model: true`, and a
  legacy path the database does not know keeps its path and stays an own model (nothing is
  rewritten, so nothing is reported).
- Rules are covered by `src/lib/convert/legacy.test.ts` (both user-supplied configs).

## Tests

- `src/lib/convert/roundtrip.test.ts` — pure ↔ stack symmetry; keep passing through any
  convert or preset change.
- `src/lib/convert/legacy.test.ts` — legacy array → current config: path→name, link from the
  database, reader unarchive flag, re-export shape, and the "not legacy" negative case.
- `src/context/reducer.test.ts` — uid identity invariants (CHANGE-by-uid, survivor
  identity, MOVE without cloning, ADD, IMPORT fresh uids). Extend it when you touch
  `src/context/reducer.ts`; it is the fastest way to prove no remount storm was reintroduced.
