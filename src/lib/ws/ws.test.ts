import { decode, encode } from "notepack.io";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import { flush } from "solid-js";
import { pipeline } from "~/lib/pipeline";
import {
  createHub,
  openConnection,
  WsRequestError,
  wsMethods,
  type Frame,
} from "~/lib/ws";
import { ECHO_INTERVAL_MS, ECHO_TIMEOUT_MS } from "~/lib/ws/protocol";

/** Same stand-in as the run client's tests: Node's notepack build mangles the
 * `Uint8Array` a browser socket hands over, so frames travel as JSON. */
vi.mock("notepack.io", () => ({
  encode: (value: unknown) => new TextEncoder().encode(JSON.stringify(value)),
  decode: (input: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(input)) as unknown,
}));

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  binaryType = "";
  sent: Frame[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: ArrayBuffer }) => void) | null = null;
  constructor(readonly url: string) {
    if (url === "bad") throw new SyntaxError("bad url");
    FakeSocket.all.push(this);
  }
  send(payload: Uint8Array) {
    this.sent.push(decode(payload) as Frame);
  }
  close() {
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  drop() {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
  server(frame: Frame) {
    const bytes = encode(frame);
    this.onmessage?.({
      data: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    });
  }
  raw(bytes: Uint8Array) {
    this.onmessage?.({ data: bytes.buffer as ArrayBuffer });
  }
}
const last = () => FakeSocket.all[FakeSocket.all.length - 1];

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const undo: (() => void)[] = [];
afterEach(() => {
  while (undo.length > 0) undo.pop()?.();
});

describe("connection", () => {
  const dial = (events: Partial<Parameters<typeof openConnection>[1]> = {}) => {
    const seen: Frame[] = [];
    const closes: string[] = [];
    const conn = openConnection("ws://x/run", {
      frame: (f) => seen.push(f),
      closed: (r) => closes.push(r),
      ...events,
    });
    return { conn, seen, closes, socket: last() };
  };

  it("sends nothing until the socket is open, then counts ids up", () => {
    const { conn, socket } = dial();
    expect(conn.state()).toBe("connecting");
    expect(conn.send("start")).toBe(false);
    socket.open();
    expect(conn.state()).toBe("open");
    expect(conn.send("a", { n: 1 })).toBe(true);
    expect(conn.send("b")).toBe(true);
    expect(socket.sent).toEqual([
      { m: "a", id: 1, d: { n: 1 } },
      { m: "b", id: 2, d: {} },
    ]);
  });

  it("an explicit id does not move the counter", () => {
    const { conn, socket } = dial();
    socket.open();
    conn.send("a", {}, 99);
    conn.send("b");
    expect(socket.sent.map((f) => f.id)).toEqual([99, 1]);
  });

  it("beats on the interval and drops a socket that stops answering", () => {
    const { socket, closes } = dial();
    socket.open();
    vi.advanceTimersByTime(ECHO_INTERVAL_MS);
    expect(socket.sent.map((f) => f.m)).toEqual(["echo"]);
    // keep answering: it stays up past the timeout
    for (let t = 0; t < ECHO_TIMEOUT_MS; t += ECHO_INTERVAL_MS) {
      socket.server({ m: "echo" });
      vi.advanceTimersByTime(ECHO_INTERVAL_MS);
    }
    expect(closes).toEqual([]);
    // go silent
    vi.advanceTimersByTime(ECHO_TIMEOUT_MS + ECHO_INTERVAL_MS);
    expect(closes).toEqual(["silent"]);
    expect(socket.closed).toBe(true);
  });

  it("never shows a heartbeat to the owner", () => {
    const { socket, seen } = dial();
    socket.open();
    socket.server({ m: "echo" });
    socket.server({ m: "progress", d: { percent: 1 } });
    expect(seen.map((f) => f.m)).toEqual(["progress"]);
  });

  it("reports bytes that are not a frame and stays open", () => {
    let bad = 0;
    const { conn, socket } = dial({ badFrame: () => (bad += 1) });
    socket.open();
    socket.raw(new TextEncoder().encode("{not json"));
    socket.raw(new TextEncoder().encode("42"));
    expect(bad).toBe(2);
    expect(conn.state()).toBe("open");
  });

  it("reports a drop once, and nothing after close()", () => {
    const first = dial();
    first.socket.open();
    first.socket.drop();
    expect(first.closes).toEqual(["closed"]);
    const second = dial();
    second.socket.open();
    second.conn.close();
    second.socket.drop();
    expect(second.closes).toEqual([]);
  });

  it("an error closes the socket so the close event follows", () => {
    const { socket } = dial();
    socket.onerror?.();
    expect(socket.closed).toBe(true);
  });

  it("lets a ws.send hook rewrite or swallow a frame, heartbeat excepted", () => {
    undo.push(
      pipeline.use("ws.send", (frame) => {
        if (frame.m === "secret") return null;
        frame.d = { ...frame.d, tagged: true };
      }),
    );
    const { conn, socket } = dial();
    socket.open();
    expect(conn.send("secret")).toBe(false);
    expect(conn.send("run", { a: 1 })).toBe(true);
    // a swallowed frame does not burn an id
    expect(socket.sent).toEqual([
      { m: "run", id: 1, d: { a: 1, tagged: true } },
    ]);
    vi.advanceTimersByTime(ECHO_INTERVAL_MS);
    expect(socket.sent[1]).toMatchObject({ m: "echo" });
    expect(socket.sent[1].d).not.toHaveProperty("tagged");
  });

  it("lets a ws.receive hook rewrite or swallow a frame", () => {
    undo.push(
      pipeline.use("ws.receive", (frame) => {
        if (frame.m === "noise") return null;
        if (frame.m === "old") return { ...frame, m: "new" };
      }),
    );
    const { socket, seen } = dial();
    socket.open();
    socket.server({ m: "noise" });
    socket.server({ m: "old" });
    socket.server({ m: "plain" });
    expect(seen.map((f) => f.m)).toEqual(["new", "plain"]);
  });

  it("a throwing frame hook costs nothing", () => {
    undo.push(
      pipeline.use("ws.receive", () => {
        throw new Error("boom");
      }),
    );
    const { socket, seen } = dial();
    socket.open();
    socket.server({ m: "x" });
    expect(seen).toHaveLength(1);
    flush();
  });

  it("throws what a malformed address throws", () => {
    expect(() =>
      openConnection("bad", { frame: () => {}, closed: () => {} }),
    ).toThrow(SyntaxError);
  });
});

describe("hub", () => {
  let address = "ws://one/run";
  const hub = () => createHub(() => address);
  beforeEach(() => {
    address = "ws://one/run";
  });

  /** Answer the newest request frame with `reply`. */
  const answer = (socket: FakeSocket, reply: (frame: Frame) => Frame) => {
    const request = socket.sent.filter((f) => f.m !== "echo").at(-1)!;
    socket.server(reply(request));
  };

  it("dials on the first request and matches the reply by id and method", async () => {
    const h = hub();
    const pending = h.request("ls", { path: "/a" });
    const socket = last();
    socket.open();
    answer(socket, (f) => ({ m: "ls", id: f.id, d: { entries: ["x"] } }));
    await expect(pending).resolves.toEqual({ entries: ["x"] });
    expect(socket.sent[0]).toMatchObject({ m: "ls", d: { path: "/a" } });
  });

  it("holds a request made while connecting and sends it on open", async () => {
    const h = hub();
    const pending = h.request("ls", { path: "/a" });
    const socket = last();
    expect(socket.sent).toEqual([]);
    socket.open();
    expect(socket.sent).toHaveLength(1);
    answer(socket, (f) => ({ m: "ls", id: f.id, d: {} }));
    await pending;
  });

  it("ignores a reply with another id or another method", async () => {
    const h = hub();
    const pending = h.request("ls", {}, { timeoutMs: 100 });
    const socket = last();
    socket.open();
    const id = socket.sent[0].id;
    socket.server({ m: "ls", id: (id ?? 0) + 5, d: {} });
    socket.server({ m: "other", id, d: {} });
    const settled = vi.fn();
    void pending.then(settled, settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    socket.server({ m: "ls", id, d: { ok: 1 } });
    await expect(pending).resolves.toEqual({ ok: 1 });
  });

  it("a reply under another method name is accepted when declared", async () => {
    const h = hub();
    const pending = h.request("ping", {}, { reply: "pong" });
    const socket = last();
    socket.open();
    socket.server({ m: "pong", id: socket.sent[0].id, d: { n: 1 } });
    await expect(pending).resolves.toEqual({ n: 1 });
  });

  it("times out with a typed error and forgets the request", async () => {
    const h = hub();
    const pending = h.request("ls", {}, { timeoutMs: 50 });
    const caught = pending.catch((e: unknown) => e);
    last().open();
    await vi.advanceTimersByTimeAsync(60);
    const error = await caught;
    expect(error).toBeInstanceOf(WsRequestError);
    expect(error).toMatchObject({ kind: "timeout", method: "ls" });
    // a late reply to a forgotten request is harmless
    last().server({ m: "ls", id: 1, d: {} });
  });

  it("fails everything pending when the socket drops, and does not redial when nothing waits", async () => {
    const h = hub();
    const a = h.request("ls", { path: "/a" }).catch((e: unknown) => e);
    const first = last();
    first.open();
    first.drop();
    expect(await a).toMatchObject({ kind: "closed" });
    // nothing waits any more: no redial
    await vi.advanceTimersByTimeAsync(6000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("dials a new socket for the next request after a drop", async () => {
    const h = hub();
    void h.request("a", {}, { timeoutMs: 60_000 }).catch(() => {});
    const first = last();
    first.open();
    // a second request queued behind a socket that dies before replying
    first.drop();
    void h.request("b", {}, { timeoutMs: 60_000 }).catch(() => {});
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("drops the socket when the address changes and fails what was waiting", async () => {
    const h = hub();
    const old = h.request("ls", {}).catch((e: unknown) => e);
    const first = last();
    first.open();
    address = "ws://two/run";
    void h.request("ls", {}).catch(() => {});
    expect(first.closed).toBe(true);
    expect(await old).toMatchObject({ kind: "addressChanged" });
    expect(FakeSocket.all.map((s) => s.url)).toEqual([
      "ws://one/run",
      "ws://two/run",
    ]);
  });

  it("rejects at once on a malformed address instead of waiting for the timeout", async () => {
    address = "bad";
    await expect(hub().request("ls")).rejects.toMatchObject({
      kind: "badAddress",
    });
  });

  it("close() fails pending requests and stops redialling", async () => {
    const h = hub();
    const p = h.request("ls").catch((e: unknown) => e);
    last().open();
    h.close();
    expect(await p).toMatchObject({ kind: "closed" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("delivers pushed events to subscribers, one failing subscriber included", () => {
    const h = hub();
    const got: unknown[] = [];
    h.on("tick", () => {
      throw new Error("bad subscriber");
    });
    const off = h.on("tick", (d) => got.push(d));
    h.open();
    const socket = last();
    socket.open();
    socket.server({ m: "tick", d: { n: 1 } });
    off();
    socket.server({ m: "tick", d: { n: 2 } });
    expect(got).toEqual([{ n: 1 }]);
  });

  it("open() keeps redialling for a subscriber with nothing pending", async () => {
    const h = hub();
    h.open();
    last().open();
    last().drop();
    await vi.advanceTimersByTimeAsync(5100);
    expect(FakeSocket.all).toHaveLength(2);
  });
});

describe("declared methods", () => {
  const h = () => createHub(() => "ws://one/run");

  it("checks the request, parses the reply, and fills its defaults", async () => {
    undo.push(
      wsMethods.define({
        name: "x.test.sum",
        request: v.object({ a: v.number(), b: v.number() }),
        response: v.object({
          total: v.number(),
          note: v.optional(v.string(), "none"),
        }),
      }),
    );
    const hub = h();
    await expect(
      hub.call("x.test.sum", { a: "1", b: 2 }),
    ).rejects.toMatchObject({ kind: "badRequest" });
    const call = hub.call("x.test.sum", { a: 1, b: 2 });
    const socket = last();
    socket.open();
    socket.server({ m: "x.test.sum", id: socket.sent[0].id, d: { total: 3 } });
    await expect(call).resolves.toEqual({ total: 3, note: "none" });
  });

  it("a reply of the wrong shape is an error, not a value", async () => {
    undo.push(
      wsMethods.define({
        name: "x.test.n",
        response: v.object({ n: v.number() }),
      }),
    );
    const hub = h();
    const call = hub.call("x.test.n").catch((e: unknown) => e);
    const socket = last();
    socket.open();
    socket.server({ m: "x.test.n", id: socket.sent[0].id, d: { n: "nope" } });
    expect(await call).toMatchObject({ kind: "badReply" });
  });

  it("an undeclared method is refused before anything is sent", async () => {
    await expect(h().call("x.test.nothing")).rejects.toMatchObject({
      kind: "unknownMethod",
    });
    expect(FakeSocket.all).toHaveLength(0);
  });

  it("ls is declared by the core", () => {
    expect(wsMethods.list()).toContain("ls");
  });

  it("a stale disposer does not remove a redefinition", () => {
    const first = wsMethods.define({ name: "x.test.r" });
    undo.push(wsMethods.define({ name: "x.test.r", timeoutMs: 5 }));
    first();
    expect(wsMethods.get("x.test.r")?.timeoutMs).toBe(5);
  });
});
