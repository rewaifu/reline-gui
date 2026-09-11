import { encode, decode } from "notepack.io";
import { createSignal, type Accessor } from "solid-js";
import { message, raw, type LocalText } from "~/lib/i18n";
import type { PureConfig } from "~/types/node";
import {
  ECHO_INTERVAL_MS,
  ECHO_TIMEOUT_MS,
  STOP_WATCHDOG_MS,
} from "./ws-protocol";

export type RunPhase = "idle" | "connecting" | "running" | "stopping";

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

interface Envelope {
  m: string;
  id?: number;
  d?: Record<string, unknown>;
}

// Heartbeat constants come from ws-protocol.ts — one module so both
// WebSocket clients cannot drift out of the echo contract.

export const RUN_ENDPOINT_KEY = "reline-web:runEndpoint";
export const DEFAULT_ENDPOINT = "ws://127.0.0.1:8000/run";

/** Newest journal lines kept; older ones are dropped so a long session (or a
 * stream of errors) cannot grow the array without bound. */
const MAX_MESSAGES = 50;

/** `done.output` is a whole run log; the journal shows its head only. */
const MAX_OUTPUT = 400;

export const apiEndpointFromUrl = (): string | undefined => {
  const q = new URLSearchParams(window.location.search).get("api")?.trim();
  if (!q) return undefined;
  return q.replace(/^http/, "ws");
};

/** ?api= wins, then the last value typed in the run tab, then the default. */
export const resolveEndpoint = (): string =>
  apiEndpointFromUrl() ??
  localStorage.getItem(RUN_ENDPOINT_KEY) ??
  DEFAULT_ENDPOINT;

const initialEndpoint = (): string => {
  if (typeof window === "undefined") return DEFAULT_ENDPOINT;
  try {
    return resolveEndpoint();
  } catch {
    return DEFAULT_ENDPOINT;
  }
};

/** The address the runner is reached at, as one live setting.

 * The run tab edits it, `ls` dials it, and every keystroke is stored right
 * away. When the field only fed `start()` while `ls` kept dialling
 * `resolveEndpoint()` — and a value typed but never used in a run vanished on
 * the next tab switch — the app looked like it ignored the address entirely.
 */
const [endpoint, setEndpointSignal] = createSignal(initialEndpoint());
export { endpoint };
export const setEndpoint = (value: string) => {
  setEndpointSignal(value);
  try {
    localStorage.setItem(RUN_ENDPOINT_KEY, value);
  } catch {
    // private mode or a full quota: the field keeps the value in memory
  }
  dropApiParam();
};

/** Typing an address settles it.

 * `?api=` is a seed for a shared link, but one that keeps winning on every
 * reload would silently undo the field — so the first edit drops it from the
 * URL, and the stored value is the only thing left to read.
 */
const dropApiParam = () => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("api")) return;
    url.searchParams.delete("api");
    window.history.replaceState({}, "", url);
  } catch {
    // no history (or an opaque origin): the stored value is enough
  }
};

export interface RunClient {
  readonly phase: Accessor<RunPhase>;
  readonly progress: Accessor<RunProgress | undefined>;
  readonly messages: Accessor<RunMessage[]>;
  start(url: string, pipeline: PureConfig): void;
  stop(): void;
  clearMessages(): void;
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
const doneMessage = (d: Record<string, unknown>): Omit<RunMessage, "at"> => {
  if (d.cancelled === true) return { kind: "ok", text: "run.stopped" };
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
  let ws: WebSocket | undefined;
  let echoTimer: number | undefined;
  let stopWatchdog: number | undefined;
  let retryTimer: number | undefined;
  let lastEcho = 0;
  let nextId = 1;
  /** Bumped by every dial and every `finish`: callbacks of a socket (or a
   * retry) that we have moved on from compare their own ticket and go quiet. */
  let ticket = 0;
  /** Retries spent on the current drop; reset by a successful `onopen`. */
  let attempt = 0;
  /** The run as the user asked for it, so a reconnect can repeat it verbatim. */
  let runUrl = "";
  let runPipeline: PureConfig | undefined;
  const [phase, setPhase] = createSignal<RunPhase>("idle");
  const [progress, setProgress] = createSignal<RunProgress>();
  const [messages, setMessages] = createSignal<RunMessage[]>([]);

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
    window.clearInterval(echoTimer);
    if (ws !== undefined) {
      ws.onclose = ws.onerror = ws.onmessage = ws.onopen = null;
      ws.close();
      ws = undefined;
    }
  };

