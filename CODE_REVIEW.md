# Code Review — reline-web

**Date:** 2026-09-10 · **Branch:** `solid-v2` · **Stack:** Solid 2.0.0-rc.6, Vite 8, Kobalte (fork), SCSS modules
**Baseline for comparison:** `D:\code\solid\*` (neko-web-v2, rebase-ui, shikai-ui, rukopis, neko-web)

**Method:** iterative — read the graph (state → routes → components → lib), formed hypotheses, then
**verified each one empirically** with throwaway probe tests against the real `@solidjs/signals` runtime,
plus `tsc`, `vitest` and `oxlint` runs. Findings below are labelled **Measured**, **Verified** or **Observed**.
Two of my initial hypotheses were disproved by measurement and are recorded as such in
[Appendix A](#appendix-a--hypotheses-that-measurement-disproved), because they change what the correct fix is.

**Toolchain state at review time**

| Check               | Result                                      |
| ------------------- | ------------------------------------------- |
| `bunx tsc --noEmit` | ✅ passes (clean)                           |
| `bunx vitest run`   | ✅ 8/8 passing (`roundtrip.test.ts`)        |
| `bun run lint`      | ❌ **fails — cannot run at all** (see P0-1) |

---

## Executive summary

The codebase is in better shape than its size suggests: the reducer is a genuine single write path, the
convert layer is symmetric and round-trip tested, and the comments explain _why_ rather than _what_ —
several of them document real Solid-2-rc workarounds that would otherwise look like noise. Whoever wrote
this understood the framework.

The problems cluster in four places:

1. **The linter has never run.** `oxlint.config.ts` imports a package that isn't installed. Every style rule
   the project believes it enforces — including `eslint-plugin-solid`'s reactivity rules, which would have
   caught real issues below — has been silently inert.
2. **Selection is O(n) in rendering work.** Every selection change re-evaluates a class binding on every card.
   Measured: 50 nodes → 50 recomputes per click. A `createProjection` selector takes this to 1.
3. **`DELETE`/`MOVE` destroy object identity for the entire list**, so the keyed `<For>` unmounts and remounts
   every surviving row. Measured: deleting 1 of 6 nodes causes 5 unnecessary remounts. This is also the
   root cause the `uid` + FLIP machinery exists to paper over.
4. **The registry is ~180 lines of dead, and drifted, duplicate data** that contradicts the real defaults.

Divergence from the `D:\code\solid` house style is consistent and mostly mechanical (formatter, lint
invocation, `typecheck` script, component idiom), and is collected in [§5](#5-divergence-from-dcodesolid-house-style).

**Priority counts:** P0 × 3 · P1 × 6 · P2 × 7 · P3 × 5

---

## P0 — Broken or user-visible-wrong

### P0-1 · The lint script cannot execute — every rule is inert

**`oxlint.config.ts`, `package.json:lint`** · **Verified (reproduced)**

```
$ bun run lint
x Failed to load config: oxlint.config.ts
| Error: Cannot find module 'eslint'
```

`oxlint.config.ts:2` does `import solidV2 from "eslint-plugin-solid/configs/v2"`. That subpath pulls
`@typescript-eslint/utils`, which `require`s `eslint` — and `eslint` is **not** in `package.json`.
`eslint-plugin-solid` is listed, but its peer never was.

This is the highest-value finding in the review because it is _upstream of the others_: the plugin's
`solid/reactivity` rule is precisely what flags the prop-reactivity and effect issues found below. The
project has a lint gate it believes is green and which has, in fact, never produced a single diagnostic.

**Fix** — mirror the house invocation (`neko-web-v2`, `rebase-ui`, `shikai-ui` all use the same line):

```jsonc
// package.json
"lint": "oxlint --type-aware --type-check",
"typecheck": "tsc --noEmit"
```

Add `oxlint-tsgolint` to devDependencies. Either add `eslint` as a devDependency to make the current
config loadable, or drop the `jsPlugins`/`settings`/`rules` re-export and use oxlint's own built-in
`solid` rules — the latter matches every reference project and avoids the JS-plugin bridge entirely.
**Then run it and fix the backlog it surfaces**; expect this to be a real, non-trivial batch.

---

### P0-2 · Every preset ships the wrong model URL

**`src/lib/presets.ts:143,156,170,184,196`** · **Verified (read)**

Five of the seven presets pass a `model_url` that points at **MangaScale_GfisrV2** regardless of which
model the preset actually names:

```ts
upscale("4x_dwtp_ds_atdl3",        "…/4x_wtp_MangaScale_GfisrV2.tar.xz", …)  // ← wrong model
upscale("4x_dwtp_ds_moesr_v2",     "…/4x_wtp_MangaScale_GfisrV2.tar.xz")     // ← wrong model
upscale("4x_umzi_digital_art_mosr_l", "…/4x_wtp_MangaScale_GfisrV2.tar.xz")  // ← wrong model
upscale("4x_IllustrationJaNai_V3detail_DAT2_28k_bf16", "…GfisrV2.tar.xz", …) // ← wrong model
```

Only `mangascale` (line 143) is self-consistent. `convertUpscaleToPure` emits `{name, url}` straight into
the `download` preprocessor, so **applying any of these four presets and running downloads the wrong
weights** — under the right name. Depending on the backend this either errors on a shape mismatch or,
worse, silently upscales with a model the user did not choose.

**Fix** — the URL is derivable from the name; stop passing it. Make the helper build it, and let the
mdb lookup (`resolveModelName`) stay the single source of truth for real URLs:

```ts
const MODEL_BASE = "https://bucket.yor.ovh/torch_models";
const upscale = (model: string, dtype = DType.F32, size = 896): StackNode => ({
  …,
  options: { …, model, model_url: `${MODEL_BASE}/${model}.tar.xz` },
});
```

That signature change also removes the positional-argument hazard that produced this bug: the current
`upscale(model, model_url, dtype, size)` makes a wrong-but-plausible URL easy to paste and impossible to
notice at a glance.

---

### P0-3 · Success and hover states render in the error/accent colour

**`src/styles/_tokens.scss:23-25`** · **Verified (read + usage grep)**

```scss
--color-primary: #975151; // desaturated red
--color_accent: #975151; // ← underscore, and unused anywhere
--color-success: #975151; // ← identical to primary
```

Three consequences, all user-visible:

- **Success reads as failure.** `config-panel.module.scss:237` paints `.ok` status text with
  `--color-success` (`#975151`, red) while `.err` uses `#f87171` (red). "Пресет применён" and
  "Некорректный JSON" are now near-indistinguishable — the two messages that most need to differ.
- **Selected is indistinguishable from hover.** `node-card.module.scss` uses `--color-primary` for
  `:hover:not(.selected)` and `--color-success` for `.selected`. Same hex ⇒ hovering any card makes it
  look selected. Same defect in `nodes-list.module.scss:43`.
- **`--color_accent` is dead** — underscore instead of hyphen, zero references. It never resolved.

Comments in `_mixins.scss:51-52` and `config-panel.module.scss:423` still describe these as _green_,
confirming a theme swap (commit `2095110 "fix colors"`) changed hexes without revisiting semantics.

**Fix** — give semantic tokens semantic values and delete the dead one:

```scss
--color-primary: #975151;
--color-success: #4ade80;
--color-danger: #f87171; // replaces the hardcoded .err literal
--color-selected: var(--color-primary); // if selected should track the accent
```

Then hover and selected must differ by more than hue — use border **width** or a background tint, since
they are adjacent states on the same element.

---

## P1 — Performance degradation (measured)

### P1-1 · Selection re-evaluates a binding on every card — O(n) per click

**`src/components/node-card/node-card.tsx:83,249`, `nodes-list.tsx:87`** · **Measured**

Both lists compare against the selected id inside a per-row binding:

```tsx
class={{ [styles.selected]: props.selectedId === props.id }}   // node-card.tsx:83
class={{ [styles.active]:   props.selectedId() === node.id }}  // nodes-list.tsx:87
```

Each row's class effect subscribes to the selection signal, so one click invalidates all of them.
Probe, 50 nodes, one `setSelectedId`:

| Pattern                        | Recomputes per selection change             |
| ------------------------------ | ------------------------------------------- |
| Current (compare in every row) | **50**                                      |
| `createProjection` selector    | **1** (3 on re-select: clear old + set new) |

`createProjection` is Solid 2's replacement for `createSelector` and exists for exactly this: it keeps a
keyed projection so only the _entering_ and _leaving_ rows recompute.

```tsx
// once, where selectedId lives (workspace.tsx)
const isSelected = createProjection<Record<number, boolean>>((draft) => {
  for (const k of Object.keys(draft)) delete draft[+k];
  const id = selectedId();
  if (id !== null) draft[id] = true;
}, {});

// per row
class={{ [styles.selected]: isSelected[props.id] }}
```

At 7 default nodes this is invisible; the cost is linear in stack size and this is a pipeline builder
where long stacks are the point.

---

### P1-2 · `DELETE` and `MOVE` remount the entire list

**`src/context/reducer.ts:31-60`** · **Measured**

```ts
case DELETE:
  setNodes((state) => state.filter(…).map((node, index) => ({ ...node, id: index })));
```

`{ ...node }` allocates a **new object for every survivor**. `<For>` is reference-keyed, so every row is
a cache miss. Probe, deleting 1 node from 6:

```
initialMounts=6  totalMounts=11  newMounts=5  survivors=5
```

Five rows that did not change were destroyed and rebuilt — tearing down each card's DOM, its
`NodeOptionsForm`, its Kobalte popovers and every local signal (open dropdowns, rename drafts, path
menus). `MOVE` has the same shape; its `node.id === index ? node : {...node, id: index}` guard almost
never fires, because a move is precisely what changes indices (probe: 0 of 3 identities reused).

This is also **why `uid` and the whole FLIP layer exist**: with identity preserved, `<For>` would move the
existing DOM nodes and the animation problem would be much smaller.

**Root cause:** `id` is overloaded as _both_ stable identity _and_ array position, so any structural edit
must rewrite every id. The two roles need separating:

- `uid` becomes **the** identity (it already exists, is already stable, and is already the FLIP key).
- Array position is just `index()` — it does not need to be stored at all.
- `id` disappears; `payload` for `DELETE`/`CHANGE` becomes a `uid`.

That single change removes the reindex, preserves identity across `DELETE`/`MOVE`, kills the remount
storm, and lets `<For>` animate natively. It is the highest-leverage refactor in this review — see
[§4](#4-the-central-architectural-issue-id-means-two-things).

---

### P1-3 · Full config re-serialised and written to `localStorage` on every keystroke

**`src/App.tsx:35-44`** · **Measured**

```ts
createEffect(
  () => JSON.stringify(nodes), // ← reads every property of every node
  (json) => localStorage.setItem(STORAGE_KEY, json),
);
```

The compute walks the whole store, so it subscribes to **every leaf**, and any deep write re-runs it.
Probe (30 nodes, 100 option edits): **101 full serialisations in 22.3 ms**, each followed by a
_synchronous, main-thread_ `localStorage.setItem`.

Typing "2000" into a width field is 4 keystrokes → 4 serialisations + 4 blocking disk writes. The
serialisation cost is modest; the synchronous storage write is the real hazard, and it scales with total
config size, not with what changed.

**Fix** — debounce the write (the compute must keep reading through the proxy; the comment at
`App.tsx:33-34` is correct on that point and worth preserving):

```ts
let timer: ReturnType<typeof setTimeout>;
createEffect(
  () => JSON.stringify(nodes),
  (json) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, json);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  },
);
```

Same pattern applies to `use-columns-layout.ts:88-97`, which writes on **every pointermove frame** during
a column drag — a `setItem` per frame for the duration of the gesture. That one is more urgent than the
node persistence.

---

### P1-4 · `nodes.find()` per card makes stack rendering O(n²)

**`node-card.tsx:47`, `node-options-form.tsx:32`, `forms/shared.tsx:33`** · **Verified**

```ts
const node = () => nodes.find((n) => n.id === props.id);
```

Three separate `find` calls per card (card body, options form, and the shared form hook), each a linear
scan, each running for every card. A 200-node stack does 20 100 comparisons per full pass — and because
each `find` touches `n.id` on every node it walks, it subscribes far more broadly than it needs to.

Under the `uid`-keyed refactor (P1-2) this disappears entirely: `<For>` already hands the node object to
the row, so pass `node` down as a prop instead of re-finding it by id three times.

---

### P1-5 · `ls` request timeouts are never cancelled

**`src/lib/ls-client.ts:51-56`** · **Verified**

```ts
setTimeout(() => { if (this.pending.delete(id)) { … } }, LS_TIMEOUT_MS);
```

The 17-second timer is created per request and **never cleared on success**. `PathRow` fires a lookup on
every keystroke (debounced 250 ms) and on every focus, so a normal typing session accumulates dozens of
live timers, each retaining its closure for 17 s. Not a leak in the unbounded sense, but needless
pressure and a real one if the endpoint is slow.

Also **`failAll` rejects promises whose `.catch` may already be gone**, and `LsOptions.filesOnly` is
plumbed through `send()` but no caller ever sets it (dead parameter).

**Fix** — keep the handle and clear it in both resolution paths:

```ts
const timer = setTimeout(…, LS_TIMEOUT_MS);
this.timers.set(id, timer);
// in onmessage, after resolving: clearTimeout(this.timers.get(id)); this.timers.delete(id);
```

---

### P1-6 · `run-client` heartbeat contradicts its own documentation, and `stop()` can hang forever

**`src/lib/run-client.ts:23-26,199-207`** · **Verified**

The comment says "echo every 5 s … no reply for 15 s"; the constants agree (`5000`/`15000`). But
`ls-client.ts:20` uses `ECHO_INTERVAL_MS = 20000` with a hardcoded `15000` timeout on line 138 — so the
ls socket **echoes less often than its own timeout**, guaranteeing a spurious close on an idle-but-healthy
connection. Its doc comment claims "5 s echos per WS_API.md", which matches neither the constant nor the
other client.

Separately, `stop()` sets `phase = "stopping"` and sends `stop`, but nothing ever times out. If the server
never replies with `done`, the UI is stuck: `busy()` stays true, "Запустить" stays disabled, and "Стоп" is
disabled by `phase() === "stopping"`. The only escape is a page reload.

**Fix** — hoist the echo constants into one shared module so the two clients cannot drift, make the ls
interval strictly less than its timeout, and give `stop()` a watchdog that forces `finish()` after a few
seconds.

---

## P2 — Architecture and correctness

### P2-1 · `NODE_DEFS` is ~180 lines of dead data that contradicts the real defaults

**`src/components/nodes/registry.ts`** · **Verified (grep)**

`NodeDef` carries `fields`, `description` and `defaults`. Grep across `src/`:

- **`.fields` — zero consumers.** ~150 lines of field metadata (labels, kinds, item lists) that nothing reads.
  The actual forms are hand-written in `forms/*.tsx`.
- **`.description` — zero consumers.** The only `.description` hit is `preset.description`, unrelated.
- **`.defaults` — one consumer** (`nodes-list.tsx:48`), and it **disagrees with `DEFAULT_NODE_OPTIONS`**.

The drift is not cosmetic. Adding a node from the UI produces different values than the same node type in
the default stack:

| Option                          | `DEFAULT_NODE_OPTIONS` (constants.ts) | `NODE_DEFS.defaults` (registry.ts) |
| ------------------------------- | ------------------------------------- | ---------------------------------- |
| `folder_reader.path`            | `/content/drive/MyDrive/raws`         | `""`                               |
| `folder_reader.mode`            | `GRAY`                                | `"rgb"`                            |
| `folder_reader.unarchive`       | `false`                               | _missing_                          |
| `resize.width`                  | `2000`                                | `1920`                             |
| `resize.filter`                 | `SLINEAR4`                            | `"lanczos"`                        |
| `resize.spread`                 | `true`                                | `false`                            |
| `level.high_input`              | `253`                                 | `255`                              |
| `sharp.canny_type`              | `UNSHARP`                             | `"normal"`                         |
| `screentone.dot_size` / `angle` | `7` / `0`                             | `6` / `45`                         |

And `registry.ts:3` **imports `DEFAULT_NODE_OPTIONS` without ever using it** — the intent to unify was
there and was abandoned mid-edit. The `fields` item lists are stale too: `resize.filter` offers 8 filters
while `FilterType` has 32, and the values are typed `as NodeOptions`, so TypeScript never checked any of it.

**Fix** — delete `fields` and `description`, point `defaults` at `DEFAULT_NODE_OPTIONS`, and drop the casts
so the enum types are actually enforced:

```ts
export interface NodeDef { type: NodeType; label: string; defaults: NodeOptions; }
[NodeType.RESIZE]: { type: NodeType.RESIZE, label: "Resize", defaults: DEFAULT_NODE_OPTIONS.resize },
```

Net: ~180 lines removed and one class of "why did my new node come out different" bug closed.

---

### P2-2 · `DEFAULT_NODES` shares option objects with `DEFAULT_NODE_OPTIONS`

**`src/constants.ts:82-125`** · **Verified**

`DEFAULT_NODES[i].options` is a **reference** to `DEFAULT_NODE_OPTIONS.<key>`, not a copy. `App.tsx:25`
happens to `structuredClone` it, and `presets.ts:134` does too — so today it is safe. But the module-level
constant is one un-cloned consumer away from letting a user edit mutate the app's defaults for the rest
of the session. Since `DEFAULT_NODE_OPTIONS` is also the intended source for `NODE_DEFS.defaults` (P2-1),
that second consumer is about to be added.

**Fix** — make the shape a factory (`createDefaultNodes()`) so callers cannot forget, or deep-freeze the
constants in dev.

---

### P2-3 · Context wrappers re-implement behaviour Solid 2 provides

**`src/context/contexts.ts:14-27`** · **Verified**

```ts
export const NodesContext = createContext<NodesStore>();
export const useNodes = (): NodesStore => {
  const nodes = useContext(NodesContext);
  if (!nodes) throw new Error("useNodes: missing …provider");
  return nodes;
};
```

In Solid 2, `createContext<T>()` with no default returns `T` (non-nullable) and **throws on its own** when
read outside a provider. The manual null-check-and-throw is the 1.x idiom; here it is dead code guarding
a condition the runtime already handles, and the file's own comment ("Default-less contexts: reading them
without a Provider is a bug, not a maybe") states the 2.0 semantics correctly while the code below
contradicts it.

**Fix** — delete both wrappers and call `useContext(NodesContext)` directly at the call sites.

---

### P2-4 · `IMPORT` and `ADD` bypass the id/uid invariants the rest of the reducer maintains

**`src/context/reducer.ts:45-64`** · **Verified**

- **`ADD`** (`nodes-list.tsx:41`) computes `Math.max(...nodes.map(n => n.id)) + 1`, which is _not_ an array
  index. Every other action treats `id` as the array position. So after one `ADD` the invariant that
  `DELETE`/`MOVE` depend on is already broken — `MOVE`'s `node.id === index` identity guard silently stops
  matching, and `NodeCards` passes `index` and `id` as separate props precisely to work around the
  ambiguity (`node-card.tsx:21` even documents it: _"drag state is index-based, ids are not"_).
- **`IMPORT`** calls `ensureUids(payload)` but never reindexes ids. `convertToStack` happens to emit
  sequential ids, so it works — by coincidence of the caller, not by construction.
- **`ADD`** never validates that `payload.id` is unused.

All three dissolve under the `uid`-as-identity refactor (P1-2 / §4).

---

### P2-5 · `PathRow` has a stale-response race

**`src/components/nodes/forms/shared.tsx:~390-420`** · **Verified**

`lookup()` debounces at 250 ms but does **not** guard against out-of-order resolution. Two in-flight
lookups (fast typing across the debounce boundary, or `mdb` + `ls` interleaved) resolve in completion
order, not request order, so an older, slower response can overwrite a newer one — the dropdown then
shows completions for a prefix the user has already typed past.

`mdbHits` is a plain `let` written from inside a `.then`, compounding it: `complete()` may read hits that
belong to a superseded query.

**Fix** — capture a sequence number per lookup and drop stale resolutions:

```ts
let seq = 0;
const lookup = (value: string) => {
  clearTimeout(timer);
  const mine = ++seq;
  timer = setTimeout(() => { … .then((r) => { if (mine !== seq) return; … }) }, 250);
};
```

Also: the debounce timer is never cleared on unmount, and `PathRow` does DOM lookups by id
(`document.getElementById(listId)`) in five places where a `ref` would be direct and cheaper.

---

### P2-6 · `NumberRow` rejects intermediate input, fighting the user mid-edit

**`src/components/nodes/forms/shared.tsx:~110-120`** · **Verified**

```tsx
onInput={(e) => {
  const parsed = Number(e.currentTarget.value);
  if (e.currentTarget.value !== "" && Number.isFinite(parsed)) props.onInput(parsed);
}}
```

The value round-trips through the store and back into `value=`. Typing `-` or `1.` or `1e` yields
`NaN`/non-finite, the dispatch is skipped, and the input is re-rendered from the last committed value —
so a negative number cannot be typed in the natural order, and a decimal point vanishes as you type it.
`diapason_black` defaults to `-1`, so this is reachable in normal use.

Note the clamp helper exists but is **only applied by the stepper buttons**, not by typed input — so
`min`/`max` are advisory when typing and enforced when clicking.

**Fix** — hold a local string draft while focused, commit (and clamp) on blur/Enter.

---

### P2-7 · `highlightJson` re-highlights the entire config on every keystroke

**`src/components/config-panel/config-panel.tsx:94-125,136`** · **Verified**

`code()` is `nodesToString([...nodes])` — a full convert + `JSON.stringify` of the whole pipeline, feeding
`highlightJson`, which regex-scans the result and builds a `JsonPart[]` that `<For>` renders as one
`<span>` per token. For a 7-node config that is several hundred DOM nodes rebuilt on **every option edit**,
while the Code tab is open.

The memo at line 119 is inside the component, so it is recreated per render rather than shared, and
`<For>` over freshly-allocated part objects is a guaranteed full re-key.

**Fix** — the pragmatic option is to debounce `code()` and drop the token loop in favour of a single
`<pre>` with CSS `white-space: pre`, highlighting only when the tab is visible. If syntax colour is
worth keeping, memoize `highlightJson` at module scope keyed on the string.

---

## P3 — Naming, hygiene, dead code

### P3-1 · `DotType.INVERT = "cross"`

**`src/types/enums.ts:99`** · **Verified**

```ts
export enum DotType { CIRCLE = "circle", LINE = "line", INVERT = "cross", … INVLINE = "invline" }
```

The member is named `INVERT` but its value is `"cross"`, and a genuine `INVLINE` sits two lines below.
`registry.ts:215` lists the UI items as `["circle","line","cross","ellipse","invline"]`, confirming the
wire value is `"cross"` and the **name** is the error. Anyone writing `DotType.INVERT` reasonably expects
an inversion and gets crosshatch. Rename to `CROSS`.

### P3-2 · Unused imports and exports

**Verified (grep)**

| Symbol                          | Location                                 | Status                                                     |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `DEFAULT_NODE_OPTIONS`          | `registry.ts:3`                          | imported, never used                                       |
| `MODEL_PREFIX`, `MODEL_POSTFIX` | `convert/index.ts:9`                     | imported, never used (real use is in `convert/upscale.ts`) |
| `NODE_ORDER`                    | `nodes-list.tsx:4`                       | imported, never used                                       |
| `createMemo`                    | `node-card.tsx:6`, `add-node-menu.tsx:1` | imported, unused / needless                                |
| `getPresetById`                 | `presets.ts:287`                         | exported, zero consumers                                   |
| `LsOptions.filesOnly`           | `ls-client.ts:5`                         | plumbed, never set                                         |
| `--color_accent`                | `_tokens.scss:24`                        | defined, never referenced (see P0-3)                       |

A working linter (P0-1) reports all of these automatically.

### P3-3 · `Show` callback parameter shadowing and an unused binding

**`config-panel.tsx:78-82`, `node-card.tsx:70`, `node-card.tsx:38-45`** · **Verified**

```tsx
<Show when={def()}>
  {(def) => <div class={styles.doc} innerHTML={docHtml()} />}
</Show>
```

The `def` parameter shadows the outer `def` accessor **and is never used** — the body reads `docHtml()`.
Same shadowing pattern with `node` in `node-card.tsx:70` (there it _is_ used, but the shadowing still
makes the outer accessor unreachable inside the block). `createEffect(() => editing(), (editing) => …)`
at line 38 shadows the signal with its own value.

Rename the callback bindings (`d`, `n`, `isEditing`) — shadowing a signal with its unwrapped value is
exactly the confusion Solid 2's split-effect signature is meant to avoid.

### P3-4 · Naming inconsistency across the component layer

**Observed**

- **`Ui` prefix is applied arbitrarily**: `UiCheckbox`, `UiCombobox`, `UiSelect`, `UiSlider`, `UiTabs` — but
  `Input`, `Label`, `Icon` in the same barrel. No rule distinguishes them.
- **`UiCheckbox` renders a Kobalte `Switch`.** Its own comment admits it: _"Toggle switch (replaces the old
  checkbox look; props API unchanged)"_. A component named checkbox that is a switch will mislead every
  future reader; rename to `UiSwitch`.
- **`NodeCard` vs `NodeCards`** differ by one character and live in one file with different prop contracts.
  `NodeStack` for the container is unambiguous.
- **Mixed languages in user-facing strings**: `"Узлы"`/`"Стек"` next to `"Add node"`, `"Rename node"`,
  `"Drag to reorder"`. Pick one, or introduce an i18n map — the current split looks accidental.
- **`PureNode` / `StackNode`** are good, well-documented names; keep them.

### P3-5 · Repo hygiene

**Verified**

- **Two lockfiles**: `bun.lock` _and_ `package-lock.json` (117 KB). The project standard is bun; the npm
  lockfile is stale and will drift. Delete it and add to `.gitignore`.
- **`"build": "vite build && rm -rf dist/client/.vite"`** uses `rm -rf`, which is unavailable in `cmd.exe`
  on a Windows-primary project. Use `rimraf`, or Vite's own config to suppress the manifest dir.
- **No `typecheck` script**, despite `tsc --noEmit` passing cleanly and every reference project having one.
- **`.mdx` files contain plain Markdown** and are parsed with `marked` as raw text. The extension implies
  MDX/JSX support that neither exists nor is wanted. Rename to `.md`.
- **`vitest-setup.ts` and `oxlint.config.ts`** sit at repo root while all other config is conventional —
  fine, but `oxlint.config.ts` should be `.json`-style config if the JS-plugin bridge is dropped (P0-1).

---

## 4 · The central architectural issue: `id` means two things

Nearly every P1/P2 finding traces to one decision. `StackNode.id` is simultaneously:

1. **stable identity** — what `CHANGE`/`DELETE` address, what `selectedId` stores, what `data-node-id` exposes; and
2. **array position** — what `MOVE` reindexes, what `convertToStack` assigns, what `ADD` _doesn't_.

These cannot both hold. The code documents the tension repeatedly rather than resolving it:

> `node-card.tsx:21` — _"Position in the stack — drag state is index-based, ids are not."_
> `node-card.tsx:221` — _"Render by node objects, not ids: ids are reindexed after every MOVE…"_
> `reducer.ts:37` — _"reindex, but keep object identity for nodes whose id did not change"_
> `node.ts:74` — _"Unlike `id` (which is reindexed to array positions on MOVE), this never changes"_

`uid` was introduced to recover what `id` gave up — but only for FLIP, so the codebase now carries **both**
keys and gets the benefits of neither: identity churn on every structural edit (P1-2), triple `find()` by
id (P1-4), an `ADD` that breaks the index invariant (P2-4), and a FLIP layer compensating for remounts
that keyed rendering would otherwise avoid.

**Recommended refactor** (sequence matters):

1. **`uid` becomes the sole identity.** Make it required (`uid: string`), generated at construction.
2. **Delete `id`.** Position is `index()` from `<For>`; nothing needs it stored.
3. **Re-target actions**: `DELETE`/`CHANGE` take `uid`; `MOVE` keeps `from`/`to` indices.
4. **Drop the reindex `.map()`** in `DELETE`/`MOVE` — survivors keep identity, `<For>` moves DOM instead
   of rebuilding it (this alone resolves P1-2, and most of P1-4).
5. **`selectedId` → `selectedUid`**, then layer `createProjection` on top (P1-1).
6. **Pass the node object down** from `<For>` rather than re-finding it three times (P1-4).
7. **Re-evaluate the FLIP hook** — with identity preserved it may reduce to a CSS transition, or stay as
   a smaller, better-justified layer.

Steps 1–4 are mechanical and independently testable; `roundtrip.test.ts` already covers the convert layer
and should keep passing throughout.

---

## 5 · Divergence from `D:\code\solid` house style

Compared against `neko-web-v2`, `rebase-ui`, `shikai-ui`, `rukopis`, `neko-web`:

| Aspect          | House standard                                           | reline-web                             | Action                                                                                 |
| --------------- | -------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| Lint            | `oxlint --type-aware --type-check` + `oxlint-tsgolint`   | `oxlint src`, **broken**               | Adopt (P0-1)                                                                           |
| Format          | `oxfmt`                                                  | `prettier`                             | Switch to `oxfmt`                                                                      |
| Typecheck       | `"typecheck": "tsc --noEmit"`                            | absent                                 | Add                                                                                    |
| TypeScript      | `^7.0.2`                                                 | `^5.9.2`                               | Align when convenient                                                                  |
| Package manager | `pnpm` + `devEngines`                                    | bun, two lockfiles                     | Project uses bun deliberately — **pin it** in `devEngines`, delete `package-lock.json` |
| Node engines    | `"node": ">=25"` / `24.x`                                | absent                                 | Add                                                                                    |
| Component idiom | compound `*.parts.tsx`, `cva`/`cx`, spread-through props | monolithic `UiX` with fixed prop lists | See below                                                                              |
| Styling         | CSS classes + `cva` variants                             | SCSS modules                           | Fine to keep; SCSS is a reasonable local choice                                        |
| Changesets      | `@changesets/cli` in publishable pkgs                    | absent                                 | Not needed (app, not library)                                                          |

**On the component idiom** — the house pattern (`neko-web-v2/packages/ui/tabs.parts.tsx`) exports each
part and forwards everything via `omit(props, "class")`. reline-web's `UiTabs` instead takes
`tabs: UiTabDef[]` + `content: (value) => JSX.Element`, which:

- renders **only the active panel** (`tabs.tsx:38` passes `props.value` to a single `Tabs.Content`), so
  Kobalte's own panel management is bypassed and the ARIA relationship between triggers and panels is
  incomplete;
- can't express per-tab attributes (disabled, icons, badges) without growing `UiTabDef`;
- forces the `content` callback indirection seen at `config-panel.tsx:539-554`.

This is worth aligning **if** these wrappers are ever extracted for reuse. For a single-app codebase the
current shape is defensible — but `UiSelect`/`UiCombobox` both carry a ~25-line copy of the _same_
outside-click workaround (`select.tsx:36-61`, `combobox.tsx:64-89`, character-identical). That duplication
should be a shared `createDismissOnOutside(open, setOpen, els)` primitive regardless of which idiom wins.

---

## 6 · What is genuinely good

Worth stating plainly, since a review this long can read as uniformly negative:

- **The convert layer** (`lib/convert/`) is the strongest part of the codebase — symmetric
  pure↔stack mappers, valibot-validated, legacy-format tolerant, and covered by the only test file
  (8 passing round-trip cases).
- **Comments explain _why_**, consistently, and several document real Solid-2-rc workarounds
  (`reducer.ts:21-23` on `<For>` remount-on-reference-swap dropping input focus; `combobox.tsx:42-43`
  on the Input dropping `onKeyDown`) that would look arbitrary without them. This is the habit that
  makes the codebase reviewable at all — keep it.
- **The reducer as a single write path** with persistence observed externally is the right architecture;
  the `id` overload is a flaw _within_ a sound design, not a broken design.
- **`flipReorder`** is careful work — measuring relative to the scroll container and using WAAPI over
  transition juggling are both correct, non-obvious choices, and the comment says why.
- **Solid 2 idiom is mostly right**: split effects with cleanup returns, `omit` over `splitProps`,
  `<Ctx value>` over `.Provider`, object-form `class`, `@solidjs/web` imports. No `createResource`,
  no `batch`, no `Index`. The migration was done properly.
- **`Document.tsx`** correctly reasons about the client/SSR shell boundary, and the note on skipping a
  web manifest to avoid Chrome's icon fetches is the kind of detail that usually goes undocumented.

---

## 7 · Suggested order of work

| #   | Item                                               | Effort | Payoff                                                  |
| --- | -------------------------------------------------- | ------ | ------------------------------------------------------- |
| 1   | **P0-1** fix lint, run it, triage backlog          | S      | Unblocks everything; finds more than this review        |
| 2   | **P0-2** preset model URLs                         | S      | Stops shipping wrong weights                            |
| 3   | **P0-3** colour tokens                             | S      | Fixes success-reads-as-error + hover/selected collision |
| 4   | **P1-3** debounce both persistence effects         | S      | Removes per-frame / per-keystroke blocking writes       |
| 5   | **P2-1** delete dead registry data, unify defaults | S      | −180 lines, closes a drift bug class                    |
| 6   | **P1-1** `createProjection` selector               | M      | 50 recomputes → 1                                       |
| 7   | **§4** `uid`-as-identity refactor                  | L      | Resolves P1-2, P1-4, P2-4 together                      |
| 8   | **P2-5/P2-6** PathRow race, NumberRow drafts       | M      | Input correctness                                       |
| 9   | **P1-5/P1-6** ws client timers and watchdog        | M      | Removes a stuck-UI state                                |
| 10  | **§5** oxfmt / typecheck / engines / lockfile      | S      | Aligns with house style                                 |

Items 1–5 are each under an hour and carry most of the user-visible value. Item 7 is the one structural
change worth planning deliberately.

---

## Appendix A — hypotheses that measurement disproved

Recorded because both would have produced _wrong_ recommendations, and because the distinction changes
the fix:

**A1 · "Passing `selectedId` as a value instead of an accessor causes component bodies to re-run."**
`node-card.tsx:249` passes `selectedId={props.selectedId()}` while `NodesList` passes the accessor, which
looks like a classic Solid reactivity bug. **It is not.** Probe result:

```
VALUE:    mountEvals=50  afterSelect=100  delta=50
ACCESSOR: mountEvals=50  afterSelect=100  delta=50
```

Identical. The Solid 2 compiler wraps JSX attribute expressions in getters, so `props.selectedId` is lazy
either way, and component bodies run exactly once (confirmed separately: 5 bodies, 5 runs, no re-runs on
selection). The inconsistency between the two call sites is a **readability** issue, not a performance one —
and the real cost is the per-row comparison, which is why P1-1 recommends `createProjection` rather than
"pass an accessor". Had I not measured, I would have prescribed a no-op fix.

**A2 · "`ADD`'s index write (`state[state.length] = payload`) fails to notify subscribers."**
The comment at `reducer.ts:46-47` implies the array-replacement path was broken in the rc. Probe confirms
the **current** code works correctly (length subscribers fire, `[1, 2]`). The comment describes a real
past problem; the workaround is sound and should stay, but it is worth re-testing against each rc bump
rather than treated as permanent.

---

_Findings marked **Measured** were produced by probe tests run against `@solidjs/signals` 2.0.0-rc.6 in
this repo and deleted afterward. **Verified** findings were confirmed by reading the code plus a
grep/tsc/vitest/oxlint run. **Observed** findings are judgement calls about naming and consistency._
