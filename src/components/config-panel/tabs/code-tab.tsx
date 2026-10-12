import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  untrack,
  Show,
  useContext,
} from "solid-js";
import { parse, render } from "sugar-high/core";
import * as json from "sugar-high/lang/json";
import { AnalysisContext, NodesDispatchContext } from "~/context/contexts";
import { NodesActionType } from "~/types/actions";
import { allPresets, getPresetByName } from "~/lib/presets";
import { stringToNodes } from "~/lib/config";
import { modelUrl, preloadModelNames } from "~/lib/model-db";
import type { LegacyMigration } from "~/lib/convert";
import { message, render as localText, t, type LocalText } from "~/lib/i18n";
import { Icon, UiSelect } from "~/components/ui";
import styles from "../config-panel.module.scss";

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

export const CodeTab: Component = () => {
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

  // the app-wide analysis: the same text the run sends, and the report of a
  // node that could not be built — it must show next to the code too
  const analysis = useContext(AnalysisContext);
  const code = () => analysis().text;
  const convertFailures = () =>
    analysis().diagnostics.filter((d) => d.code === "node.convert");

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
      <Show when={convertFailures().length > 0}>
        <p class={[styles.status, styles.err]}>
          {t("panel.code.issues", {
            nodes: convertFailures()
              .map((d) => localText(d.message))
              .join("; "),
          })}
        </p>
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
