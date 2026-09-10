import { encode, decode } from "notepack.io";
import { createSignal, type Accessor } from "solid-js";
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

/** One `progress` frame, with the wire's snake_case keys decoded to camelCase.
 * Every field except `percent` is optional: `total: 0` means "size unknown",
 * `eta`/`rate` appear only after the first measurement. */
export interface RunProgress {
  percent: number;
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
  text: string;
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
 * user-facing message without falling back to `[object Object]`. */
const describePayload = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "неизвестно";
  return JSON.stringify(value) ?? "неизвестно";
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
 * "Остановлено" is not an error. */
const doneMessage = (d: Record<string, unknown>): Omit<RunMessage, "at"> => {
  if (d.cancelled === true) return { kind: "ok", text: "Остановлено" };
  if (d.ok === true) {
    const output = readText(d.output);
    return {
      kind: "ok",
      text:
        output === undefined
          ? "Готово"
          : `Готово: ${output.slice(0, MAX_OUTPUT)}`,
    };
  }
  return { kind: "error", text: `Ошибка: ${describePayload(d.error)}` };
};

export const createRunClient = (): RunClient => {
  let ws: WebSocket | undefined;
  let echoTimer: number | undefined;
  let stopWatchdog: number | undefined;
  let lastEcho = 0;
  let nextId = 1;
  const [phase, setPhase] = createSignal<RunPhase>("idle");
  const [progress, setProgress] = createSignal<RunProgress>();
  const [messages, setMessages] = createSignal<RunMessage[]>([]);

  /** Append one journal line, dropping the oldest past the cap. Only `start`
   * ever removes lines: everything else that happens to a run — an `error`
   * frame, a dead socket, an unconfirmed stop — has to stay readable after the
   * run goes idle, which is when the user looks. */
  const log = (kind: RunMessage["kind"], text: string) => {
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
    ws.send(encode({ m, id: nextId, d } as Envelope));
    nextId += 1;
  };

  /** End the run: drop the socket and the watchdog, and leave one journal line
   * that outlives the busy phase. */
  const finish = (kind: RunMessage["kind"], text: string) => {
    closeSocket();
    window.clearTimeout(stopWatchdog);
    setPhase("idle");
    log(kind, text);
  };

  const startEcho = () => {
    lastEcho = Date.now();
    window.clearInterval(echoTimer);
    echoTimer = window.setInterval(() => {
      if (Date.now() - lastEcho > ECHO_TIMEOUT_MS) {
        finish("error", "Соединение потеряно: нет ответа на echo");
        return;
      }
      send("echo", { t: Date.now() });
    }, ECHO_INTERVAL_MS);
  };

  const start = (url: string, pipeline: PureConfig) => {
    if (phase() !== "idle" || !url) return;
    closeSocket();
    setProgress(undefined);
    // a new run gets a fresh journal; the previous run's lines are its own
    setMessages([]);
    setPhase("connecting");

    // The config is all this client sends: where the runner reads and writes
    // is the deployment's business (`--root` / `--models`, WS_API.md).
    const frame: Record<string, unknown> = { pipeline };

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      setPhase("idle");
      log(
        "error",
        `Некорректный адрес: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }
    socket.binaryType = "arraybuffer";
    ws = socket;

    socket.onopen = () => {
      setPhase("running");
      startEcho();
      send("start", frame);
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = undefined;
      window.clearInterval(echoTimer);
      if (phase() === "idle") return;
      setPhase("idle");
      log("error", `Соединение закрыто сервером · ${url}`);
    };
    socket.onerror = () => {
      if (ws === socket && phase() === "connecting")
        finish(
          "error",
          `Не удалось подключиться · ${url} — раннер не ответил. Проверьте, что он запущен: GET /health на том же хосте должен вернуть 200`,
        );
    };
    socket.onmessage = (ev: MessageEvent) => {
      if (ws !== socket) return;
      let msg: Envelope;
      try {
        msg = decode(new Uint8Array(ev.data)) as Envelope;
      } catch {
        finish("error", "Некорректный кадр (не MessagePack)");
        return;
      }
      if (typeof msg?.m !== "string") return;
      const d = (msg.d ?? {}) as Record<string, unknown>;
      switch (msg.m) {
        case "echo":
          lastEcho = Date.now();
          break;
        case "accepted":
          log("info", "Запуск принят сервером");
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
          const text = `Ошибка сервера: ${describePayload(d.message)}`;
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

  // If the server never answers `done`, the UI would sit in `stopping`
  // forever — "Запустить" disabled, "Стоп" disabled, escape only by reload.
  // A watchdog forces the run back to idle when the stop goes unconfirmed.
  const stop = () => {
    if (phase() !== "running" && phase() !== "connecting") return;
    if (phase() === "connecting") {
      finish("ok", "Отменено до подключения");
      return;
    }
    setPhase("stopping");
    send("stop");
    window.clearTimeout(stopWatchdog);
    stopWatchdog = window.setTimeout(() => {
      if (phase() === "stopping")
        finish("error", "Сервер не подтвердил остановку");
    }, STOP_WATCHDOG_MS);
  };

  const clearMessages = () => setMessages([]);

  return { phase, progress, messages, start, stop, clearMessages };
};
