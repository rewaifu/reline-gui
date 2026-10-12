import { createSignal, type Accessor } from "solid-js";
import { message, raw, type LocalText } from "~/lib/i18n";
import { storage } from "~/lib/storage";
import type { PureConfig } from "~/types/node";
import { STOP_WATCHDOG_MS } from "~/lib/ws/protocol";
import {
  endpoint,
  openConnection,
  type Connection,
  type Frame,
} from "~/lib/ws";

export type RunPhase =
  | "idle"
  | "connecting"
  | "running"
  | "stopping"
  | "recovering";

/** Stages the runner reports in `progress` (WS_API.md). A newer backend may
 * invent a stage; those frames are decoded with the stage dropped rather than
 * putting an unknown word in the UI. */
export type RunStage = "download" | "unarchive" | "read" | "process" | "write";

/** The phase a `progress` frame belongs to. Each phase owns the bar from 0 %:
 * the preprocessors fill it, then the image loop starts its own scale, so a
 * long download cannot eat the bar the images are drawn on. */
export type ProgressPhase = "preprocess" | "process";

/** One `progress` frame, with the wire's snake_case keys decoded to camelCase.
 * Every field except `percent` is optional: `total: 0` means "size unknown",
 * `eta`/`rate` appear only after the first measurement. */
export interface RunProgress {
  percent: number;
  phase?: ProgressPhase;
  stage?: RunStage;
  label?: string;
  node?: string;
  done?: number;
  total?: number;
  elapsed?: number;
  rate?: number;
  eta?: number;
  bytesDone?: number;
  bytesTotal?: number;
}

/** One line of the run journal. A failed run reports through several frames
 * (`error` and then a failed `done`, WS_API.md), so the UI keeps a log instead
 * of a single status slot — and the log outlives the run itself. */
export interface RunMessage {
  at: number;
  kind: "info" | "ok" | "error";
  /** A key, not formatted text: the journal outlives the run, so its lines
   * follow the language the user is reading right now. */
  text: LocalText;
}

/** Newest journal lines kept; older ones are dropped so a long session (or a
 * stream of errors) cannot grow the array without bound. */
const MAX_MESSAGES = 50;

/** `done.output` is a whole run log; the journal shows its head only. */
const MAX_OUTPUT = 400;

export const RUN_ID_KEY = "reline-web:runId";

/** The run we follow across reconnects and reloads: written on `accepted`,
 * refreshed by every snapshot (`status`/`attached`), cleared on `done`.
 * A tab that slept through the whole run still knows which `run_id` to ask
 * about instead of repeating `start` blindly. */
const storedRunId = (): string | undefined => storage.get(RUN_ID_KEY);
const rememberRunId = (runId: string | undefined) => {
  // storage unavailable: the id lives for this page load
  if (runId === undefined) storage.remove(RUN_ID_KEY);
  else storage.set(RUN_ID_KEY, runId);
};

/** How a run ended. `ok` is a run that completed; a run the user stopped is
 * `cancelled` and not `ok`. */
export interface RunOutcome {
  ok: boolean;
  cancelled: boolean;
  /** The journal line the end left behind. */
  text: LocalText;
}

export interface RunClient {
  readonly phase: Accessor<RunPhase>;
  readonly progress: Accessor<RunProgress | undefined>;
  readonly messages: Accessor<RunMessage[]>;
  /** The run we watch, if any — shown in the panel so a resume is expected. */
  readonly runId: Accessor<string | undefined>;
  /** Begin a run. `false` when one is already going or there is no address. */
  start(url: string, pipeline: PureConfig): boolean;
  stop(): void;
  /** Ask the server what our run is doing and re-attach when it is alive. */
  recover(url?: string, id?: string): void;
  clearMessages(): void;
  /** Told when a run ends, however it ends (done, failed, stopped, given up on).
   * What a sequence of runs waits for. */
  onFinish(listener: (outcome: RunOutcome) => void): () => void;
  /** Put a line in the journal without a run behind it — a run that could not
   * even start still has to leave a reason where the user looks. */
  report(kind: RunMessage["kind"], text: LocalText): void;
}

