import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createStore,
  untrack,
} from "solid-js";
import {
  definePlugin,
  type PluginApiFor,
  type PureConfig,
  type MessageParams,
} from "@reline/plugin-sdk";

/**
 * Config sequence — build a pipeline out of several configs and run them one
 * after another.
 *
 * The runner takes one config per run. A "pipeline of configs" is therefore a
 * list of steps, each a complete config, started in order: step N+1 begins when
 * step N has ended. A step that fails stops the sequence (or is skipped, by
 * choice); a step the user stops ends it. Steps are kept in the browser, so the
 * list survives a reload, and each one is validated with the editor's own rules
 * right before it runs.
 */

type StepStatus = "pending" | "running" | "ok" | "failed" | "cancelled";

interface Step {
  id: string;
  name: string;
  enabled: boolean;
  /** The config as the runner receives it — portable, no editor state. */
  config: PureConfig;
  status: StepStatus;
  /** Why a step failed, or what the runner said. */
  note: string;
}

interface State {
  steps: Step[];
  /** Stop at the first failed step instead of carrying on with the rest. */
  stopOnError: boolean;
}

const STORAGE_KEY = "state";

const WORDS = {
  en: {
    tab: "Sequence",
    empty: "No steps yet. Add the current stack, or import config files.",
    addCurrent: "Add current stack",
    importFiles: "Import configs…",
    stopOnError: "Stop at the first failure",
    run: "Run sequence",
    stop: "Stop",
    stepOf: "Step {n} of {total}: {name}",
    nodes: "{count} nodes",
    errors: "{count} errors",
    enable: "Include {name} in the sequence",
    name: "Step name",
    up: "Move up",
    down: "Move down",
    load: "Load into the editor",
    update: "Replace with the current stack",
    remove: "Remove step",
    status: {
      pending: "waiting",
      running: "running",
      ok: "done",
      failed: "failed",
      cancelled: "stopped",
    },
    invalid: "The config is invalid: {detail}",
    badFile: "{file}: {detail}",
    stepName: "Step {n}",
    badge: "Sequence {done}/{total}",
    done: "Sequence finished: {ok} of {total} steps done",
    nothing: "Nothing to run: no step is switched on",
  },
  ru: {
    tab: "Последовательность",
    empty:
      "Шагов пока нет. Добавьте текущий стек или импортируйте файлы конфигов.",
    addCurrent: "Добавить текущий стек",
    importFiles: "Импорт конфигов…",
    stopOnError: "Остановиться на первой ошибке",
    run: "Запустить по очереди",
    stop: "Стоп",
    stepOf: "Шаг {n} из {total}: {name}",
    nodes: "нод: {count}",
    errors: "ошибок: {count}",
    enable: "Включить {name} в последовательность",
    name: "Название шага",
    up: "Выше",
    down: "Ниже",
    load: "Загрузить в редактор",
    update: "Заменить текущим стеком",
    remove: "Убрать шаг",
    status: {
      pending: "ждёт",
      running: "идёт",
      ok: "готово",
      failed: "ошибка",
      cancelled: "остановлен",
    },
    invalid: "Конфиг некорректен: {detail}",
    badFile: "{file}: {detail}",
    stepName: "Шаг {n}",
    badge: "Последовательность {done}/{total}",
    done: "Последовательность завершена: готово шагов — {ok} из {total}",
    nothing: "Запускать нечего: ни один шаг не включён",
  },
} as const;

