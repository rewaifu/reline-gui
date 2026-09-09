import {
  type Component,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import { marked } from "marked";
import { useNodes, useNodesDispatch } from "~/context/contexts";
import { NodesActionType } from "~/types/actions";
import type { StackNode } from "~/types/node";
import {
  allPresets,
  getPresetByName,
  saveUserPreset,
  deletePreset,
  hiddenStockCount,
  restoreStockPresets,
} from "~/lib/presets";
import { nodesToString, stringToNodes } from "~/lib/config";
import { resolveModelName } from "~/lib/model-db";
import { NodeType } from "~/types/enums";
import { NODE_DEFS } from "~/components/nodes/registry";
import { Icon, UiTabs, UiSelect } from "~/components/ui";
import {
  createRunClient,
  resolveEndpoint,
  RUN_ENDPOINT_KEY,
} from "~/lib/run-client";
import styles from "./config-panel.module.scss";
const TABS = [
  { value: "instructions", label: "Инструкции" },
  { value: "code", label: "Код" },
  { value: "presets", label: "Пресеты" },
  { value: "run", label: "Запуск" },
] as const;

export interface ConfigPanelProps {
  selectedId: () => number | null;
}

/** Per-node instructions, authored as Markdown (`.mdx`) in src/instructions. */
const INSTRUCTION_DOCS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob("../../instructions/*.mdx", {
      query: "?raw",
      import: "default",
      eager: true,
    })
  ).map(([path, src]) => [path.match(/([^/]+)\.mdx$/)![1], src as string])
);

const InstructionsTab: Component<ConfigPanelProps> = (props) => {
  const nodes = useNodes();
  const def = () => {
    const node = nodes.find((n) => n.id === props.selectedId());
    return node ? NODE_DEFS[node.type] : undefined;
  };
  const docHtml = createMemo(() => {
    const d = def();
    const md = d ? INSTRUCTION_DOCS[d.type] : undefined;
    return md ? marked.parse(md, { async: false }) : "";
  });

  return (
    <div class={styles.instructions}>
      <Show
        when={def()}
        fallback={
          <p class={styles.empty}>
            Выберите ноду, чтобы увидеть её инструкцию. Ноды обрабатываются
            сверху вниз: чтение → обработка → запись.
          </p>
        }
      >
        {(def) => (
          // Instructions are trusted local files authored by the user, so
          // rendering the compiled HTML directly is safe here.
          <div class={styles.doc} innerHTML={docHtml()} />
        )}
      </Show>
    </div>
  );
};

type JsonPart = { text: string; cls?: string };

const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;

/** Split pretty-printed JSON into colored parts: keys, strings, numbers, keywords. */
const highlightJson = (src: string): JsonPart[] => {
  const parts: JsonPart[] = [];
  let last = 0;
  for (const m of src.matchAll(JSON_TOKEN)) {
    const start = m.index;
    if (start > last) parts.push({ text: src.slice(last, start) });
    if (m[1]) {
      // a string followed by ":" is an object key
      parts.push({ text: m[1], cls: m[2] ? styles.tokKey : styles.tokStr });
      if (m[2]) parts.push({ text: m[2] });
    } else {
      const isNumber = /^-?\d/.test(m[0]);
      parts.push({
        text: m[0],
        cls: isNumber ? styles.tokNum : styles.tokBool,
      });
    }
    last = start + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last) });
  return parts;
};

const HighlightedJson: Component<{ code: string }> = (props) => (
  <pre class={styles.codeView}>
    <For each={createMemo(() => highlightJson(props.code))()}>
      {(part) =>
        part.cls ? <span class={part.cls}>{part.text}</span> : <>{part.text}</>
      }
    </For>
  </pre>
);

