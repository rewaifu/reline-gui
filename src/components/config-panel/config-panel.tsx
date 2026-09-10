import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  untrack,
  Match,
  Show,
  Switch,
  useContext,
} from "solid-js";
import { marked } from "marked";
import { parse, render } from "sugar-high/core";
import * as json from "sugar-high/lang/json";
import { NodesContext, NodesDispatchContext } from "~/context/contexts";
import { NodesActionType } from "~/types/actions";
import {
  allPresets,
  getPresetByName,
  saveUserPreset,
  deletePreset,
  hiddenStockCount,
  restoreStockPresets,
} from "~/lib/presets";
import { nodesToString, stringToNodes } from "~/lib/config";
import { modelUrl, preloadModelNames, resolveModelName } from "~/lib/model-db";
import { convertToPure, type LegacyMigration } from "~/lib/convert";
import { NodeType } from "~/types/enums";
import { NODE_DEFS } from "~/components/nodes/registry";
import {
  locale,
  message,
  render as localText,
  t,
  type LocalText,
} from "~/lib/i18n";
import { Icon, UiTabs, UiSelect } from "~/components/ui";
import {
  createRunClient,
  endpoint,
  setEndpoint,
  type RunMessage,
} from "~/lib/run-client";
import {
  describeStage,
  formatDownloadProgress,
  formatElapsed,
  formatEta,
  formatProgressCounters,
  formatRate,
} from "~/lib/run-format";
import styles from "./config-panel.module.scss";

const TABS = [
  { value: "instructions", labelKey: "panel.tabs.instructions" },
  { value: "code", labelKey: "panel.tabs.code" },
  { value: "presets", labelKey: "panel.tabs.presets" },
  { value: "run", labelKey: "panel.tabs.run" },
] as const;

export interface ConfigPanelProps {
  selectedUid: () => string | null;
}
/** Per-node instructions, authored as Markdown in src/instructions/<locale>/.
 * Keyed "locale/type", so the rendered document follows the switcher. */
const INSTRUCTION_DOCS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob("../../instructions/*/*.md", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ).map(([path, src]) => [
    path
      .match(/instructions\/([^/]+)\/([^/]+)\.md$/)!
      .slice(1)
      .join("/"),
    src as string,
  ]),
);

const InstructionsTab: Component<ConfigPanelProps> = (props) => {
  const nodes = useContext(NodesContext);
  const def = () => {
    const node = nodes.find((n) => n.uid === props.selectedUid());
    return node ? NODE_DEFS[node.type] : undefined;
  };
  const docHtml = createMemo(() => {
    const d = def();
    const md = d ? INSTRUCTION_DOCS[`${locale()}/${d.type}`] : undefined;
    return md ? marked.parse(md, { async: false }) : "";
  });

  return (
    <div class={styles.instructions}>
      <Show
        when={def()}
        fallback={<p class={styles.empty}>{t("panel.instructions.empty")}</p>}
      >
        {
          // Instructions are trusted local files authored by the user, so
          // rendering the compiled HTML directly is safe here. The callback
          // binding is dropped on purpose: the body needs only docHtml().
          // oxlint-disable-next-line solid/no-innerhtml -- trusted local content
          <div class={styles.doc} innerHTML={docHtml()} />
        }
      </Show>
    </div>
  );
};

/** Pipeline JSON, tokenized by sugar-high's JSON grammar (lang entry only —
 * the full registry would pull in every language for one format). */
const HighlightedJson: Component<{ code: string }> = (props) => {
  const html = createMemo(() => render(parse(props.code, json)));
  return (
    <pre class={styles.codeView}>
      {
        // sugar-high escapes the source (`<` → `&lt;`) and the input is our
        // own pretty-printed config, so the generated markup is safe here.
        // oxlint-disable-next-line solid/no-innerhtml -- escaped local output
        <code innerHTML={html()} />
      }
    </pre>
  );
};

