import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pipeline } from "~/lib/pipeline";
import type { PureConfig } from "~/types/node";

/** Hooks are code from outside the app. The runner's contract: what a hook does
 * wrong never reaches the caller (often a memo), and a hook that keeps doing it
 * is switched off. */
const undo: (() => void)[] = [];
const use = ((...args: Parameters<typeof pipeline.use>) => {
  const dispose = pipeline.use(...args);
  undo.push(dispose);
  return dispose;
}) as typeof pipeline.use;
afterEach(() => {
  while (undo.length > 0) undo.pop()?.();
  vi.useRealTimers();
});

/** Signal writes are deferred in Solid 2: settle them before reading. */
const failures = () => {
  flush();
  return pipeline.failures();
};

const CONFIG = (): PureConfig => ({
  nodes: [],
  preprocess: [],
  postprocess: [],
});

describe("transform stages", () => {
  it("passes the value through hooks in registration order", () => {
    use("export.serialize", (text) => `${text}a`, { id: "a" });
    use("export.serialize", (text) => `${text}b`, { id: "b" });
    expect(pipeline.apply("export.serialize", ">", CONFIG())).toBe(">ab");
  });

  it("returning nothing keeps the value; mutating in place counts", () => {
    use("toPure.node", (pure) => {
      pure[0].options.touched = true;
    });
    const out = pipeline.apply("toPure.node", [{ type: "x", options: {} }], {
      uid: "u",
      type: "x",
      options: {},
      collapsed: true,
    });
    expect(out[0].options).toEqual({ touched: true });
  });

  it("honours before / after, ignores a constraint on a missing hook", () => {
    use("export.serialize", (t) => `${t}1`, { id: "one", after: "two" });
    use("export.serialize", (t) => `${t}2`, { id: "two" });
    use("export.serialize", (t) => `${t}3`, { id: "three", before: "nothing" });
    expect(pipeline.apply("export.serialize", "", CONFIG())).toBe("213");
  });

  it("falls back to registration order on a cycle instead of dropping hooks", () => {
    use("export.serialize", (t) => `${t}a`, { id: "a", after: "b" });
    use("export.serialize", (t) => `${t}b`, { id: "b", after: "a" });
    expect(pipeline.apply("export.serialize", "", CONFIG())).toHaveLength(2);
  });

  it("defining an id again replaces the hook; a stale disposer is harmless", () => {
    const first = use("export.serialize", (t) => `${t}1`, { id: "same" });
    use("export.serialize", (t) => `${t}2`, { id: "same" });
    first();
    expect(pipeline.apply("export.serialize", "", CONFIG())).toBe("2");
  });
});

describe("a misbehaving hook", () => {
  it("is caught, recorded, and does not stop the others", () => {
    use(
      "export.serialize",
      () => {
        throw new Error("boom");
      },
      { id: "thrower" },
    );
    use("export.serialize", (t) => `${t}ok`, { id: "fine" });
    expect(pipeline.apply("export.serialize", "", CONFIG())).toBe("ok");
    expect(failures().at(-1)).toMatchObject({
      stage: "export.serialize",
      id: "thrower",
      message: "boom",
      disabled: false,
    });
  });

  it("returning the wrong shape is a failure and the value is kept", () => {
    use("toPure.config", (() => ({ nodes: "nope" })) as never, { id: "bad" });
    const config = CONFIG();
    expect(pipeline.apply("toPure.config", config, [])).toBe(config);
    expect(failures().at(-1)?.id).toBe("bad");
  });

  it("an async function in a sync stage is refused", () => {
    use("export.serialize", (async () => "x") as never, { id: "async" });
    expect(pipeline.apply("export.serialize", "t", CONFIG())).toBe("t");
    expect(failures().at(-1)?.message).toContain("synchronous");
  });

  it("is switched off after three strikes, and can be switched back on", () => {
    let calls = 0;
    use(
      "export.serialize",
      () => {
        calls += 1;
        throw new Error("again");
      },
      { id: "flaky" },
    );
    for (let i = 0; i < 5; i++)
      pipeline.apply("export.serialize", "", CONFIG());
    expect(calls).toBe(3);
    expect(pipeline.status().find((h) => h.id === "flaky")).toMatchObject({
      disabled: true,
    });
    pipeline.reenable("export.serialize", "flaky");
    pipeline.apply("export.serialize", "", CONFIG());
    expect(calls).toBe(4);
  });

  it("a success resets the strikes", () => {
    let fail = true;
    use(
      "export.serialize",
      () => {
        if (fail) throw new Error("x");
      },
      { id: "recovering" },
    );
    pipeline.apply("export.serialize", "", CONFIG());
    pipeline.apply("export.serialize", "", CONFIG());
    fail = false;
    pipeline.apply("export.serialize", "", CONFIG());
    expect(pipeline.status().find((h) => h.id === "recovering")?.strikes).toBe(
      0,
    );
  });
});

describe("validate and beforeRun", () => {
  it("collects every hook's findings and drops malformed ones", () => {
    use("validate", () => [
      { code: "p.one", severity: "warn", message: "diag.empty" },
    ]);
    use("validate", (() => [{ nope: true }]) as never);
    expect(pipeline.collect([]).map((d) => d.code)).toEqual(["p.one"]);
  });

  it("beforeRun may be async and rewrites the config", async () => {
    use("beforeRun", async (config) => ({
      ...config,
      preprocess: [{ type: "p", options: {} }],
    }));
    const out = await pipeline.applyAsync(CONFIG(), []);
    expect(out.preprocess).toHaveLength(1);
  });

  it("a hanging beforeRun hook times out and the config goes out as it was", async () => {
    vi.useFakeTimers();
    use("beforeRun", () => new Promise<void>(() => {}), {
      id: "hang",
      timeoutMs: 50,
    });
    const config = CONFIG();
    const pending = pipeline.applyAsync(config, []);
    await vi.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toBe(config);
    expect(failures().at(-1)?.message).toContain("timed out");
  });

  it("a rejecting beforeRun hook never rejects the run", async () => {
    use("beforeRun", async () => {
      throw new Error("no");
    });
    await expect(pipeline.applyAsync(CONFIG(), [])).resolves.toBeDefined();
  });
});