const CodeTab: Component = () => {
  const nodes = useNodes();
  const dispatch = useNodesDispatch();
  const [presetName, setPresetName] = createSignal(allPresets()[0]?.name ?? "");
  const [copied, setCopied] = createSignal(false);
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [status, setStatus] = createSignal<{ ok: boolean; text: string }>();

  const code = createMemo(() => nodesToString([...nodes]));

  const applyPreset = (name: string) => {
    const preset = getPresetByName(name);
    if (!preset) return;
    setPresetName(name);
    dispatch({
      type: NodesActionType.IMPORT,
      payload: preset.nodes.map((n) => structuredClone(n)),
    });
    setStatus({ ok: true, text: `Пресет «${preset.name}» применён` });
  };

  const startEdit = () => {
    setDraft(code());
    setStatus(undefined);
    setEditing(true);
  };

  const applyDraft = () => {
    try {
      dispatch({
        type: NodesActionType.IMPORT,
        payload: stringToNodes(draft()),
      });
      setEditing(false);
      setStatus({ ok: true, text: "Конфиг применён" });
    } catch (err) {
      setStatus({
        ok: false,
        text: `Некорректный JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const importFile = async (file: File) => {
    try {
      dispatch({
        type: NodesActionType.IMPORT,
        payload: stringToNodes(await file.text()),
      });
      setStatus({ ok: true, text: `Импортирован файл «${file.name}»` });
    } catch (err) {
      setStatus({
        ok: false,
        text: `Импорт не удался: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code()).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      (err) => console.error("Copy failed", err)
    );
  };

  const downloadCode = () => {
    const blob = new Blob([code()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class={styles.code}>
      <div class={styles.codeHeader}>
        <div class={styles.presetSelect}>
          <span class={styles.presetLabel}>Presets:</span>
          <UiSelect
            class={styles.presetTrigger}
            ariaLabel="Preset"
            value={presetName()}
            items={allPresets().map((p) => p.name)}
            onChange={applyPreset}
          />
        </div>
        <div class={styles.actions}>
          <Show
            when={!editing()}
            fallback={
              <>
                <button
                  type="button"
                  class={styles.action}
                  aria-label="Apply edited code"
                  onClick={applyDraft}
                >
                  ✓
                </button>
                <button
                  type="button"
                  class={styles.action}
                  aria-label="Cancel editing"
                  onClick={() => setEditing(false)}
                >
                  ✕
                </button>
              </>
            }
          >
            <button
              type="button"
              class={styles.action}
              aria-label="Edit code"
              onClick={startEdit}
            >
              ✎
            </button>
          </Show>
          <label class={styles.action} aria-label="Import config file">
            ⤓
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onInput={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void importFile(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <button
            type="button"
            class={styles.action}
            aria-label="Copy code"
            onClick={copyCode}
          >
            {copied() ? (
              <Icon name="check" size={14} />
            ) : (
              <Icon name="copy" size={14} />
            )}
          </button>
          <button
            type="button"
            class={styles.action}
            aria-label="Download config"
            onClick={downloadCode}
          >
            <Icon name="arrow-down" size={14} />
          </button>
        </div>
      </div>
      <Show
        when={editing()}
        fallback={
          <div class={styles.codeShell}>
            <HighlightedJson code={code()} />
          </div>
        }
      >
        <textarea
          class={styles.codeEdit}
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          spellcheck={false}
          aria-label="Config JSON"
        />
      </Show>
      <Show when={status()}>
        {(s) => (
          <p
            class={{
              [styles.status]: true,
              [styles.ok]: s().ok,
              [styles.err]: !s().ok,
            }}
          >
            {s().text}
          </p>
        )}
      </Show>
    </div>
  );
};

const PresetsTab: Component = () => {
  const nodes = useNodes();
  const dispatch = useNodesDispatch();
  const [presetId, setPresetId] = createSignal<string>();
  const [name, setName] = createSignal("");

  const applyPreset = (id: string) => {
    const preset = allPresets().find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    dispatch({
      type: NodesActionType.IMPORT,
      payload: preset.nodes.map((n) => ({ ...n })),
    });
  };

  const saveCurrent = () => {
    const trimmed = name().trim();
    if (!trimmed) return;
    const preset = saveUserPreset(trimmed, [...nodes]);
    setName("");
    setPresetId(preset.id);
  };

  return (
    <div class={styles.presets}>
      <div class={styles.presetSave}>
        <input
          class={styles.presetNameInput}
          placeholder="Название пресета"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
        />
        <button
          type="button"
          class={styles.presetSaveBtn}
          disabled={!name().trim()}
          onClick={saveCurrent}
        >
          Сохранить
        </button>
      </div>
      <For each={allPresets()}>
        {(preset) => (
          <div
            class={{
              [styles.preset]: true,
              [styles.active]: presetId() === preset.id,
            }}
          >
            <button
              type="button"
              class={styles.presetApply}
              onClick={() => applyPreset(preset.id)}
            >
              <span class={styles.presetName}>{preset.name}</span>
              <span class={styles.presetDesc}>{preset.description}</span>
            </button>
            <button
              type="button"
              class={styles.presetDelete}
              aria-label={`Удалить пресет ${preset.name}`}
              title={
                preset.id.startsWith("user-")
                  ? "Удалить"
                  : "Скрыть стоковый пресет"
              }
              onClick={() => deletePreset(preset.id)}
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        )}
      </For>
      <Show when={hiddenStockCount() > 0}>
        <button
          type="button"
          class={styles.presetRestore}
          onClick={restoreStockPresets}
        >
          Вернуть стоковые ({hiddenStockCount()})
        </button>
      </Show>
    </div>
  );
};

const RunTab: Component = () => {
  const nodes = useNodes();
  const dispatch = useNodesDispatch();
  const run = createRunClient();
  const [endpoint, setEndpoint] = createSignal(resolveEndpoint());

  const connect = async () => {
    const url = endpoint().trim();
    if (!url) return;
    localStorage.setItem(RUN_ENDPOINT_KEY, url);
    // force every non-own upscale model onto a real mdb entry (exact or the
    // closest match) so a run can never see an invalid model; the store is
    // updated too, so the corrected name stays visible
    const list = [...nodes];
    for (const [index, node] of list.entries()) {
      if (node.type !== NodeType.UPSCALE) continue;
      const opts = node.options;
      if (!("is_own_model" in opts) || !("model" in opts)) continue;
      if (opts.is_own_model !== false) continue;
      try {
        const hit = await resolveModelName(opts.model);
        if (hit === undefined) continue;
        if (hit.name !== opts.model || opts.model_url !== hit.url) {
          dispatch({
            type: NodesActionType.CHANGE,
            payload: {
              id: node.id,
              options: { model: hit.name, model_url: hit.url },
            },
          });
          list[index] = {
            ...node,
            options: { ...opts, model: hit.name, model_url: hit.url },
          };
        }
      } catch {
        // mdb unreachable: run with what is typed rather than blocking
      }
    }
    run.start(url, nodesToString(list));
  };

  const phase = run.phase;
  const busy = () =>
    phase() === "connecting" || phase() === "running" || phase() === "stopping";

  return (
    <div class={styles.run}>
      <label class={styles.runLabel} for="run-endpoint">
        Адрес запуска
      </label>
      <input
        id="run-endpoint"
        class={styles.runInput}
        value={endpoint()}
        onInput={(e) => setEndpoint(e.currentTarget.value)}
        spellcheck={false}
      />
      <div class={styles.runControls}>
        <button
          type="button"
          class={styles.runBtn}
          disabled={busy() || !endpoint().trim()}
          onClick={connect}
        >
          {phase() === "connecting" ? "Подключение…" : "▶ Запустить"}
        </button>
        <button
          type="button"
          class={styles.runBtn}
          disabled={!busy() || phase() === "stopping"}
          onClick={() => run.stop()}
        >
          ■ Стоп
        </button>
      </div>
      <Show when={busy()}>
        <div
          class={styles.runBar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={run.progress()?.percent ?? 0}
        >
          <div
            class={styles.runBarFill}
            style={{ width: `${run.progress()?.percent ?? 0}%` }}
          />
        </div>
        <Show when={run.progress()?.step}>
          {(step) => (
            <p class={styles.runHint}>
              {run.progress()?.percent}% — {step()}
            </p>
          )}
        </Show>
      </Show>
      <p class={styles.runHint}>
        Конвейер ({nodes.length} нод) уходит по WebSocket (MessagePack). Адрес
        можно задать параметром <code>?api=ws://…</code> в URL страницы.
      </p>
      <Show when={run.notice()}>
        {(n) => (
          <p
            class={{
              [styles.status]: true,
              [styles.ok]: n().ok,
              [styles.err]: !n().ok,
            }}
          >
            {n().text}
          </p>
        )}
      </Show>
    </div>
  );
};

export const ConfigPanel: Component<ConfigPanelProps> = (props) => {
  const [tab, setTab] = createSignal<string>("code");

  return (
    <UiTabs
      value={tab()}
      onChange={setTab}
      tabs={TABS}
      class={styles.panel}
      content={(value) => (
        <Switch>
          <Match when={value === "instructions"}>
            <InstructionsTab selectedId={props.selectedId} />
          </Match>
          <Match when={value === "code"}>
            <CodeTab />
          </Match>
          <Match when={value === "presets"}>
            <PresetsTab />
          </Match>
          <Match when={value === "run"}>
            <RunTab />
          </Match>
        </Switch>
      )}
    />
  );
};