/** Editable code view: a transparent textarea stacked on the highlight layer,
 * so the caret and selection live in the field while the glyphs come from
 * sugar-high. Both layers share one grid cell and one scroll container. */
const CodeEditor: Component<{
  value: string;
  onInput: (value: string) => void;
}> = (props) => {
  let area!: HTMLTextAreaElement;
  createEffect(
    () => props.value,
    () => {
      // grow the field to its content (0 first: a shrinking box would only
      // report its own height back) so the shell scrolls, not the field
      area.style.height = "0px";
      area.style.height = `${area.scrollHeight}px`;
    },
  );
  return (
    <div class={styles.codeStack}>
      <HighlightedJson code={props.value} />
      <textarea
        ref={area}
        class={styles.codeInput}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        spellcheck={false}
        aria-label={t("panel.code.json")}
      />
    </div>
  );
};

/** What a legacy import rewrote, for the status line (nothing when the config
 * was already current).
 *
 * The details are joined into the message when the import finishes: they
 * describe one past action, and the line they appear on is replaced by the
 * next action — unlike a journal line, which stays readable for the session. */
const legacyNotice = (
  migration: LegacyMigration | undefined,
): LocalText | undefined => {
  if (migration === undefined) return undefined;
  const parts: string[] = [];
  if (migration.models.length > 0) {
    parts.push(
      t("panel.legacy.models", {
        names: migration.models.map((m) => `${m.to}`).join(", "),
      }),
    );
  }
  if (migration.downloads.length > 0) {
    const urls = migration.downloads.filter((n) => modelUrl(n) !== undefined);
    const missing = migration.downloads.filter(
      (n) => modelUrl(n) === undefined,
    );
    if (urls.length > 0) {
      parts.push(t("panel.legacy.urls", { names: urls.join(", ") }));
    }
    if (missing.length > 0) {
      parts.push(t("panel.legacy.missing", { names: missing.join(", ") }));
    }
  }
  if (migration.unarchives.length > 0) {
    parts.push(
      t("panel.legacy.unarchives", {
        names: migration.unarchives.join(", "),
      }),
    );
  }
  if (parts.length === 0) return undefined;
  return message("panel.legacy.notice", { details: parts.join("; ") });
};

