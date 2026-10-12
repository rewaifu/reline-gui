import { type Component, createEffect, For, Show, useContext } from "solid-js";
import {
  AnalysisContext,
  NodesContext,
  NodesDispatchContext,
} from "~/context/contexts";
import { NodesActionType } from "~/types/actions";
import { analyze } from "~/lib/config";
import { pipeline } from "~/lib/pipeline";
import { DiagnosticList } from "~/components/diagnostics/diagnostic-list";
import { nodeLabel, nodeRegistry } from "~/lib/nodes";
import { locale, message, render as localText, t } from "~/lib/i18n";
import { Icon } from "~/components/ui";
import { runClient, type RunMessage } from "~/lib/run-client";
import { endpoint, setEndpoint } from "~/lib/ws";
import {
  describeStage,
  formatDownloadProgress,
  formatPhase,
  formatElapsed,
  formatEta,
  formatProgressCounters,
  formatRate,
} from "~/lib/run-format";
import styles from "../config-panel.module.scss";

/** Journal line colour per kind. Module styles are static, so the lookup is
 * built once instead of being recomputed for every line. */
const LOG_LINE_CLASS: Record<RunMessage["kind"], string> = {
  info: styles.runLogInfo,
  ok: styles.runLogOk,
  error: styles.runLogError,
};

export const RunTab: Component = () => {
  const nodes = useContext(NodesContext);
  const dispatch = useContext(NodesDispatchContext);
  // the client belongs to the module, not to this component: the tab unmounts
  // whenever the user looks at another one, and the socket is the only thing
  // that closes on the way out — the run itself survives detached on the
  // server (WS_API.md) and the client re-attaches by run_id
  const run = runClient;
  const analysis = useContext(AnalysisContext);
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
    // each node type may adjust its node before the run (the upscale forces a
    // non-own model onto a real mdb entry, so a run can never see an invalid
    // model); the store is updated too, so the corrected value stays visible
    const list = [...nodes];
    for (const [index, node] of list.entries()) {
      const prepare = nodeRegistry.get(node.type)?.prepare;
      if (prepare === undefined) continue;
      try {
        const patch = await prepare(node);
        if (patch === undefined) continue;
        dispatch({
          type: NodesActionType.CHANGE,
          payload: { uid: node.uid, options: patch },
        });
        list[index] = { ...node, options: { ...node.options, ...patch } };
      } catch (error) {
        // a failed preparation (mdb unreachable) must not block the run: it
        // goes out with what is typed, and the journal says what was skipped
        run.report(
          "info",
          message("run.prepareFailed", {
            node: node.name ?? nodeLabel(node.type),
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
    // the stack as it stands *now* (the preparation above may have changed
    // it): an error stops the run here, each reason in the journal — a throw
    // in this async handler used to vanish entirely
    const checked = analyze(list);
    if (checked.errors > 0) {
      run.report(
        "error",
        message("run.refused", { count: String(checked.errors) }),
      );
      for (const found of checked.diagnostics)
        if (found.severity === "error") run.report("error", found.message);
      return;
    }
    // last word to plugins: they may rewrite the config on its way out
    run.start(url, await pipeline.applyAsync(checked.config, list));
  };

  const phase = run.phase;
  const busy = () =>
    phase() === "connecting" ||
    phase() === "running" ||
    phase() === "recovering" ||
    phase() === "stopping";
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
      // the phase first: the bar restarts when it changes, and the chip is
      // what says why (preprocessors done, images begin)
      formatPhase(current),
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
          {phase() === "connecting" || phase() === "recovering"
            ? t("panel.run.connecting")
            : t("panel.run.start")}
        </button>
        <button
          type="button"
          class={styles.runBtn}
          disabled={busy() || !endpoint().trim()}
          onClick={() => run.recover()}
        >
          {t("panel.run.resume")}
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
      <Show when={analysis().diagnostics.length > 0}>
        <div class={styles.runFindings}>
          <p class={styles.runFindingsTitle}>
            {t("diag.title")}
            <Show when={analysis().errors > 0}>
              {" · "}
              {t("diag.errors", { count: analysis().errors })}
            </Show>
            <Show when={analysis().warnings > 0}>
              {" · "}
              {t("diag.warnings", { count: analysis().warnings })}
            </Show>
          </p>
          <DiagnosticList
            items={analysis().diagnostics}
            nameOf={(uid) => {
              const node = nodes.find((n) => n.uid === uid);
              return node && (node.name ?? nodeLabel(node.type));
            }}
          />
        </div>
      </Show>
      <Show when={run.runId() !== undefined}>
        <p class={styles.runId}>
          {t("panel.run.runId", { run: run.runId() ?? "" })}
        </p>
      </Show>
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
