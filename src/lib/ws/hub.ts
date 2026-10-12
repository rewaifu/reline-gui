import { render, message, type LocalText } from "~/lib/i18n";
import type { Frame } from "./codec";
import { openConnection, type Connection } from "./connection";
import { wsMethods } from "./methods";
import * as v from "valibot";

/** Why a request did not produce a reply. */
export type WsFailure =
  | "timeout"
  | "closed"
  | "addressChanged"
  | "badAddress"
  | "unknownMethod"
  | "badRequest"
  | "badReply";

export class WsRequestError extends Error {
  readonly kind: WsFailure;
  readonly method: string;
  constructor(kind: WsFailure, method: string, detail = "") {
    super(render(failureText(kind, method, detail)));
    this.name = "WsRequestError";
    this.kind = kind;
    this.method = method;
  }
}

const failureText = (
  kind: WsFailure,
  method: string,
  detail: string,
): LocalText => message(`run.ws.${kind}`, { method, detail });

export interface RequestOptions {
  /** How long to wait for the reply. Default 17 s. */
  timeoutMs?: number;
  /** Method name the reply arrives under. Defaults to the request's. */
  reply?: string;
}

export interface Hub {
  /** Send one request and wait for the frame that answers it (same id, the
   * reply's method name). Dials on demand; a request made while the socket is
   * still connecting is held until it opens. */
  request(
    method: string,
    data?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<Record<string, unknown>>;
  /** Call a method declared with `wsMethods.define`: the request is checked
   * against its schema, the reply parsed with its own. */
  call(name: string, data?: Record<string, unknown>): Promise<unknown>;
  /** Every frame of this method the runner sends — replies included — for
   * server-pushed events. Does not dial: pair it with `open()`. */
  on(
    method: string,
    handler: (data: Record<string, unknown>, frame: Frame) => void,
  ): () => void;
  /** Keep a connection up (and redial after a drop) with no request pending,
   * for a subscriber that waits for pushes. */
  open(): void;
  /** Drop the socket and stop redialling; pending requests fail. */
  close(): void;
}

const DEFAULT_TIMEOUT_MS = 17_000;
const RECONNECT_MS = 5_000;

interface Pending {
  readonly method: string;
  readonly reply: string;
  readonly resolve: (data: Record<string, unknown>) => void;
  readonly reject: (error: WsRequestError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface Queued {
  readonly id: number;
  readonly method: string;
  readonly data: Record<string, unknown>;
}

/**
 * The shared, persistent connection to the runner — `ls` completion and every
 * plugin request go through it. Lazy (it dials on the first request), kept
 * alive by the connection's heartbeat, redialled while something still waits,
 * and dropped when the address the user typed no longer matches the one it
 * dialled: a socket to the old host can only answer with the old host's data.
 *
 * `endpoint` is a function, read on every request, so an edit in the run tab is
 * seen without anyone telling the hub.
 */
export const createHub = (endpoint: () => string): Hub => {
  let conn: Connection | undefined;
  let nextId = 1;
  let wanted = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<number, Pending>();
  /** Requests that arrived while the socket was still connecting. */
  let queue: Queued[] = [];
  const listeners = new Map<
    string,
    Set<(data: Record<string, unknown>, frame: Frame) => void>
  >();

  const settle = (id: number): Pending | undefined => {
    const entry = pending.get(id);
    if (entry === undefined) return undefined;
    pending.delete(id);
    clearTimeout(entry.timer);
    return entry;
  };

  const failAll = (kind: WsFailure) => {
    const entries = [...pending.entries()];
    for (const [id, entry] of entries) {
      settle(id);
      entry.reject(new WsRequestError(kind, entry.method));
    }
  };

  const scheduleReconnect = () => {
    if (reconnectTimer !== undefined) return;
    if (pending.size === 0 && !wanted) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      ensure();
    }, RECONNECT_MS);
  };

  const drop = (kind: WsFailure) => {
    const old = conn;
    conn = undefined;
    queue = [];
    old?.close();
    failAll(kind);
  };

  const onFrame = (frame: Frame) => {
    const id = frame.id ?? 0;
    const entry = pending.get(id);
    if (entry !== undefined && entry.reply === frame.m) {
      settle(id);
      entry.resolve(frame.d ?? {});
    }
    for (const handler of listeners.get(frame.m) ?? []) {
      try {
        handler(frame.d ?? {}, frame);
      } catch {
        // a subscriber's bug must not stop the others, or the next frame
      }
    }
  };

  /** Dial if there is no live socket to the current address. */
  const ensure = (): boolean => {
    const address = endpoint();
    if (conn !== undefined && conn.url !== address) drop("addressChanged");
    if (conn !== undefined) return true;
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    try {
      const mine: Connection = openConnection(address, {
        open: () => {
          if (conn !== mine) return;
          const held = queue;
          queue = [];
          for (const item of held) mine.send(item.method, item.data, item.id);
        },
        frame: (frame) => {
          if (conn === mine) onFrame(frame);
        },
        closed: () => {
          if (conn !== mine) return;
          conn = undefined;
          queue = [];
          failAll("closed");
          scheduleReconnect();
        },
      });
      conn = mine;
      return true;
    } catch {
      return false;
    }
  };

  const request: Hub["request"] = (method, data = {}, options = {}) =>
    new Promise((resolve, reject) => {
      if (!ensure()) {
        // a malformed address (or a blocked insecure one) cannot be fixed by
        // waiting: say so now instead of after the timeout
        reject(new WsRequestError("badAddress", method));
        return;
      }
      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        if (settle(id) !== undefined)
          reject(new WsRequestError("timeout", method));
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      pending.set(id, {
        method,
        reply: options.reply ?? method,
        resolve,
        reject,
        timer,
      });
      // still connecting: hold the request, or the first lookup (fired on
      // focus, before the handshake finishes) would be silently dropped
      if (conn?.state() === "connecting") queue.push({ id, method, data });
      else conn?.send(method, data, id);
    });

  return {
    request,

    async call(name, data = {}) {
      const method = wsMethods.get(name);
      if (method === undefined) throw new WsRequestError("unknownMethod", name);
      if (method.request !== undefined) {
        const checked = v.safeParse(method.request, data);
        if (!checked.success)
          throw new WsRequestError(
            "badRequest",
            name,
            checked.issues[0].message,
          );
      }
      const reply = await request(name, data, {
        timeoutMs: method.timeoutMs,
        reply: method.reply,
      });
      if (method.response === undefined) return reply;
      const parsed = v.safeParse(method.response, reply);
      if (!parsed.success)
        throw new WsRequestError("badReply", name, parsed.issues[0].message);
      return parsed.output;
    },

    on(method, handler) {
      const set = listeners.get(method) ?? new Set();
      set.add(handler);
      listeners.set(method, set);
      return () => {
        set.delete(handler);
      };
    },

    open() {
      wanted = true;
      ensure();
    },

    close() {
      wanted = false;
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      drop("closed");
    },
  };
};