  const send = (m: string, d: Record<string, unknown> = {}) => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(encode({ m, id: nextId, d } as Envelope));
    } catch {
      // the socket closed between the state check and the write: the close
      // handler is already on its way, and a throw here would escape into
      // whoever asked (a timer, an event handler) for no gain
      return;
    }
    nextId += 1;
  };

  /** End the run: drop the socket, the watchdog and any pending retry, and
   * leave one journal line that outlives the busy phase. */
  const finish = (kind: RunMessage["kind"], text: LocalText) => {
    // a retry in flight (or a socket callback on its way) must not resurrect
    // the run we are closing here
    ticket += 1;
    window.clearTimeout(retryTimer);
    runPipeline = undefined;
    attempt = 0;
    closeSocket();
    window.clearTimeout(stopWatchdog);
    setPhase("idle");
    log(kind, text);
  };

  /** Dial the run again, with the same address and the same config.
   *
   * A socket that dies mid-run is not the end of it: the server cancels the
   * abandoned job (WS_API.md), and the runner has no resume, so coming back
   * means repeating `start`. That is cheap — a model already installed is not
   * downloaded twice, and re-reading a folder is one scan — while the
   * alternative, a silent drop, leaves the user with a progress bar that
   * stopped moving and no way to know why.
   *
   * Bounded: after `RECONNECT_ATTEMPTS` the run ends with one honest journal
   * line instead of a retry loop nobody can see the end of. */
  const reconnect = (reason?: LocalText) => {
    if (runPipeline === undefined) return;
    if (reason !== undefined) log("info", reason);
    if (attempt >= RECONNECT_ATTEMPTS) {
      finish("error", message("run.reconnectFailed", { url: runUrl }));
      return;
    }
    attempt += 1;
    setPhase("connecting");
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

  const startEcho = () => {
    lastEcho = Date.now();
    window.clearInterval(echoTimer);
    echoTimer = window.setInterval(() => {
      if (Date.now() - lastEcho > ECHO_TIMEOUT_MS) {
        // A silent socket is not necessarily a dead run: drop it and let the
        // reconnect path dial again instead of ending the run here.
        window.clearInterval(echoTimer);
        closeSocket();
        reconnect("run.echoLost");
        return;
      }
      send("echo", { t: Date.now() });
    }, ECHO_INTERVAL_MS);
  };

  /** One dial: open the socket, start the run on `onopen`, retry on `onclose`.
   * `start` and every retry come through here, so there is one place where a
   * connection becomes a run. */
  const connect = () => {
    const pipeline = runPipeline;
    if (pipeline === undefined) return;
    const mine = ++ticket;
    closeSocket();
    // The config is all this client sends: where the runner reads and writes
    // is the deployment's business (`--root` / `--models`, WS_API.md).
    const frame: Record<string, unknown> = { pipeline };

    let socket: WebSocket;
    try {
      socket = new WebSocket(runUrl);
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
    socket.binaryType = "arraybuffer";
    ws = socket;
    // The dial itself is a busy state, not idle: an address that never answers
    // (typo, wrong port, runner down) used to leave the panel looking idle
    // until the socket opened, so a second click would start a second run and
    // the buttons lied about what was happening.
    setPhase("connecting");

    socket.onopen = () => {
      if (ticket !== mine) return;
      if (attempt > 0) log("info", "run.reconnected");
      attempt = 0;
      setPhase("running");
      startEcho();
      send("start", frame);
    };
    socket.onclose = () => {
      if (ws !== socket || ticket !== mine) return;
      ws = undefined;
      window.clearInterval(echoTimer);
      // No idle check here: a run that is over already went through `finish`,
      // which bumped the ticket and cleared `runPipeline` — both checked
      // above/inside `reconnect()`. Testing the phase instead made the most
      // common failure silent: a socket that dies *before* it opens never set
      // `running`, so a dead address retried zero times and logged nothing.
      reconnect();
    };
    socket.onmessage = (ev: MessageEvent) => {
      if (ws !== socket || ticket !== mine) return;
      let msg: Envelope;
      try {
        msg = decode(new Uint8Array(ev.data)) as Envelope;
      } catch {
        finish("error", "run.badFrame");
        return;
      }
      const d = (msg.d ?? {}) as Record<string, unknown>;
      switch (msg.m) {
        case "echo":
          lastEcho = Date.now();
          break;
        case "accepted":
          log("info", "run.accepted");
          break;
        case "progress":
          setProgress(readProgress(d));
          break;
        case "done": {
          const line = doneMessage(d);
          finish(line.kind, line.text);
          break;
        }
        case "error": {
          const text = message("run.serverError", {
            detail: describePayload(d.message),
          });
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
  };

  const start = (url: string, pipeline: PureConfig) => {
    if (phase() !== "idle" || !url) return;
    window.clearTimeout(retryTimer);
    setProgress(undefined);
    // a new run gets a fresh journal; the previous run's lines are its own
    setMessages([]);
    // kept for a reconnect: the retry repeats this exact run
    runUrl = url;
    runPipeline = pipeline;
    attempt = 0;
    connect();
  };

  // If the server never answers `done`, the UI would sit in `stopping`
  // forever — start disabled, stop disabled, escape only by reload.
  // A watchdog forces the run back to idle when the stop goes unconfirmed.
  const stop = () => {
    if (phase() !== "running" && phase() !== "connecting") return;
    if (phase() === "connecting") {
      finish("ok", "run.cancelledEarly");
      return;
    }
    setPhase("stopping");
    send("stop");
    window.clearTimeout(stopWatchdog);
    stopWatchdog = window.setTimeout(() => {
      if (phase() === "stopping") finish("error", "run.noStopAck");
    }, STOP_WATCHDOG_MS);
  };

  const clearMessages = () => setMessages([]);

  return { phase, progress, messages, start, stop, clearMessages };
};

/** The panel's run client — one per page, deliberately.
 *
 * Switching a panel tab unmounts `RunTab`, and a client owned by that
 * component would close its socket on the way out. The server reads that as
 * "the user is gone" and cancels the job (WS_API.md), so a glance at another
 * tab killed the run and emptied the bar. Owned by the module, the socket,
 * the progress and the journal all outlive the tab that started them. */
export const runClient = createRunClient();
