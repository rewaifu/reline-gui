import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createRoot, createStore, flush, type Store } from "solid-js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginApi } from "../../src/lib/plugins/api";
import type { RunOutcome } from "../../src/lib/run-client";
import type { PureConfig, StackNode } from "../../src/types/node";

/** The Config sequence plugin against the real host API: its own source, the
 * real `createPluginApi`, a real stack — only the run client is replaced (a run
 * needs a runner). What is checked is the plugin's contract: steps run one at a
 * time, in order, each only after the previous one ended, and a failure or a
 * stop ends the sequence. */

class MemoryStorage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

/** A runner that records what it was asked to run and ends each run on demand. */
const fakeRun = vi.hoisted(() => {
  const state = {
    started: [] as unknown[],
    listeners: new Set<
      (o: { ok: boolean; cancelled: boolean; text: string }) => void
    >(),
    busy: false,
    stops: 0,
  };
  return state;
});

vi.mock("../../src/lib/run-client", () => ({
  runClient: {
    phase: () => (fakeRun.busy ? "running" : "idle"),
    progress: () => undefined,
    start: (_url: string, config: unknown) => {
      if (fakeRun.busy) return false;
      fakeRun.busy = true;
      fakeRun.started.push(config);
      return true;
    },
    stop: () => {
      fakeRun.stops += 1;
    },
    onFinish: (listener: (o: RunOutcome) => void) => {
      fakeRun.listeners.add(listener as never);
      return () => fakeRun.listeners.delete(listener as never);
    },
  },
}));

const endRun = (outcome: Partial<RunOutcome> = {}) => {
  fakeRun.busy = false;
  for (const listener of Array.from(fakeRun.listeners))
    listener({
      ok: true,
      cancelled: false,
      text: "run.done",
      ...outcome,
    } as never);
};

let mem: MemoryStorage;

/** A new page load: storage survives unless the test says otherwise. */
const boot = async (options: { freshStorage?: boolean } = {}) => {
  if (options.freshStorage === true) {
    mem = new MemoryStorage();
    vi.stubGlobal("localStorage", mem);
  }
  vi.resetModules();
  fakeRun.started = [];
  fakeRun.listeners.clear();
  fakeRun.busy = false;
  fakeRun.stops = 0;
  const [
    { createPluginApi },
    { bindStore },
    { createNodesDispatch },
    { createDefaultNodes },
    ui,
    { setLocale },
    plugin,
  ] = await Promise.all([
    import("../../src/lib/plugins/api"),
    import("../../src/context/store-bridge"),
    import("../../src/context/reducer"),
    import("../../src/lib/nodes"),
    import("../../src/lib/ui/registry"),
    import("../../src/lib/i18n"),
    import("./src/index"),
  ]);
  setLocale("en");
  let nodes!: Store<StackNode[]>;
  const disposers: (() => void)[] = [];
  createRoot(() => {
    const [store, setStore] = createStore<StackNode[]>(createDefaultNodes());
    // the harness hands the store out to the test, outside any scope
    // oxlint-disable-next-line solid/reactivity
    nodes = store;
    disposers.push(bindStore(store, createNodesDispatch(setStore)));
  });
  const api = createPluginApi({
    manifest: {
      id: "reline.sequence",
      name: "x",
      version: "1.0.0",
      api: 1,
      entry: "x.js",
      caps: ["ui", "storage", "run", "config", "store", "i18n"],
    },
    granted: new Set(["ui", "storage", "run", "config", "store", "i18n"]),
    own: (d) => disposers.push(d),
    log: () => {},
  });
  createRoot(() => {
    void plugin.default.activate(api as never);
  });
  const tab = ui.uiRegistry
    .panelTabs()
    .find((t) => t.id === "reline.sequence:sequence")!;
  const view = render(() => <tab.Component selectedUid={() => null} />);
  return { view, api: api as PluginApi, nodes, disposers };
};

