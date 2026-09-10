import { encode, decode } from "notepack.io";
import { endpoint } from "./run-client";
import { ECHO_INTERVAL_MS, ECHO_TIMEOUT_MS } from "./ws-protocol";

export interface LsOptions {
  ext?: string[];
  /** Only files, no directories — for callers that complete a file rather
   * than walk the tree (`files_only` on the wire). */
  filesOnly?: boolean;
}

export interface LsResult {
  entries: string[];
  dirs: string[];
}

interface Envelope {
  m: string;
  id?: number;
  d?: Record<string, unknown>;
}

const LS_TIMEOUT_MS = 17000;
const RECONNECT_MS = 5000;

type Pending = (result: LsResult) => void;
type Reject = (reason: string) => void;

/** Persistent WebSocket for `ls` lookups: lazily connects to the run
 * endpoint, keeps the socket alive with 5 s echos per WS_API.md and
 * reconnects transparently when the server comes back. */
class LsClient {
  private ws: WebSocket | undefined;
  //: address the live socket was opened to, so an edit is noticed
  private url: string | undefined;
  private echoTimer: ReturnType<typeof setInterval> | undefined;
  private lastEcho = 0;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private failures = new Map<number, Reject>();
  // one timeout handle per in-flight request — cleared as soon as it settles,
  // so a typing session does not accumulate a dozen live 17 s timers
  private timers = new Map<number, number>();
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  // requests that arrived while the socket was still CONNECTING — flushed on open
  private queue: Array<{ id: number; path: string; opts: LsOptions }> = [];

  ls(path: string, opts: LsOptions = {}): Promise<LsResult> {
    this.ensureSocket();
    const id = this.nextId++;
    let fail: Reject = () => {};
    const promise = new Promise<LsResult>((resolve, reject) => {
      fail = reject;
      this.pending.set(id, resolve);
      this.failures.set(id, reject);
    });
    this.timers.set(
      id,
      window.setTimeout(() => {
        this.settle(id);
        fail("ls: нет ответа от сервера");
      }, LS_TIMEOUT_MS),
    );
    this.send(id, path, opts);
    return promise;
  }

  /** Drop a request's bookkeeping once it has resolved, failed or timed out. */
  private settle(id: number) {
    this.pending.delete(id);
    this.failures.delete(id);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }

  private ensureSocket() {
    // The address can change while a socket is open, and a socket to the old
    // host can only answer with the old host's paths: drop it and dial the
    // current address. Its in-flight lookups fail; the next keystroke asks the
    // right server anyway.
    if (this.ws !== undefined && this.url !== endpoint()) this.dropSocket();
    if (this.ws !== undefined || this.reconnectTimer !== undefined) return;
    this.connect();
  }

  /** Forget the live socket, if any, without scheduling a reconnect. */
  private dropSocket() {
    const socket = this.ws;
    this.ws = undefined;
    this.url = undefined;
    this.queue.length = 0;
    this.stopEcho();
    if (socket !== undefined) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
    }
    this.failAll("ls: адрес изменён");
  }

  private connect() {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const url = endpoint();
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    socket.binaryType = "arraybuffer";
    this.ws = socket;
    this.url = url;
    socket.onopen = () => {
      this.lastEcho = Date.now();
      this.startEcho();
      for (const item of this.queue.splice(0))
        this.send(item.id, item.path, item.opts);
    };
    socket.onmessage = (ev: MessageEvent) => {
      if (this.ws !== socket) return;
      let msg: Envelope;
      try {
        msg = decode(new Uint8Array(ev.data)) as Envelope;
      } catch {
        return;
      }
      if (msg.m === "echo") {
        this.lastEcho = Date.now();
        return;
      }
      if (msg.m !== "ls") return;
      const resolve = this.pending.get(msg.id ?? 0);
      if (resolve === undefined) return;
      this.settle(msg.id ?? 0);
      const d = msg.d ?? {};
      resolve({
        entries: (d.entries as string[]) ?? [],
        dirs: (d.dirs as string[]) ?? [],
      });
    };
    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.queue.length = 0;
      this.ws = undefined;
      this.url = undefined;
      this.stopEcho();
      this.failAll("ls: соединение закрыто");
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      if (this.ws === socket) socket.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== undefined || this.pending.size === 0) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, RECONNECT_MS);
  }

  private failAll(reason: string) {
    for (const reject of this.failures.values()) reject(reason);
    this.failures.clear();
    this.pending.clear();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private startEcho() {
    this.stopEcho();
    this.echoTimer = setInterval(() => {
      if (Date.now() - this.lastEcho > ECHO_TIMEOUT_MS) {
        this.ws?.close();
        return;
      }
      this.send(0, "", {});
    }, ECHO_INTERVAL_MS);
  }

  private stopEcho() {
    if (this.echoTimer !== undefined) clearInterval(this.echoTimer);
    this.echoTimer = undefined;
  }

  private send(id: number, path: string, opts: LsOptions) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      // CONNECTING: hold the request, otherwise the first lookup (fired on
      // focus, before the handshake finishes) would be silently dropped
      if (this.ws !== undefined && this.ws.readyState === WebSocket.CONNECTING)
        this.queue.push({ id, path, opts });
      return;
    }
    const d: Record<string, unknown> = { path };
    if (opts.ext !== undefined) d.ext = opts.ext;
    if (opts.filesOnly === true) d.files_only = true;
    // The echo (id 0) is a heartbeat, not a lookup: it carries no path options.
    // `root` is not sent either — the deployment sets the base it browses.
    this.ws.send(
      encode({ m: id === 0 ? "echo" : "ls", id, d } satisfies Envelope),
    );
  }
}

export const lsClient = new LsClient();