const CodeTab: Component = () => {
  const nodes = useContext(NodesContext);
  const dispatch = useContext(NodesDispatchContext);
  // one-time snapshot: the select below reads allPresets() reactively
  const [presetName, setPresetName] = createSignal(
    untrack(() => allPresets()[0]?.name ?? ""),
  );
  const [copied, setCopied] = createSignal(false);
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  // parts, not a string: the line re-renders in the current language, and an
  // import can produce two of them (what happened — what it rewrote)
  const [status, setStatus] = createSignal<{
    ok: boolean;
    parts: LocalText[];
  }>();

  const code = createMemo(() => nodesToString([...nodes]));

  const applyPreset = (name: string) => {
    const preset = getPresetByName(name);
    if (!preset) return;
    setPresetName(name);
    dispatch({
      type: NodesActionType.IMPORT,
      payload: preset.nodes.map((n) => structuredClone(n)),
    });
    setStatus({
      ok: true,
      parts: [message("panel.status.presetApplied", { name: preset.name })],
    });
  };

  /** Parses and dispatches a config, migrating the pre-preprocess format on
   * the way: a legacy one names its models by path and keeps the download /
   * unarchive nodes inside the pipeline, so their links have to come from the
   * model database — wait for it before parsing (warm from the startup
   * preload, and instant while the localStorage copy is fresh). */
  const importConfig = async (
    text: string,
    success: (migration: LegacyMigration | undefined) => LocalText[],
  ) => {
    try {
      await preloadModelNames();
      let migration: LegacyMigration | undefined;
      const parsed = stringToNodes(text, {
        urlOf: modelUrl,
        onLegacy: (m) => {
          migration = m;
        },
      });
      dispatch({ type: NodesActionType.IMPORT, payload: parsed });
      setEditing(false);
      setStatus({ ok: true, parts: success(migration) });
    } catch (err) {
      setStatus({
        ok: false,
        parts: [
          message("panel.status.invalidJson", {
            detail: err instanceof Error ? err.message : String(err),
          }),
        ],
      });
    }
  };

  const startEdit = () => {
    setDraft(code());
    setStatus(undefined);
    setEditing(true);
  };

  /** The status line: what happened, then what the import rewrote. */
  const statusParts = (
    head: LocalText,
    migration: LegacyMigration | undefined,
  ): LocalText[] => {
    const notice = legacyNotice(migration);
    return notice === undefined ? [head] : [head, notice];
  };

  const applyDraft = () =>
    importConfig(draft(), (migration) =>
      statusParts("panel.status.applied", migration),
    );

  const importFile = async (file: File) =>
    importConfig(await file.text(), (migration) =>
      statusParts(
        message("panel.status.imported", { name: file.name }),
        migration,
      ),
    );

  const copyCode = () => {
    navigator.clipboard.writeText(code()).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      (err) => console.error("Copy failed", err),
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
          <span class={styles.presetLabel}>{t("panel.presets.label")}</span>
          <UiSelect
            class={styles.presetTrigger}
            ariaLabel={t("panel.presets.aria")}
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
                  aria-label={t("panel.code.apply")}
                  title={t("panel.code.apply")}
                  onClick={applyDraft}
                >
                  <Icon name="check" size={16} />
                </button>
                <button
                  type="button"
                  class={styles.action}
                  aria-label={t("panel.code.cancel")}
                  title={t("panel.code.cancel")}
                  onClick={() => setEditing(false)}
                >
                  <Icon name="x" size={16} />
                </button>
              </>
            }
          >
            <button
              type="button"
              class={styles.action}
              aria-label={t("panel.code.edit")}
              title={t("panel.code.edit")}
              onClick={startEdit}
            >
              <Icon name="pencil" size={16} />
            </button>
          </Show>
          <label
            class={styles.action}
            aria-label={t("panel.code.import")}
            title={t("panel.code.importTitle")}
          >
            <Icon name="upload" size={16} />
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
            aria-label={t("panel.code.copy")}
            title={t("panel.code.copy")}
            onClick={copyCode}
          >
            {copied() ? (
              <Icon name="check" size={16} />
            ) : (
              <Icon name="copy" size={16} />
            )}
          </button>
          <button
            type="button"
            class={styles.action}
            aria-label={t("panel.code.download")}
            title={t("panel.code.downloadTitle")}
            onClick={downloadCode}
          >
            <Icon name="download" size={16} />
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
        <div class={styles.codeShell}>
          <CodeEditor value={draft()} onInput={setDraft} />
        </div>
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
            {s().parts.map(localText).join(" — ")}
          </p>
        )}
      </Show>
    </div>
  );
};

const PresetsTab: Component = () => {
  const nodes = useContext(NodesContext);
  const dispatch = useContext(NodesDispatchContext);
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
          placeholder={t("panel.presets.namePlaceholder")}
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
          {t("panel.presets.save")}
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
              <span class={styles.presetDesc}>
                {localText(preset.description)}
              </span>
            </button>
            <button
              type="button"
              class={styles.presetDelete}
              aria-label={t("panel.presets.removeNamed", {
                name: preset.name,
              })}
              title={t(
                preset.id.startsWith("user-")
                  ? "panel.presets.remove"
                  : "panel.presets.hide",
              )}
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
          {t("panel.presets.restore", { count: hiddenStockCount() })}
        </button>
      </Show>
    </div>
  );
};

/** Journal line colour per kind. Module styles are static, so the lookup is
 * built once instead of being recomputed for every line. */
const LOG_LINE_CLASS: Record<RunMessage["kind"], string> = {
  info: styles.runLogInfo,
  ok: styles.runLogOk,
  error: styles.runLogError,
};

