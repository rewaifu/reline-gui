import { decode } from "notepack.io";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The runner address is one setting, not a field only `start()` reads: the
 * reported bug was the app behaving as if the address came from the URL alone —
 * `ls` kept dialling `resolveEndpoint()` and a typed value that was never used
 * in a run was lost on the next tab switch. The frames below are also checked
 * once, because "the UI sends its config and nothing else" is the contract the
 * deployment relies on. */

interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  clear(): void;
  readonly length: number;
}

/** jsdom in this setup has no storage of its own, and the module only needs
 * get/set/clear semantics — a Map is the whole contract. */
const useStorage = (): FakeStorage => {
  const map = new Map<string, string>();
  const storage: FakeStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
};

/** Only `location.search` is read by the module under test. */
const useUrl = (search: string) => {
  Object.defineProperty(window, "location", {
    value: {
      search,
      href: `http://localhost/${search}`,
      origin: "http://localhost",
    },
    configurable: true,
    writable: true,
  });
};

class StubSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  url: string;
  closed = false;
  readyState = 1;
  binaryType = "arraybuffer";
  onopen: (() => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: unknown[] = [];
  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
}

let sockets: StubSocket[] = [];

// The endpoint is read once, when the module is first evaluated: exercising
// "what the app starts with" needs a fresh module registry, which a static
// import cannot give (the address would be frozen at the first test).
const loadRun = async () => {
  vi.resetModules();
  return import("~/lib/run-client");
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("run endpoint", () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = useStorage();
    useUrl("");
  });

  it("takes ?api= at load, the stored value otherwise", async () => {
    useUrl("?api=wss://from-url/run");
    storage.setItem("reline-web:runEndpoint", "ws://stored/run");
    const run = await loadRun();
    expect(run.endpoint()).toBe("wss://from-url/run");

    useUrl("");
    const reloaded = await loadRun();
    expect(reloaded.endpoint()).toBe("ws://stored/run");
  });

  it("stores every keystroke, not just a run", async () => {
    storage.setItem("reline-web:runEndpoint", "ws://stored/run");
    const run = await loadRun();
    expect(run.endpoint()).toBe("ws://stored/run");

    run.setEndpoint("wss://typed/run");
    // Solid 2 queues signal writes and applies them on flush; the app reads the
    // value from the next event, a synchronous test has to flush first
    flush();
    expect(run.endpoint()).toBe("wss://typed/run");
    expect(storage.getItem("reline-web:runEndpoint")).toBe("wss://typed/run");
  });

  it("keeps a typed address across a reload", async () => {
    useUrl("?api=wss://from-url/run");
    const run = await loadRun();
    run.setEndpoint("wss://typed/run");
    flush();

    // a reload drops ?api= (the user opened a plain URL) and re-reads storage
    useUrl("");
    const reloaded = await loadRun();
    expect(reloaded.endpoint()).toBe("wss://typed/run");
  });

  it("stops ?api= from overriding an address the user typed", async () => {
    useUrl("?api=wss://from-url/run");
    const run = await loadRun();
    const replaceState = vi.spyOn(window.history, "replaceState");
    run.setEndpoint("wss://typed/run");
    flush();
    expect(replaceState).toHaveBeenCalled();
    replaceState.mockRestore();
  });
});

describe("the run frame", () => {
  beforeEach(() => {
    useStorage();
    useUrl("");
    sockets = [];
    vi.stubGlobal("WebSocket", StubSocket);
  });

  it("carries the config and nothing else", async () => {
    const run = await loadRun();
    const client = run.createRunClient();
    client.start("ws://runner/run", { nodes: [], preprocess: [] });
    // a real socket opens asynchronously; `start` sends its frame from `onopen`
    sockets[0].onopen?.();

    const frame = decode(sockets[0].sent[0]) as {
      m: string;
      d: Record<string, unknown>;
    };
    expect(frame.m).toBe("start");
    // where the runner reads and writes is a launch parameter, never a frame
    // field the UI could get wrong
    expect(Object.keys(frame.d)).toEqual(["pipeline"]);
    client.stop();
  });
});

describe("ls follows the address", () => {
  beforeEach(() => {
    useStorage();
    useUrl("");
    sockets = [];
    vi.stubGlobal("WebSocket", StubSocket);
  });

  it("dials the current address and drops a socket to the old one", async () => {
    const run = await loadRun();
    run.setEndpoint("ws://first/run");
    flush();
    // same reason as `loadRun`: the client is a singleton created at import
    const { lsClient } = await import("~/lib/ls-client");

    void lsClient.ls("/a").catch(() => {});
    expect(sockets.map((socket) => socket.url)).toEqual(["ws://first/run"]);

    // the user edits the address while that socket is still open
    run.setEndpoint("ws://second/run");
    flush();
    void lsClient.ls("/b").catch(() => {});
    expect(sockets.map((socket) => socket.url)).toEqual([
      "ws://first/run",
      "ws://second/run",
    ]);
    expect(sockets[0].closed).toBe(true);
  });
});
