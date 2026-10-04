# Reline Configurator

Single-page React app for building Reline manga upscaling pipeline configs (JSON). Deployed to GitHub Pages.

## Stack

- **Runtime**: Bun (not npm/pnpm). Lockfile: `bun.lock`
- **Framework**: React 19 + Vite 6 + TypeScript 5.7
- **Styling**: Tailwind CSS 4 (`@tailwindcss/vite` plugin, no `tailwind.config.*`); CSS variables in `app/index.css` under `@theme`
- **UI**: shadcn/ui (base-nova style) in `app/components/ui/`; icons from `@tabler/icons-react`
- **Lint/Format**: Biome 1.9 — semicolons `asNeeded` (codebase uses **no semicolons**), trailing commas `all`, line width 150, indent 2 spaces
- **i18n**: `i18next` + `react-i18next` + `i18next-browser-languagedetector`; locales at `app/i18n/locales/{en,ru}.ts` (HMR-aware, no page reload)

## Path aliases

```
~/* → ./app/*
@/* → ./app/*
```

Use `~/` consistently (existing code uses both; `~` is the convention).

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Start Vite dev server |
| `bun run build` | **Typecheck then build**: `tsc -b && vite build`. Output to `dist/` |
| `bun run typecheck` | `tsc` only |
| `bun run lint` | `biome lint --write --unsafe .` — ⚠️ Never run on whole project; only on specific new/changed files |
| `bun run format` | `biome format --write --no-errors-on-unmatched .` |
| `bun tauri dev` | Start Vite + Tauri webview (dev mode) |
| `bun tauri build` | Production Tauri build |
| `cargo check` | **Verify Rust compilation** (run in `src-tauri/`). Must pass with zero errors before committing Tauri changes |

### Verification pipeline (when changing Tauri/Rust files)

After editing `src-tauri/src/lib.rs` or other Rust files, run:

```powershell
# 1. Check Rust compilation
Set-Location -LiteralPath "src-tauri"; if ($?) { cargo check }; Set-Location -LiteralPath ".."

# 2. Check frontend typecheck
bun run typecheck
```

Both must pass with zero errors. Warnings are acceptable but should be reviewed.

**Safety**: Never run `bun run lint` (or `biome lint --write --unsafe .`) on the whole project. The `--unsafe` flag applies auto-fixes like `useImportType` project-wide, which turns runtime `import * as React` into `import type * as React` incorrectly. Always target specific files:
```powershell
.\node_modules\.bin\biome lint --write --unsafe "path/to/file.tsx"
```

**CI** (`.github/workflows/pages.yaml`): `bun install --frozen-lockfile && bun run build` with `GITHUB_PAGES=true`.

## Architecture

**Entrypoint**: `index.html:12` → `app/main.tsx` → `app/App.tsx`

**State**: `useReducer` + `NodesContext` / `NodesDispatchContext` (contexts). Nodes persist to `localStorage` under key `"nodes-data"`.

**Pipeline node types** (in order): `folder_reader → upscale → sharp → screentone → resize → level → cvt_color → folder_writer`. Defined in `app/types/enums.ts:NodeType`; options in `app/constants.ts:DEFAULT_NODE_OPTIONS`.

**Drag-and-drop**: `@dnd-kit/react` for node reorder. Uses `PointerSensor` with 200ms delay on mobile.

**Config format**: Converts `StackNode[]` to/from `PureNode[]` via `app/lib/convert/` before JSON serialization. Backward-compat migrations in `app/lib/config-migration.ts`.

**Models**: Fetched from `https://mdb.yor.ovh/v1/files` (fallback list in `app/constants.ts:MODELS`). `staleTime: Infinity`.

**Docs**: MDX files imported via `@mdx-js/rollup` in `app/docs/` with per-node and per-section articles in en/ru.

## Conventions

- No semicolons in JS/TS. Run `bun run lint` and `bun run format` before committing.
- Use `cn()` from `~/lib/utils` for class merging.
- Use `import type` for type-only imports.
- Tailwind CSS 4: use `@theme` + CSS variables; avoid legacy `@apply` patterns where possible.

## Tauri V2

The app has a desktop variant via Tauri V2. The Rust backend at `src-tauri/src/lib.rs` manages a Python backend (uvicorn server) for Reline image processing.

### Detection

`useIsTauri()` hook at `app/hooks/useIsTauri.ts` checks for `__TAURI_INTERNALS__` or `__TAURI__` on `window`. `__TAURI_INTERNALS__` is always injected by Tauri webview; `__TAURI__` appears when `@tauri-apps/api` is initialized.

### Frontend deps

- `@tauri-apps/cli` (devDeps) — CLI for `bun tauri dev` / `bun tauri build`
- `@tauri-apps/api` (deps) — `invoke()` from `@tauri-apps/api/core`, `listen()`/`UnlistenFn` from `@tauri-apps/api/event`