const RunTab: Component = () => {
  const nodes = useContext(NodesContext);
  const dispatch = useContext(NodesDispatchContext);
  const run = createRunClient();
  let logEl: HTMLDivElement | undefined;

  // The journal is the only record a failed run leaves behind, so it follows
  // its newest line: a line the user has to scroll for is a line they miss.
  createEffect(
    () => run.messages().length,
    () => {
      if (logEl === undefined) return;
      logEl.scrollTop = logEl.scrollHeight;
    },
  );

  const connect = async () => {
    const url = endpoint().trim();
    if (!url) return;
    // the setter persists it: the address outlives a reload, and `ls` dials
    // the same one, so the field is the single place an address is entered
    setEndpoint(url);
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
              uid: node.uid,
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
    run.start(url, convertToPure(list));
  };

  const phase = run.phase;
  const busy = () =>
    phase() === "connecting" || phase() === "running" || phase() === "stopping";
  const stageText = () => {
    const current = run.progress();
    return current === undefined ? t("run.preparing") : describeStage(current);
  };
  // a bar with neither a percent nor a stage yet is "working, size unknown":
  // a strip frozen at 0 % would read as "stuck"
  const indeterminate = () => {
    const current = run.progress();
    return (
      current === undefined ||
      (current.percent === 0 && current.stage === undefined)
    );
  };
  const chips = () => {
    const current = run.progress();
    if (current === undefined) return [];
    // a download counts bytes, every other stage counts items
    const counters =
      formatDownloadProgress(current) ?? formatProgressCounters(current);
    return [
      counters,
      formatRate(current),
      formatEta(current),
      formatElapsed(current),
    ].filter((chip): chip is string => chip !== undefined);
  };

  return (
    <div class={styles.run}>
      <label class={styles.runLabel} for="run-endpoint">
        {t("panel.run.address")}
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
          {phase() === "connecting"
            ? t("panel.run.connecting")
            : t("panel.run.start")}
        </button>
        <button
          type="button"
          class={styles.runBtn}
          disabled={!busy() || phase() === "stopping"}
          onClick={() => run.stop()}
        >
          {t("panel.run.stop")}
        </button>
      </div>
      <Show when={busy()}>
        <div
          class={{
            [styles.runBar]: true,
            [styles.runBarIndeterminate]: indeterminate(),
          }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={run.progress()?.percent ?? 0}
          aria-valuetext={stageText()}
        >
          <div
            class={styles.runBarFill}
            style={{ width: `${run.progress()?.percent ?? 0}%` }}
          />
        </div>
        <p class={styles.runStage}>{stageText()}</p>
        <Show when={chips().length > 0}>
          <div class={styles.runMetrics}>
            <For each={chips()}>
              {(chip) => <span class={styles.runChip}>{chip}</span>}
            </For>
          </div>
        </Show>
      </Show>
      <Show when={run.messages().length > 0}>
        <div class={styles.runLogBox}>
          <div class={styles.runLogHead}>
            <span class={styles.runLogTitle}>{t("panel.run.journal")}</span>
            <button
              type="button"
              class={styles.runLogClear}
              aria-label={t("panel.run.clearJournal")}
              onClick={() => run.clearMessages()}
            >
              <Icon name="x" size={13} />
            </button>
          </div>
          <div class={styles.runLog} ref={logEl}>
            <For each={run.messages()}>
              {(message) => (
                <p class={[styles.runLogLine, LOG_LINE_CLASS[message.kind]]}>
                  <span class={styles.runLogTime}>
                    {new Date(message.at).toLocaleTimeString(
                      locale() === "ru" ? "ru-RU" : "en-GB",
                    )}
                  </span>
                  {localText(message.text)}
                </p>
              )}
            </For>
          </div>
        </div>
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
            <InstructionsTab selectedUid={props.selectedUid} />
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