/** Render an unknown server payload (MessagePack `error`/`message`) for a
 * user-facing message without falling back to `[object Object]`. Server text
 * stays verbatim — only the "nothing at all" case has a translation. */
const describePayload = (value: unknown): LocalText => {
  if (typeof value === "string") return raw(value);
  if (value === undefined || value === null) return "run.unknown";
  const json = JSON.stringify(value);
  return json === undefined ? "run.unknown" : raw(json);
};

/** The stages this UI can name (WS_API.md). Frames naming anything else are
 * shown without a stage rather than with a word nobody has seen before. */
const STAGES: Record<string, RunStage | undefined> = {
  download: "download",
  unarchive: "unarchive",
  read: "read",
  process: "process",
  write: "write",
};

/** Same for the phase: an unknown name keeps the percent and the stage, and
 * only the phase chip goes missing. */
const PHASES: Record<string, ProgressPhase | undefined> = {
  preprocess: "preprocess",
  process: "process",
};

/** A number, or nothing: msgpack decides the wire type, and a frame carrying
 * a string where a counter belongs must not become "NaN" in the UI. */
const readNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** Non-empty text, or nothing — the wire omits a field rather than sending
 * `""`, so an empty string is a missing value, not a value. */
const readText = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/** One `progress` payload → the shape the UI formats. Unknown stages and
 * malformed fields are dropped; a frame never throws. */
const readProgress = (d: Record<string, unknown>): RunProgress => {
  const percent = readNumber(d.percent);
  return {
    // percent drives the bar and `aria-valuenow`: a frame outside 0..100 is
    // clamped instead of trusted
    percent: percent === undefined ? 0 : Math.min(100, Math.max(0, percent)),
    phase: typeof d.phase === "string" ? PHASES[d.phase] : undefined,
    stage: typeof d.stage === "string" ? STAGES[d.stage] : undefined,
    label: readText(d.label),
    node: readText(d.node),
    done: readNumber(d.done),
    total: readNumber(d.total),
    elapsed: readNumber(d.elapsed),
    rate: readNumber(d.rate),
    eta: readNumber(d.eta),
    bytesDone: readNumber(d.bytes_done),
    bytesTotal: readNumber(d.bytes_total),
  };
};

/** The journal line for a `done` payload. Cancellation is tested first: a run
 * stopped by the user reports `ok: false, cancelled: true` (WS_API.md), and
 * "stopped" is not an error. */
const doneMessage = (
  d: Record<string, unknown>,
): Omit<RunMessage, "at"> & { cancelled?: boolean } => {
  if (d.cancelled === true)
    return { kind: "ok", text: "run.stopped", cancelled: true };
  if (d.ok === true) {
    const output = readText(d.output);
    return {
      kind: "ok",
      text:
        output === undefined
          ? "run.done"
          : message("run.doneOutput", { output: output.slice(0, MAX_OUTPUT) }),
    };
  }
  return {
    kind: "error",
    text: message("run.error", { detail: describePayload(d.error) }),
  };
};

/** How many times a lost connection is retried before the run is given up on.
 * Four retries after a drop: 1 s + 2 s + 4 s + 8 s of trying. */
const RECONNECT_ATTEMPTS = 4;
/** Backoff between retries. Long enough for a tunnel or a proxy to come back,
 * short enough that the user watches it happen instead of reopening the tab. */
const RECONNECT_BASE_MS = 1000;