### Backend commands (`src-tauri/src/lib.rs`)

| Command | Signature | Description |
|---|---|---|
| `initialize` | `async fn initialize(app, backend_state, port_state, port: Option<u16>) -> Result<(), String>` | Checks deps installed, starts uvicorn. Emits `backend-status` events throughout. |
| `stop_backend` | `fn stop_backend(app, backend_state, port_state) -> Result<(), String>` | Kills backend process, emits `Stage::Idle`. |
| `get_backend_port` | `fn get_backend_port(state) -> Option<u16>` | Returns current backend port or `null`. |
| `check_port_free` | `fn check_port_free(port: u16) -> bool` | Returns whether the port can be bound. |
| `open_folder` | `fn open_folder(path: String) -> Result<(), String>` | Opens a folder in the OS file manager. |
| `open_url` | `fn open_url(url: String) -> Result<(), String>` | Opens a URL in the default browser. |
| `check_deps` | `fn check_deps() -> DepsStatus` | Checks uv, repo, venv, uvicorn presence + NVIDIA GPU. Does NOT launch Python. |
| `check_versions` | `async fn check_versions(app, uv_path: Option<PathBuf>) -> DepsVersions` | Runs `uv pip freeze`, parses torch/resselt/reline versions. Torch CUDA = `+cu` in version string. |
| `install_deps` | `async fn install_deps(app, full: bool) -> Result<(), String>` | **full=true**: uv → clone → venv → torch(Win) → pip install. **full=false**: only `pip install -e .`. Streams stdout/stderr via `backend-log`. |
| `get_logs` | `fn get_logs(state) -> Vec<LogEntry>` | Returns collected session logs. |
| `clear_logs` | `fn clear_logs(state)` | Clears log buffer. |
| `get_window_mode` | `fn get_window_mode() -> bool` | Whether the custom (frameless) titlebar is used on this platform. |

### Events

**`backend-status`** — emitted by all stages of `initialize` and `install_deps`. Payload:

```ts
interface BackendStatusEvent {
  stage: "idle" | "cloning" | "creating_venv" | "installing" | "starting" | "running" | "error"
  message: string
  port: number | null
}
```

Processing stages (backend is busy): `cloning`, `creating_venv`, `installing`, `starting`, `running`. Idle stages: `idle`, `error`.

**`backend-log`** — emitted for every stdout/stderr line from shell commands. Payload:

```ts
interface LogEntry {
  timestamp: string  // UTC "HH:MM:SS"
  level: string      // "stdout" | "stderr" | "info" | "error"
  message: string
}
```

### State (Rust)

- `BackendProcess(Mutex<Option<BackendHandle>>)` — holds the spawned uvicorn child plus its `stopping` flag
- `BackendPort(Mutex<Option<u16>>)` — holds allocated port (8000–9000 range)
- `BackendLogs(Mutex<Vec<LogEntry>>)` — session log buffer
- On `Destroyed` window event: backend is killed automatically

### Tauri plugins

`tauri_plugin_shell`, `tauri_plugin_fs`, `tauri_plugin_opener`, `tauri_plugin_dialog`, `tauri_plugin_notification` in `Cargo.toml`.

### Config

`src-tauri/tauri.conf.json` — version 3.0.0, window 1200x700 (min 1200x700, `visible: false`, shown in `setup`), title "Reline Configurator", `frontendDist: "../dist"`, dev URL `http://localhost:5173`.

### Data dir

`app_data_dir()` resolves to `dirs::data_local_dir()/reline-configurator` (on Windows `%LOCALAPPDATA%\reline-configurator`), falling back to the executable directory if that path is missing or not writable. The Python workspace (`reline_ws`), the bundled `uv`, and the logs (`uv_debug.log`, `reline_ws.log`) all live there.

### Frontend UI (Tauri mode)

**`FooterBar`** component at `app/components/layout/footer-bar.tsx` conditionally renders:

- **Non-Tauri**: regular footer (Colab, GitHub, Discord links)
- **Tauri**: `h-15` bar with Run/Stop buttons on the left:
  - **Run** (`IconPlayerPlay`): green border/bg → amber (`IconLoader2 animate-spin`) during processing, calls `invoke("initialize")`
  - **Stop** (`IconPlayerStop`): gray/disabled when idle → red when processing, calls `invoke("stop_backend")`

### Dev

```bash
bun tauri dev    # starts Vite + Tauri webview
bun tauri build  # production Tauri build
```

Vite config (`vite.config.ts:9-10`) detects Tauri at build time via `TAURI_ENV_PLATFORM` / `TAURI_DEV_HOST` env vars for base path and dev server config.

## Notes

- No test setup exists (no test dependencies in `package.json`).
- `.gitignore` excludes `.ai/`, `.claude/`, and `tsconfig.tsbuildinfo`.
- No README or contributing guide.
- Favicon: `/favicon.png`.