const button = (view: ReturnType<typeof render>, name: RegExp) => {
  const found = [...view.container.querySelectorAll("button")].find(
    (b) =>
      name.test(b.textContent ?? "") ||
      name.test(b.getAttribute("aria-label") ?? ""),
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found as HTMLButtonElement;
};
const rows = (view: ReturnType<typeof render>) =>
  view.container.querySelectorAll(".rsq-step");
const tick = async () => {
  await Promise.resolve();
  flush();
  await new Promise((r) => setTimeout(r, 0));
  flush();
};

beforeEach(() => {
  mem = new MemoryStorage();
  vi.stubGlobal("localStorage", mem);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Config sequence plugin", () => {
  it("builds steps from the current stack and runs them one after another", async () => {
    const { view, api, nodes } = await boot();
    fireEvent.click(button(view, /Add current stack/));
    // edit the stack between steps: the second step is a different config
    api.store!.dispatch({ type: "DELETE", payload: nodes[1].uid } as never);
    flush();
    fireEvent.click(button(view, /Add current stack/));
    flush();
    expect(rows(view)).toHaveLength(2);

    fireEvent.click(button(view, /Run sequence/));
    await tick();
    // the first step only: the second waits for the first to end
    expect(fakeRun.started).toHaveLength(1);
    endRun();
    await tick();
    expect(fakeRun.started).toHaveLength(2);
    const [first, second] = fakeRun.started as PureConfig[];
    expect(first.nodes.length).toBe(second.nodes.length + 1);
    endRun();
    await tick();
    const statuses = [...rows(view)].map((r) => r.getAttribute("data-status"));
    expect(statuses).toEqual(["ok", "ok"]);
    expect(view.container.textContent).toContain(
      "Sequence finished: 2 of 2 steps done",
    );
  });

  it("stops at the first failure by default, and carries on when asked to", async () => {
    let w = await boot();
    for (let i = 0; i < 3; i++)
      fireEvent.click(button(w.view, /Add current stack/));
    flush();
    fireEvent.click(button(w.view, /Run sequence/));
    await tick();
    endRun({ ok: false });
    await tick();
    expect(fakeRun.started).toHaveLength(1);
    expect([...rows(w.view)].map((r) => r.getAttribute("data-status"))).toEqual(
      ["failed", "pending", "pending"],
    );

    cleanup();
    w = await boot({ freshStorage: true });
    for (let i = 0; i < 3; i++)
      fireEvent.click(button(w.view, /Add current stack/));
    flush();
    // the last switch on the tab is "stop at the first failure"
    fireEvent.click(w.view.container.querySelectorAll("[role=switch]")[3]!);
    flush();
    fireEvent.click(button(w.view, /Run sequence/));
    await tick();
    endRun({ ok: false });
    await tick();
    endRun();
    await tick();
    endRun();
    await tick();
    expect(fakeRun.started).toHaveLength(3);
    expect([...rows(w.view)].map((r) => r.getAttribute("data-status"))).toEqual(
      ["failed", "ok", "ok"],
    );
  });

  it("only enabled steps run, in list order, and reordering changes the order", async () => {
    const { view, nodes, api } = await boot();
    fireEvent.click(button(view, /Add current stack/));
    api.store!.dispatch({ type: "DELETE", payload: nodes[0].uid } as never);
    flush();
    fireEvent.click(button(view, /Add current stack/));
    api.store!.dispatch({ type: "DELETE", payload: nodes[0].uid } as never);
    flush();
    fireEvent.click(button(view, /Add current stack/));
    flush();
    const sizes = () => rows(view).length;
    expect(sizes()).toBe(3);
    // switch the middle step off, then move the last one to the top
    fireEvent.click(rows(view)[1].querySelector("[role=switch]")!);
    flush();
    fireEvent.click(
      rows(view)[2].querySelector("button[aria-label='Move up']")!,
    );
    flush();
    fireEvent.click(
      rows(view)[1].querySelector("button[aria-label='Move up']")!,
    );
    flush();
    fireEvent.click(button(view, /Run sequence/));
    await tick();
    endRun();
    await tick();
    const lengths = (fakeRun.started as PureConfig[]).map(
      (c) => c.nodes.length,
    );
    // default stack has 7 nodes; the steps hold 7, 6, 5 — after the moves the
    // last (5) is first, then the first (7); the switched-off 6 never ran
    expect(lengths).toEqual([5, 7]);
    endRun();
    await tick();
  });

  it("Stop ends the sequence: the running step is stopped and nothing after it starts", async () => {
    const { view } = await boot();
    for (let i = 0; i < 2; i++)
      fireEvent.click(button(view, /Add current stack/));
    flush();
    fireEvent.click(button(view, /Run sequence/));
    await tick();
    fireEvent.click(button(view, /Stop/));
    expect(fakeRun.stops).toBe(1);
    endRun({ ok: false, cancelled: true });
    await tick();
    expect(fakeRun.started).toHaveLength(1);
    expect([...rows(view)].map((r) => r.getAttribute("data-status"))).toEqual([
      "cancelled",
      "pending",
    ]);
  });

  it("a step that is no longer valid is not sent to the runner", async () => {
    const first = await boot();
    fireEvent.click(button(first.view, /Add current stack/));
    flush();
    await tick();
    // damage the stored step the way a hand edit or an older build could: an
    // option the node's schema rejects
    const key = "reline-web:plugin:reline.sequence:state";
    const saved = JSON.parse(mem.getItem(key)!);
    saved.steps[0].config.nodes[1].options.dtype = "nope";
    mem.setItem(key, JSON.stringify(saved));
    cleanup();
    const second = await boot();
    fireEvent.click(button(second.view, /Run sequence/));
    await tick();
    expect(fakeRun.started).toHaveLength(0);
    expect(rows(second.view)[0].getAttribute("data-status")).toBe("failed");
    expect(rows(second.view)[0].textContent).toContain("invalid");
  });

  it("keeps its steps across a reload", async () => {
    const first = await boot();
    fireEvent.click(button(first.view, /Add current stack/));
    flush();
    await tick();
    cleanup();
    const second = await boot();
    expect(rows(second.view)).toHaveLength(1);
  });

  it("imports config files as steps and reports a file it cannot read", async () => {
    const { view } = await boot();
    // jsdom's File has no `text()`
    const file = (content: string, name: string) =>
      Object.assign(new File([content], name), { text: async () => content });
    const good = file(
      JSON.stringify({
        nodes: [
          {
            type: "level",
            options: {
              low_input: 0,
              high_input: 255,
              low_output: 0,
              high_output: 255,
              gamma: 1,
            },
          },
        ],
        preprocess: [],
      }),
      "night-pass.json",
    );
    const bad = file("not json", "broken.json");
    const input = view.container.querySelector(
      "input[type=file]",
    ) as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [good, bad] });
    fireEvent.input(input);
    await vi.waitFor(() => expect(rows(view)).toHaveLength(1));
    expect(
      (rows(view)[0].querySelector(".rsq-name") as HTMLInputElement).value,
    ).toBe("night-pass");
    expect(view.container.textContent).toContain("broken.json");
  });

  it("a run that is already going fails the step instead of queueing behind it", async () => {
    const { view } = await boot();
    fireEvent.click(button(view, /Add current stack/));
    flush();
    fakeRun.busy = true;
    fireEvent.click(button(view, /Run sequence/));
    await tick();
    expect(rows(view)[0].getAttribute("data-status")).toBe("failed");
    expect(fakeRun.started).toHaveLength(0);
  });
});

describe("the built artifact", () => {
  it("matches the integrity its manifest pins (rebuild with `pnpm plugin:build`)", () => {
    const dir = join(process.cwd(), "public/plugins/sequence");
    const manifest = JSON.parse(
      readFileSync(join(dir, "plugin.json"), "utf8"),
    ) as { integrity: string; entry: string; id: string };
    const code = readFileSync(join(dir, manifest.entry));
    expect(`sha384-${createHash("sha384").update(code).digest("base64")}`).toBe(
      manifest.integrity,
    );
    expect(manifest.id).toBe("reline.sequence");
  });
});
