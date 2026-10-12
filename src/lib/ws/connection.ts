import { pipeline } from "~/lib/pipeline/hooks";
import { decodeFrame, encodeFrame, type Frame } from "./codec";
import { ECHO_INTERVAL_MS, ECHO_TIMEOUT_MS } from "./protocol";

/**
 * One WebSocket to the runner: the envelope codec, the heartbeat contract
 * (`WS_API.md`: echo every 5 s, 15 s of silence = the peer is gone) and the two
 * frame stages plugins hook into. Nothing else — no reconnect, no request
 * matching, no run logic. Those are policies of whoever owns the connection
 * (the run client resumes a job; the hub retries and matches replies), so the
 * wire details live in exactly one place and cannot drift between them.
 *
 * `WebSocket` and the codec are looked up at call time, never captured: tests
 * stub the global after import.
 */
export interface ConnectionEvents {
  /** The handshake finished; the heartbeat is already running. */
  open?(): void;
  /** A frame from the runner that survived the `ws.receive` stage. */
  frame(frame: Frame): void;
  /** Bytes that are not a frame. The connection stays open. */
  badFrame?(): void;
  /** The socket is gone. `silent`: it stopped answering the heartbeat and this
   * side closed it. Never called after `close()`. */
  closed(reason: "closed" | "silent"): void;
}

export interface Connection {
  readonly url: string;
  /** `closing` counts as `closed`: nothing can be sent on it. */
  state(): "connecting" | "open" | "closed";
  /** Send one frame. `false` when the socket is not open or a plugin's
   * `ws.send` hook swallowed the frame. The id defaults to a counter that only
   * advances on a frame that actually left. */
  send(method: string, data?: Record<string, unknown>, id?: number): boolean;
  /** Drop the socket and every callback; `closed` is not reported. */
  close(): void;
}

/** Dial `url`. Throws what `new WebSocket` throws (a malformed address, a
 * blocked mixed-content request): the caller decides whether that is final. */
export const openConnection = (
  url: string,
  events: ConnectionEvents,
): Connection => {
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  let nextId = 1;
  let lastEcho = 0;
  let echoTimer: ReturnType<typeof setInterval> | undefined;
  let detached = false;

  const write = (frame: Frame): boolean => {
    if (socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(encodeFrame(frame));
    } catch {
      // the socket closed between the state check and the write: the close
      // event is already on its way, and a throw here would escape into
      // whoever asked (a timer, an event handler) for no gain
      return false;
    }
    return true;
  };

  const detach = () => {
    detached = true;
    clearInterval(echoTimer);
    echoTimer = undefined;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
  };

  const send: Connection["send"] = (method, data = {}, id) => {
    const outgoing = pipeline.filter("ws.send", {
      m: method,
      id: id ?? nextId,
      d: data,
    });
    if (outgoing === null || !write(outgoing)) return false;
    if (id === undefined) nextId += 1;
    return true;
  };

  socket.onopen = () => {
    if (detached) return;
    lastEcho = Date.now();
    echoTimer = setInterval(() => {
      if (Date.now() - lastEcho > ECHO_TIMEOUT_MS) {
        // A silent socket is not necessarily a dead job: drop it and let the
        // owner decide whether to dial again.
        detach();
        socket.close();
        events.closed("silent");
        return;
      }
      // the heartbeat is the transport's own: it skips the plugin stages and
      // takes its id from the same counter as everything else
      if (write({ m: "echo", id: nextId, d: { t: Date.now() } })) nextId += 1;
    }, ECHO_INTERVAL_MS);
    events.open?.();
  };

  socket.onmessage = (event: MessageEvent) => {
    if (detached) return;
    const frame = decodeFrame(event.data as ArrayBuffer);
    if (frame === undefined) {
      events.badFrame?.();
      return;
    }
    if (frame.m === "echo") {
      lastEcho = Date.now();
      return;
    }
    const incoming = pipeline.filter("ws.receive", frame);
    if (incoming !== null) events.frame(incoming);
  };

  socket.onclose = () => {
    if (detached) return;
    detach();
    events.closed("closed");
  };

  // a close event follows an error; closing here makes sure one does
  socket.onerror = () => {
    if (!detached) socket.close();
  };

  return {
    url,
    state: () =>
      socket.readyState === WebSocket.OPEN
        ? "open"
        : socket.readyState === WebSocket.CONNECTING
          ? "connecting"
          : "closed",
    send,
    close: () => {
      detach();
      socket.close();
    },
  };
};