/** Flat `a.b` keys for the plugin dictionary. */
const flatten = (
  words: Record<string, unknown>,
  prefix = "",
): Record<string, string> =>
  Object.entries(words).reduce<Record<string, string>>((all, [key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof value === "string"
      ? { ...all, [path]: value }
      : { ...all, ...flatten(value as Record<string, unknown>, path) };
  }, {});

const STYLES = `
.rsq { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.rsq-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.rsq-list { display: flex; flex-direction: column; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.rsq-step { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; padding: var(--space-2) var(--space-3); background: var(--color-surface-strong); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.rsq-step[data-status="running"] { border-color: var(--color-primary); }
.rsq-step[data-status="ok"] { border-color: color-mix(in srgb, var(--color-success) 55%, var(--color-border)); }
.rsq-step[data-status="failed"] { border-color: var(--color-danger); }
.rsq-step[data-off] { opacity: .55; }
.rsq-head, .rsq-tools { display: flex; align-items: center; min-width: 0; gap: var(--space-2); }
.rsq-head > .rsq-name { flex: 1; }
.rsq-tools { flex-wrap: wrap; row-gap: var(--space-2); }
.rsq-buttons { display: flex; flex: none; gap: var(--space-1); margin-left: auto; }
.rsq-status { flex: none; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.rsq-step[data-status="failed"] .rsq-status { color: var(--color-danger); }
.rsq-meta { flex: none; margin: 0; white-space: nowrap; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.rsq-meta[data-bad] { color: var(--color-danger); }
.rsq-note, .rsq-err { margin: 0; color: var(--color-danger); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.rsq-muted, .rsq-progress { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.rsq-badge { display: inline-flex; align-items: center; height: 24px; padding: 0 var(--space-2); color: var(--color-text); font-size: var(--font-size-sm); background: color-mix(in srgb, var(--color-primary) 40%, transparent); border-radius: var(--radius-sm); white-space: nowrap; }
`;

export default definePlugin<
  "ui" | "storage" | "run" | "config" | "store" | "i18n"
>({
  activate(
    api: PluginApiFor<"ui" | "storage" | "run" | "config" | "store" | "i18n">,
  ) {
    api.i18n.add("en", flatten(WORDS.en));
    api.i18n.add("ru", flatten(WORDS.ru));
    api.ui.styles(STYLES);
    // the editor's own controls: the panel looks like the tabs around it
    const { Button, IconButton, Switch, Input, Icon } = api.ui.kit;
    const t = (key: string, params?: MessageParams) => api.i18n.t(key, params);

    // ── state ────────────────────────────────────────────────────────────
    const restore = (): State => {
      const saved = api.storage.getJson(STORAGE_KEY) as
        | Partial<State>
        | undefined;
      const steps = Array.isArray(saved?.steps) ? saved.steps : [];
      return {
        // a run that was cut off by a reload is not still running
        steps: steps.map((step) => ({
          ...step,
          status: step.status === "running" ? "pending" : step.status,
        })),
        stopOnError: saved?.stopOnError ?? true,
      };
    };
    const [state, setStore] = createStore<State>(restore());
    const [problem, setProblem] = createSignal("");
    const [running, setRunning] = createSignal(false);
    const [position, setPosition] = createSignal({ at: 0, total: 0, name: "" });
    let stopRequested = false;

    // Saving follows a counter, not the store: an effect that serialises the
    // whole store subscribes to every field of every step (a few thousand
    // sources for a long sequence) and re-runs on any of them.
    const [revision, setRevision] = createSignal(0);
    const setState = (change: (draft: State) => void) => {
      setStore(change);
      setRevision((n) => n + 1);
    };
    createEffect(revision, () => {
      api.storage.set(
        STORAGE_KEY,
        untrack(() => JSON.stringify(state)),
      );
    });

    const stepAt = (id: string) => state.steps.findIndex((s) => s.id === id);
    const patchStep = (id: string, changes: Partial<Step>) =>
      setState((draft) => {
        const at = draft.steps.findIndex((s) => s.id === id);
        if (at !== -1) Object.assign(draft.steps[at], changes);
      });

    const newId = () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    /** A plain copy: the stack is a store of proxies, and what is kept must
     * survive being edited away. */
    const snapshot = (): PureConfig =>
      JSON.parse(
        JSON.stringify(api.config.toPure(api.store.nodes())),
      ) as PureConfig;

    const addStep = (name: string, config: PureConfig) =>
      setState((draft) => {
        draft.steps.push({
          id: newId(),
          name,
          enabled: true,
          config,
          status: "pending",
          note: "",
        });
      });

    const addCurrent = () => {
      setProblem("");
      addStep(t("stepName", { n: state.steps.length + 1 }), snapshot());
    };

    const importFiles = async (files: FileList) => {
      setProblem("");
      for (const file of Array.from(files)) {
        try {
          // read through the editor's own import, so a legacy or hand-written
          // config becomes the same canonical form a stack exports to
          const nodes = api.config.parse(await file.text());
          const config = JSON.parse(
            JSON.stringify(api.config.toPure(nodes)),
          ) as PureConfig;
          addStep(file.name.replace(/\.json$/i, ""), config);
        } catch (error) {
          setProblem(
            t("badFile", {
              file: file.name,
              detail: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }
    };

    const move = (id: string, by: -1 | 1) =>
      setState((draft) => {
        const at = draft.steps.findIndex((s) => s.id === id);
        const to = at + by;
        if (at === -1 || to < 0 || to >= draft.steps.length) return;
        const [step] = draft.steps.splice(at, 1);
        draft.steps.splice(to, 0, step);
      });

    const remove = (id: string) =>
      setState((draft) => {
        draft.steps = draft.steps.filter((s) => s.id !== id);
      });

    const loadIntoEditor = (id: string) => {
      const step = state.steps[stepAt(id)];
      if (step === undefined) return;
      setProblem("");
      try {
        api.config.replaceStack(api.config.fromPure(step.config));
      } catch (error) {
        setProblem(
          t("invalid", {
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    };

    // ── running ──────────────────────────────────────────────────────────
    const runSequence = async () => {
      if (running()) return;
      const queue = state.steps.filter((s) => s.enabled).map((s) => s.id);
      if (queue.length === 0) {
        setProblem(t("nothing"));
        return;
      }
      setProblem("");
      stopRequested = false;
      setRunning(true);
      for (const id of queue) patchStep(id, { status: "pending", note: "" });
      let finished = 0;
      try {
        for (const [index, id] of queue.entries()) {
          if (stopRequested) break;
          const step = state.steps[stepAt(id)];
          if (step === undefined) continue;
          setPosition({ at: index + 1, total: queue.length, name: step.name });
          patchStep(id, { status: "running" });

          // the editor's own checks, on the step's config, right before it runs
          let config: PureConfig;
          try {
            const checked = api.config.analyze(
              api.config.fromPure(step.config),
            );
            if (checked.errors > 0) {
              const first = checked.diagnostics.find(
                (d) => d.severity === "error",
              );
              throw new Error(
                first === undefined
                  ? "invalid"
                  : t("errors", { count: checked.errors }),
              );
            }
            config = checked.config;
          } catch (error) {
            patchStep(id, {
              status: "failed",
              note: t("invalid", {
                detail: error instanceof Error ? error.message : String(error),
              }),
            });
            if (state.stopOnError) break;
            continue;
          }

          try {
            const outcome = await api.run.start(config);
            if (outcome.cancelled) {
              patchStep(id, { status: "cancelled" });
              break;
            }
            if (outcome.ok) {
              finished += 1;
              patchStep(id, { status: "ok" });
            } else {
              patchStep(id, {
                status: "failed",
                note: api.i18n.t("status.failed"),
              });
              if (state.stopOnError) break;
            }
          } catch (error) {
            // typically: a run from the Run tab is already going
            patchStep(id, {
              status: "failed",
              note: error instanceof Error ? error.message : String(error),
            });
            break;
          }
        }
      } finally {
        setRunning(false);
        setProblem(t("done", { ok: finished, total: queue.length }));
      }
    };

    const stop = () => {
      stopRequested = true;
      api.run.stop();
    };

    // ── view ─────────────────────────────────────────────────────────────
    const summarize = (config: PureConfig) => {
      try {
        const analysis = api.config.analyze(api.config.fromPure(config));
        return { nodes: config.nodes.length, errors: analysis.errors };
      } catch {
        return { nodes: config.nodes.length, errors: 1 };
      }
    };

    const StepRow = (props: { step: Step; index: number }) => {
      const summary = createMemo(() => summarize(props.step.config));
      return (
        <li
          class="rsq-step"
          data-status={props.step.status}
          data-off={props.step.enabled ? undefined : ""}
        >
          <div class="rsq-head">
            <Switch
              checked={props.step.enabled}
              onChange={(enabled) => patchStep(props.step.id, { enabled })}
              ariaLabel={t("enable", { name: props.step.name })}
            />
            <Input
              class="rsq-name"
              value={props.step.name}
              aria-label={t("name")}
              disabled={running()}
              onInput={(e) =>
                patchStep(props.step.id, { name: e.currentTarget.value })
              }
            />
            <span class="rsq-status">{t(`status.${props.step.status}`)}</span>
          </div>
          <div class="rsq-tools">
            <p
              class="rsq-meta"
              data-bad={summary().errors > 0 ? "" : undefined}
            >
              {t("nodes", { count: summary().nodes })}
              <Show when={summary().errors > 0}>
                {" · "}
                {t("errors", { count: summary().errors })}
              </Show>
            </p>
            <div class="rsq-buttons">
              <IconButton
                icon="arrow-up"
                label={t("up")}
                disabled={running() || props.index === 0}
                onClick={() => move(props.step.id, -1)}
              />
              <IconButton
                icon="arrow-down"
                label={t("down")}
                disabled={running() || props.index === state.steps.length - 1}
                onClick={() => move(props.step.id, 1)}
              />
              <IconButton
                icon="pencil"
                label={t("load")}
                disabled={running()}
                onClick={() => loadIntoEditor(props.step.id)}
              />
              <IconButton
                icon="refresh"
                label={t("update")}
                disabled={running()}
                onClick={() => patchStep(props.step.id, { config: snapshot() })}
              />
              <IconButton
                icon="trash"
                label={t("remove")}
                disabled={running()}
                onClick={() => remove(props.step.id)}
              />
            </div>
          </div>
          <Show when={props.step.note !== ""}>
            <p class="rsq-note">{props.step.note}</p>
          </Show>
        </li>
      );
    };

    const SequenceTab = () => {
      let picker: HTMLInputElement | undefined;
      return (
        <div class="rsq">
          <div class="rsq-actions">
            <Button disabled={running()} onClick={addCurrent}>
              <Icon name="plus" size={14} />
              {t("addCurrent")}
            </Button>
            <Button disabled={running()} onClick={() => picker?.click()}>
              <Icon name="upload" size={14} />
              {t("importFiles")}
            </Button>
            <input
              ref={picker}
              type="file"
              accept=".json,application/json"
              multiple
              hidden
              onInput={(e) => {
                const files = e.currentTarget.files;
                if (files !== null && files.length > 0) void importFiles(files);
                e.currentTarget.value = "";
              }}
            />
          </div>

          <Show
            when={state.steps.length > 0}
            fallback={<p class="rsq-muted">{t("empty")}</p>}
          >
            <ul class="rsq-list">
              <For each={state.steps}>
                {(step, index) => <StepRow step={step} index={index()} />}
              </For>
            </ul>
          </Show>

          <Switch
            checked={state.stopOnError}
            onChange={(stopOnError) =>
              setState((draft) => {
                draft.stopOnError = stopOnError;
              })
            }
            label={t("stopOnError")}
          />

          <div class="rsq-actions">
            <Button
              variant="primary"
              disabled={running() || state.steps.length === 0}
              onClick={() => void runSequence()}
            >
              <Icon name="play" size={14} />
              {t("run")}
            </Button>
            <Button disabled={!running()} onClick={stop}>
              <Icon name="stop" size={14} />
              {t("stop")}
            </Button>
          </div>

          <Show when={running()}>
            <p class="rsq-progress" role="status">
              {t("stepOf", {
                n: position().at,
                total: position().total,
                name: position().name,
              })}
            </p>
          </Show>
          <Show when={problem() !== ""}>
            <p class="rsq-err" role="alert">
              {problem()}
            </p>
          </Show>
        </div>
      );
    };

    api.ui.panelTab({
      id: "sequence",
      label: api.i18n.text("tab"),
      Component: SequenceTab,
      order: 45,
    });

    // a badge in the top bar while a sequence runs, so it is visible from any tab
    api.ui.slot("topbar", () => (
      <Show when={running()}>
        <span class="rsq-badge" role="status">
          {t("badge", { done: position().at, total: position().total })}
        </span>
      </Show>
    ));
  },
});
