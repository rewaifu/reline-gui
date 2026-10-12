import type { PureConfig } from "~/types/node";

/**
 * The sandboxed tier: a plugin that runs in a Web Worker.
 *
 * A worker has no DOM, no `localStorage`, no access to the page's modules or to
 * the plugin API — the only door is `postMessage`, and the runtime sends through
 * it nothing but the config of a run. That makes it the one tier whose
 * *capabilities are enforced rather than promised*: a worker plugin cannot read
 * your stored configs, touch the editor, or call the runner on its own.
 *
 * What it still can do: use the network (`fetch`) and see the configs it is
 * handed, so it can send them somewhere. Isolation limits what a plugin can
 * *reach*, not what it can do with what it is *given*.
 *
 * It can only hook `beforeRun` (the one asynchronous stage): every other stage
 * runs synchronously inside a memo, which cannot wait for a message.
 */
export interface WorkerHandle {
  /** The worker's `beforeRun` hook applied to a config. */
  beforeRun(config: PureConfig): Promise<PureConfig>;
  /** Stop the worker; pending calls are rejected. */
  dispose(): void;
}

/** What the runtime needs from a `Worker` — and what a test can stand in for. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

export type WorkerFactory = (script: string, name: string) => WorkerLike;

/** Runs inside the worker. A string, not a module: it is loaded from a Blob, so
 * nothing outside the plugin's own bytes and this text is ever executed there. */
const BOOTSTRAP = `
let hook;
const api = {
  id: undefined,
  version: undefined,
  log: (...parts) => self.postMessage({ type: "log", text: parts.map(String).join(" ") }),
  pipeline: { beforeRun: (fn) => { hook = fn; } },
};
self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === "activate") {
    api.id = msg.id;
    api.version = msg.version;
    try {
      const url = URL.createObjectURL(new Blob([msg.code], { type: "text/javascript" }));
      let mod;
      try { mod = await import(url); } finally { URL.revokeObjectURL(url); }
      await mod.default.activate(api);
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "failed", message: String(error && error.message || error) });
    }
  } else if (msg.type === "beforeRun") {
    try {
      const out = hook ? await hook(msg.config) : msg.config;
      self.postMessage({ type: "result", call: msg.call, config: out === undefined ? msg.config : out });
    } catch (error) {
      self.postMessage({ type: "result", call: msg.call, error: String(error && error.message || error) });
    }
  }
};
`;

const blobWorker: WorkerFactory = (script, name) => {
  const url = URL.createObjectURL(
    new Blob([script], { type: "text/javascript" }),
  );
  // revoked once the worker has loaded its script; terminate() cleans the rest
  const worker = new Worker(url, { type: "module", name });
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return worker as unknown as WorkerLike;
};

let factory: WorkerFactory = blobWorker;

/** Replace how workers are created (tests); returns a function that restores it. */
export const setWorkerFactory = (next: WorkerFactory): (() => void) => {
  const previous = factory;
  factory = next;
  return () => {
    factory = previous;
  };
};

const ACTIVATE_TIMEOUT_MS = 5000;

interface Pending {
  resolve: (config: PureConfig) => void;
  reject: (error: Error) => void;
}

/** Start a plugin's code in a worker and wait until it has activated. */
export const startWorker = (options: {
  id: string;
  version: string;
  code: string;
  onLog: (line: string) => void;
}): Promise<WorkerHandle> =>
  new Promise((resolve, reject) => {
    const worker = factory(BOOTSTRAP, options.id);
    const pending = new Map<number, Pending>();
    let calls = 0;
    let settled = false;

    const dispose = () => {
      worker.onmessage = worker.onerror = null;
      worker.terminate();
      for (const entry of pending.values())
        entry.reject(new Error("the plugin worker was stopped"));
      pending.clear();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      dispose();
      reject(error);
    };
    const timer = setTimeout(
      () =>
        fail(
          new Error(
            `activate() did not finish within ${ACTIVATE_TIMEOUT_MS} ms`,
          ),
        ),
      ACTIVATE_TIMEOUT_MS,
    );

    worker.onerror = (event) =>
      fail(new Error(event.message ?? "worker error"));
    worker.onmessage = ({ data }) => {
      const msg = data as {
        type?: string;
        text?: string;
        message?: string;
        call?: number;
        config?: PureConfig;
        error?: string;
      };
      if (msg.type === "log" && typeof msg.text === "string") {
        options.onLog(msg.text);
      } else if (msg.type === "ready" && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          beforeRun: (config) =>
            new Promise<PureConfig>((ok, bad) => {
              calls += 1;
              pending.set(calls, { resolve: ok, reject: bad });
              worker.postMessage({ type: "beforeRun", call: calls, config });
            }),
          dispose,
        });
      } else if (msg.type === "failed") {
        fail(new Error(msg.message ?? "activation failed"));
      } else if (msg.type === "result" && typeof msg.call === "number") {
        const entry = pending.get(msg.call);
        if (entry === undefined) return;
        pending.delete(msg.call);
        if (msg.error !== undefined) entry.reject(new Error(msg.error));
        else if (msg.config !== undefined) entry.resolve(msg.config);
      }
    };
    worker.postMessage({
      type: "activate",
      id: options.id,
      version: options.version,
      code: options.code,
    });
  });