export const createRunClient = (): RunClient => {
  let conn: Connection | undefined;
  let stopWatchdog: number | undefined;
  let retryTimer: number | undefined;
  /** Bumped by every dial and every `finish`: callbacks of a socket (or a
   * retry) that we have moved on from compare their own ticket and go quiet. */
  let ticket = 0;
  /** Retries spent on the current drop; reset by a successful `onopen`. */
  let attempt = 0;
  /** What the open socket is for: a fresh `start`, or watching a known run. */
  let watchMode: "start" | "recover" = "start";
  /** The run as the user asked for it, so a reconnect can resume it. */
  let runUrl = "";
  let runPipeline: PureConfig | undefined;
  const [phase, setPhase] = createSignal<RunPhase>("idle");
  const [progress, setProgress] = createSignal<RunProgress>();
  const [messages, setMessages] = createSignal<RunMessage[]>([]);
  const finishListeners = new Set<(outcome: RunOutcome) => void>();
  /** The run we watch. Survives a dropped socket; cleared when the run ends. */
  const [runId, setRunId] = createSignal<string | undefined>(
    typeof window === "undefined" ? undefined : storedRunId(),
  );

  const rememberRun = (id: string | undefined) => {
    setRunId(id);
    rememberRunId(id);
  };

  /** Append one journal line, dropping the oldest past the cap. Only `start`
   * ever removes lines: everything else that happens to a run — an `error`
   * frame, a dead socket, an unconfirmed stop — has to stay readable after the
   * run goes idle, which is when the user looks. */
  const log = (kind: RunMessage["kind"], text: LocalText) => {
    setMessages((prev) =>
      [...prev, { at: Date.now(), kind, text }].slice(-MAX_MESSAGES),
    );
  };

  const closeSocket = () => {
    conn?.close();
    conn = undefined;
  };

  const send = (m: string, d: Record<string, unknown> = {}) => {
    conn?.send(m, d);
  };

  /** End the run: drop the socket, the watchdog and any pending retry, and
   * leave one journal line that outlives the busy phase. */
  const finish = (
    kind: RunMessage["kind"],
    text: LocalText,
    cancelled = false,
  ) => {
    // a retry in flight (or a socket callback on its way) must not resurrect
    // the run we are closing here
    ticket += 1;
    window.clearTimeout(retryTimer);
    runPipeline = undefined;
    attempt = 0;
    closeSocket();
    window.clearTimeout(stopWatchdog);
    setPhase("idle");
    rememberRun(undefined);
    log(kind, text);
    const outcome: RunOutcome = {
      ok: kind === "ok" && !cancelled,
      cancelled,
      text,
    };
    for (const listener of finishListeners) {
      try {
        listener(outcome);
      } catch {
        // a listener's bug must not undo the end of the run
      }
    }
  };

  /** A snapshot (`status` / `attached`) places the bar at once: the progress
   * stream resumes from wherever the run is, not from zero. `done` inside a
   * snapshot (a run that finished while we were away) ends the watch. */
  const applySnapshot = (d: Record<string, unknown>): boolean => {
    const status = readText(d.status);
    if (status === "idle") return false;
    if (
      d.progress !== undefined &&
      typeof d.progress === "object" &&
      d.progress !== null
    )
      setProgress(readProgress(d.progress as Record<string, unknown>));
    if (status === "done" || status === "failed" || status === "cancelled") {
      const result = (d.result ?? {}) as Record<string, unknown>;
      const line = doneMessage({
        ok: status === "done" ? true : result.ok,
        cancelled: status === "cancelled" ? true : result.cancelled,
        error: result.error,
        output: result.output,
      } as Record<string, unknown>);
      finish(line.kind, line.text, line.cancelled);
      return true;
    }
    return true;
  };

  /** Dial the server and ask where the run stands. The job survives a dead
   * socket on the server (WS_API.md), so a reconnect is `status` → `attach`,
   * never a second `start`: repeating the config would write the outputs
   * twice and earn `worker busy` anyway.
   *
   * Bounded: after `RECONNECT_ATTEMPTS` the run ends with one honest journal
   * line instead of a retry loop nobody can see the end of. */
  const reconnect = (reason?: LocalText) => {
    if (runId() === undefined && runPipeline === undefined) return;
    if (reason !== undefined) log("info", reason);
    if (attempt >= RECONNECT_ATTEMPTS) {
      finish("error", message("run.reconnectFailed", { url: runUrl }));
      return;
    }
    attempt += 1;
    setPhase(runId() !== undefined ? "recovering" : "connecting");
    log(
      "info",
      message("run.reconnecting", {
        attempt: String(attempt),
        total: String(RECONNECT_ATTEMPTS),
      }),
    );
    window.clearTimeout(retryTimer);
    // 1 s, 2 s, 4 s, 8 s
    retryTimer = window.setTimeout(
      connect,
      RECONNECT_BASE_MS * 2 ** (attempt - 1),
    );
  };

  /** What the fresh socket asks for once it opens: a new run starts it, a
   * known run checks its status first (the server may have finished it while
   * we were away — then there is nothing to attach to). */
  const hello = () => {
    if (watchMode === "start") {
      send("start", { pipeline: runPipeline });
      return;
    }
    const id = runId();
    send("status", id === undefined ? {} : { run_id: id });
  };

  /** One frame from the runner (heartbeats never get this far: the connection
   * answers them itself). */
  const handleFrame = (msg: Frame) => {
    const d = (msg.d ?? {}) as Record<string, unknown>;
    switch (msg.m) {
      case "accepted": {
        const id = readText(d.run_id);
        rememberRun(id);
        runPipeline = undefined;
        setPhase("running");
        log("info", "run.accepted");
        break;
      }
      case "status": {
        const named = readText(d.run_id);
        if (named !== undefined) rememberRun(named);
        const status = readText(d.status);
        if (status === "idle") {
          finish("info", "run.nothingToRecover");
          return;
        }
        if (
          status === "done" ||
          status === "failed" ||
          status === "cancelled"
        ) {
          // the run finished while we were away: the snapshot already
          // carried its outcome, there is nothing to attach to
          applySnapshot(d);
          return;
        }
        applySnapshot(d);
        const id = runId();
        log("info", "run.recovered");
        setPhase("running");
        send("attach", id === undefined ? {} : { run_id: id });
        break;
      }
      case "attached": {
        const named = readText(d.run_id);
        if (named !== undefined) rememberRun(named);
        applySnapshot(d);
        runPipeline = undefined;
        log("info", "run.reattached");
        setPhase("running");
        break;
      }
      case "progress":
        if (readText(d.run_id) !== undefined && runId() === undefined)
          rememberRun(readText(d.run_id));
        setProgress(readProgress(d));
        break;
      case "done": {
        const line = doneMessage(d);
        finish(line.kind, line.text, line.cancelled);
        break;
      }
      case "error": {
        const detail = describePayload(d.message);
        // `worker busy` after our own drop carries the run we lost: adopt
        // it and attach instead of arguing with the gate.
        if (
          typeof d.message === "string" &&
          d.message.includes("worker busy") &&
          typeof d.run_id === "string" &&
          d.run_id.length > 0 &&
          runId() === undefined
        ) {
          rememberRun(d.run_id as string);
          runPipeline = undefined;
          setPhase("recovering");
          send("attach", { run_id: d.run_id });
          log("info", "run.recovered");
          return;
        }
        const text = message("run.serverError", { detail });
        // `fatal` means the server drops the connection right after sending
        // (WS_API.md): end the run here, with the reason as its last line,
        // instead of leaving the buttons busy until onclose arrives. A
        // non-fatal error is part of a live run — the failed `done` follows.
        if (d.fatal === true) finish("error", text);
        else log("error", text);
        break;
      }
    }
  };

  /** One dial: open the socket, say hello on `onopen`, recover on `onclose`.
   * `start`, `recover` and every retry come through here, so there is one
   * place where a connection becomes a watched run. */
  const connect = () => {
    if (runPipeline === undefined && runId() === undefined) return;
    const mine = ++ticket;
    closeSocket();
    // The config is all a fresh `start` sends: where the runner reads and
    // writes is the deployment's business (`--root` / `--models`, WS_API.md).
    watchMode = runPipeline !== undefined ? "start" : "recover";

    // The dial itself is a busy state, not idle: an address that never answers
    // (typo, wrong port, runner down) used to leave the panel looking idle
    // until the socket opened, so a second click would start a second run and
    // the buttons lied about what was happening.
    if (phase() === "idle")
      setPhase(watchMode === "start" ? "connecting" : "recovering");

    // every callback checks its own ticket: a socket (or a retry) we have moved
    // on from must go quiet
    const current = (): boolean => conn === dialled && ticket === mine;
    let dialled: Connection;
    try {
      dialled = openConnection(runUrl, {
        open: () => {
          if (!current()) return;
          if (attempt > 0) log("info", "run.reconnected");
          attempt = 0;
          if (watchMode === "recover") setPhase("recovering");
          else setPhase("running");
          hello();
        },
        closed: (reason) => {
          if (!current()) return;
          conn = undefined;
          // No idle check here: a run that is over already went through
          // `finish`, which bumped the ticket and cleared `runId`/`runPipeline`
          // — both checked inside `reconnect()`. Testing the phase instead made
          // the most common failure silent: a socket that dies *before* it
          // opens never set `running`, so a dead address retried zero times
          // and logged nothing.
          // A silent socket is not necessarily a dead run: reconnect dials
          // again instead of ending the run here.
          reconnect(reason === "silent" ? "run.echoLost" : undefined);
        },
        badFrame: () => {
          if (current()) finish("error", "run.badFrame");
        },
        frame: (msg) => {
          if (current()) handleFrame(msg);
        },
      });
    } catch (err) {
      // a malformed address cannot be fixed by retrying
      finish(
        "error",
        message("run.badAddress", {
          detail: err instanceof Error ? err.message : String(err),
        }),
      );
      return;
    }
    conn = dialled;
  };

  const start = (url: string, pipeline: PureConfig): boolean => {
    if (phase() !== "idle" || !url) return false;
    window.clearTimeout(retryTimer);
    setProgress(undefined);
    // a new run gets a fresh journal; the previous run's lines are its own
    setMessages([]);
    // kept while the socket is down: the retry resumes this exact run
    runUrl = url;
    runPipeline = pipeline;
    rememberRun(undefined);
    attempt = 0;
    connect();
    return true;
  };

  /** Ask the server about the run we remember (or any run at all) without
   * starting anything: a tab that was asleep, a reload, a copied `run_id`.
   * Needs only the address — the socket says hello with `status`. */
  const recover = (url?: string, id?: string) => {
    if (phase() !== "idle") return;
    const address = (url ?? endpoint()).trim();
    if (!address) return;
    runUrl = address;
    runPipeline = undefined;
    if (id !== undefined) rememberRun(id);
    else if (runId() === undefined) rememberRun(storedRunId());
    setProgress(undefined);
    attempt = 0;
    connect();
  };

  // If the server never answers `done`, the UI would sit in `stopping`
  // forever — start disabled, stop disabled, escape only by reload.
  // A watchdog forces the run back to idle when the stop goes unconfirmed.
  const stop = () => {
    if (
      phase() !== "running" &&
      phase() !== "connecting" &&
      phase() !== "recovering"
    )
      return;
    if (phase() === "connecting" || phase() === "recovering") {
      finish("ok", "run.cancelledEarly", true);
      return;
    }
    setPhase("stopping");
    const id = runId();
    send("stop", id === undefined ? {} : { run_id: id });
    window.clearTimeout(stopWatchdog);
    stopWatchdog = window.setTimeout(() => {
      if (phase() === "stopping") finish("error", "run.noStopAck");
    }, STOP_WATCHDOG_MS);
  };

  const clearMessages = () => setMessages([]);

  return {
    phase,
    progress,
    messages,
    runId,
    start,
    stop,
    recover,
    clearMessages,
    onFinish: (listener) => {
      finishListeners.add(listener);
      return () => {
        finishListeners.delete(listener);
      };
    },
    report: log,
  };
};

/** The panel's run client — one per page, deliberately.
 *
 * Switching a panel tab unmounts `RunTab`, and a client owned by that
 * component would close its socket on the way out. The server reads that as
 * "the user is gone" and cancels the job (WS_API.md), so a glance at another
 * tab killed the run and emptied the bar. Owned by the module, the socket,
 * the progress and the journal all outlive the tab that started them. */
export const runClient = createRunClient();
