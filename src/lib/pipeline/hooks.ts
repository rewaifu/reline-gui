import { createSignal } from "solid-js";
import * as v from "valibot";
import { OptionsBagSchema } from "~/types/node";
import type { PureConfig, PureNode, StackNode } from "~/types/node";
import type { AnyAction } from "~/types/actions";
import type { Frame } from "~/lib/ws/codec";
import type { Diagnostic } from "./types";

/**
 * The stages a config passes through, and the chain of hooks that may adjust it
 * at each one. A hook is plain code from outside the app (a plugin), so the
 * runner treats it as untrusted: a throw, a wrong-shaped result or a hang is
 * caught, recorded and skipped — it must never reach the caller, which is often
 * a memo, where an exception halts Solid's whole reactive system.
 *
 * Every transform stage is "value in, value out": returning nothing leaves the
 * value as it was (mutating in place is fine), returning a value of the right
 * shape replaces it.
 */
export interface StageHooks {
  /** The parsed JSON of a pasted or uploaded config, before it is read as one. */
  "import.parse": (raw: unknown) => unknown;
  /** The nodes an import carries, before the built-in checks run on them.
   * Migrate renamed types or old option shapes here; the result is still
   * sanitised afterwards. */
  "import.sanitize": (nodes: unknown[]) => unknown[];
  /** Findings about the current stack. Results of all hooks are concatenated. */
  validate: (nodes: readonly StackNode[]) => readonly Diagnostic[] | void;
  /** The wire entries one node produced (its own plus any it spawned). */
  "toPure.node": (pure: PureNode[], node: StackNode) => PureNode[] | void;
  /** The whole config once every node has been serialised. */
  "toPure.config": (
    config: PureConfig,
    nodes: readonly StackNode[],
  ) => PureConfig | void;
  /** The config as it goes to the runner — the only stage that may be async
   * (look something up, ask the user). Throwing here refuses nothing: use a
   * `validate` hook to stop a run. */
  beforeRun: (
    config: PureConfig,
    nodes: readonly StackNode[],
  ) => PureConfig | void | Promise<PureConfig | void>;
  /** The JSON text shown in the Code tab, copied and downloaded. */
  "export.serialize": (text: string, config: PureConfig) => string | void;
  /** A frame about to leave for the runner (heartbeats excluded). Return
   * `null` to swallow it. */
  "ws.send": (frame: Frame) => Frame | null | void;
  /** A frame that arrived from the runner, before anything reads it
   * (heartbeats excluded). Return `null` to swallow it. */
  "ws.receive": (frame: Frame) => Frame | null | void;
  /** An action about to change the stack — the editor's own (`ADD`, `CHANGE`,
   * …) or a plugin's. Return a replacement, or `null` to refuse it. */
  "store.action": (action: AnyAction) => AnyAction | null | void;
}

export type Stage = keyof StageHooks;
/** Stages whose hooks may swallow the value by returning `null`. */
type FilterStage = "ws.send" | "ws.receive" | "store.action";
type TransformStage = Exclude<Stage, "validate" | "beforeRun" | FilterStage>;
type FilterValue<S extends FilterStage> = Parameters<StageHooks[S]>[0];
type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : [];
type ValueOf<S extends TransformStage> = Parameters<StageHooks[S]>[0];
type ExtraOf<S extends TransformStage> = Tail<Parameters<StageHooks[S]>>;

export interface HookOptions {
  /** Unique within a stage; defining it again replaces the hook (a plugin
   * reload). Generated when omitted. */
  id?: string;
  /** Run before the hook with this id (same stage). */
  before?: string;
  /** Run after the hook with this id (same stage). */
  after?: string;
  /** Async stages only: how long a hook may take. Default 10 s. */
  timeoutMs?: number;
}

export interface HookFailure {
  /** The stage, `store.reducer` for a plugin's action reducer, `ui` for a
   * plugin component that threw while rendering, `nodes` for a plugin's node
   * definition callback. */
  stage: Stage | "store.reducer" | "ui" | "nodes";
  id: string;
  at: number;
  message: string;
  /** This failure was the last strike: the hook is switched off. */
  disabled: boolean;
}

export interface HookStatus {
  stage: Stage;
  id: string;
  strikes: number;
  disabled: boolean;
}

type Dispose = () => void;

interface Entry {
  readonly stage: Stage;
  readonly id: string;
  readonly fn: (...args: never[]) => unknown;
  readonly before?: string;
  readonly after?: string;
  readonly timeoutMs: number;
  strikes: number;
  disabled: boolean;
}

/** Consecutive failures after which a hook is switched off: a hook that throws
 * on every keystroke would otherwise cost an exception per edit forever. */
const MAX_STRIKES = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_FAILURES_KEPT = 50;

const PureNodeShape = v.looseObject({
  type: v.string(),
  options: OptionsBagSchema,
});
const PureConfigShape = v.looseObject({
  nodes: v.array(PureNodeShape),
  preprocess: v.array(PureNodeShape),
  postprocess: v.optional(v.array(PureNodeShape)),
});
const FrameShape = v.looseObject({
  m: v.string(),
  id: v.optional(v.number()),
  d: v.optional(OptionsBagSchema),
});
const DiagnosticShape = v.looseObject({
  code: v.string(),
  severity: v.picklist(["error", "warn"]),
  message: v.union([
    v.string(),
    v.looseObject({ key: v.string() }),
    v.looseObject({ raw: v.string() }),
  ]),
  uid: v.optional(v.string()),
  path: v.optional(v.string()),
});

/** What a hook may hand back at each stage. */
const ACCEPTS: Record<Stage, v.GenericSchema> = {
  "import.parse": v.unknown(),
  "import.sanitize": v.array(v.unknown()),
  validate: v.array(DiagnosticShape),
  "toPure.node": v.array(PureNodeShape),
  "toPure.config": PureConfigShape,
  beforeRun: PureConfigShape,
  "export.serialize": v.string(),
  "ws.send": v.nullable(FrameShape),
  "ws.receive": v.nullable(FrameShape),
  "store.action": v.nullable(v.looseObject({ type: v.string() })),
};

const entries = new Map<Stage, Entry[]>();
let anonymous = 0;

// `ownedWrite`: hooks are registered from inside a plugin's reactive root, and
// a failure is recorded from inside whichever memo called the stage.
const [failures, setFailures] = createSignal<readonly HookFailure[]>([], {
  ownedWrite: true,
});

const record = (entry: Entry, error: unknown): void => {
  entry.strikes += 1;
  if (entry.strikes >= MAX_STRIKES) entry.disabled = true;
  const failure: HookFailure = {
    stage: entry.stage,
    id: entry.id,
    at: Date.now(),
    message: error instanceof Error ? error.message : String(error),
    disabled: entry.disabled,
  };
  setFailures((all) => [...all, failure].slice(-MAX_FAILURES_KEPT));
};

/** Registration order, bent by `before` / `after`. A constraint naming a hook
 * that is not there is ignored, and a cycle falls back to registration order
 * for what is left — a plugin's typo must not stop the others from running. */
const ordered = (stage: Stage): Entry[] => {
  const list = (entries.get(stage) ?? []).filter((entry) => !entry.disabled);
  if (
    !list.some(
      (entry) => entry.before !== undefined || entry.after !== undefined,
    )
  )
    return list;
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const after = new Map<Entry, Set<Entry>>(list.map((e) => [e, new Set()]));
  for (const entry of list) {
    const later = entry.after === undefined ? undefined : byId.get(entry.after);
    if (later !== undefined) after.get(entry)?.add(later);
    const earlier =
      entry.before === undefined ? undefined : byId.get(entry.before);
    if (earlier !== undefined) after.get(earlier)?.add(entry);
  }
  const result: Entry[] = [];
  const placed = new Set<Entry>();
  while (result.length < list.length) {
    const ready = list.find(
      (entry) =>
        !placed.has(entry) &&
        [...(after.get(entry) ?? [])].every((dep) => placed.has(dep)),
    );
    const next = ready ?? list.find((entry) => !placed.has(entry));
    if (next === undefined) break;
    placed.add(next);
    result.push(next);
  }
  return result;
};

/** The hook's result if it is acceptable at this stage, `undefined` (and a
 * strike) when it is not; `undefined` from the hook itself means "unchanged". */
const accept = (entry: Entry, result: unknown): unknown => {
  if (result === undefined) {
    entry.strikes = 0;
    return undefined;
  }
  const parsed = v.safeParse(ACCEPTS[entry.stage], result);
  if (parsed.success) {
    entry.strikes = 0;
    return result;
  }
  record(entry, new Error(`returned the wrong shape for "${entry.stage}"`));
  return undefined;
};

const callSync = (entry: Entry, args: unknown[]): unknown => {
  try {
    const result = (entry.fn as (...a: unknown[]) => unknown)(...args);
    if (result instanceof Promise) {
      // a promise in a sync stage can never be awaited: drop it, and say why
      result.catch(() => {});
      record(entry, new Error(`"${entry.stage}" hooks must be synchronous`));
      return undefined;
    }
    return accept(entry, result);
  } catch (error) {
    record(entry, error);
    return undefined;
  }
};

const callAsync = async (entry: Entry, args: unknown[]): Promise<unknown> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve((entry.fn as (...a: unknown[]) => unknown)(...args)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${entry.timeoutMs} ms`)),
          entry.timeoutMs,
        );
      }),
    ]);
    return accept(entry, result);
  } catch (error) {
    record(entry, error);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
};

export const pipeline = {
  /** Add a hook to a stage. The disposer removes exactly this hook. */
  use<S extends Stage>(
    stage: S,
    fn: StageHooks[S],
    options: HookOptions = {},
  ): Dispose {
    anonymous += 1;
    const id = options.id ?? `hook-${anonymous}`;
    const entry: Entry = {
      stage,
      id,
      fn: fn as Entry["fn"],
      before: options.before,
      after: options.after,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      strikes: 0,
      disabled: false,
    };
    const list = (entries.get(stage) ?? []).filter((e) => e.id !== id);
    list.push(entry);
    entries.set(stage, list);
    return () => {
      const current = entries.get(stage);
      const at = current?.indexOf(entry) ?? -1;
      if (at !== -1) current?.splice(at, 1);
    };
  },

  /** Run a synchronous transform stage. Never throws. */
  apply<S extends TransformStage>(
    stage: S,
    value: ValueOf<S>,
    ...extra: ExtraOf<S>
  ): ValueOf<S> {
    let current: unknown = value;
    for (const entry of ordered(stage)) {
      const next = callSync(entry, [current, ...extra]);
      if (next !== undefined) current = next;
    }
    return current as ValueOf<S>;
  },

  /** Run a filter stage. `null` means a hook swallowed the value. Never throws. */
  filter<S extends FilterStage>(
    stage: S,
    value: FilterValue<S>,
  ): FilterValue<S> | null {
    let current: unknown = value;
    for (const entry of ordered(stage)) {
      const next = callSync(entry, [current]);
      if (next === null) return null;
      if (next !== undefined) current = next;
    }
    return current as FilterValue<S>;
  },

  /** Run the `validate` hooks and concatenate what they found. Never throws. */
  collect(nodes: readonly StackNode[]): Diagnostic[] {
    const found: Diagnostic[] = [];
    for (const entry of ordered("validate")) {
      const result = callSync(entry, [nodes]);
      if (Array.isArray(result)) found.push(...(result as Diagnostic[]));
    }
    return found;
  },

  /** Run the async `beforeRun` stage. Never rejects. */
  async applyAsync(
    config: PureConfig,
    nodes: readonly StackNode[],
  ): Promise<PureConfig> {
    let current: unknown = config;
    for (const entry of ordered("beforeRun")) {
      const next = await callAsync(entry, [current, nodes]);
      if (next !== undefined) current = next;
    }
    return current as PureConfig;
  },

  /** Record a failure of plugin code that is not a stage hook (an action
   * reducer): same journal, no strikes — the caller decides what to do. */
  report(source: HookFailure["stage"], id: string, error: unknown): void {
    setFailures((all) =>
      [
        ...all,
        {
          stage: source,
          id,
          at: Date.now(),
          message: error instanceof Error ? error.message : String(error),
          disabled: false,
        },
      ].slice(-MAX_FAILURES_KEPT),
    );
  },

  /** Hooks that threw, returned nonsense or hung — newest last. Reactive. */
  failures(): readonly HookFailure[] {
    return failures();
  },

  /** Every registered hook with its strike count, for a diagnostics screen. */
  status(): HookStatus[] {
    return [...entries.values()].flat().map((entry) => ({
      stage: entry.stage,
      id: entry.id,
      strikes: entry.strikes,
      disabled: entry.disabled,
    }));
  },

  /** Switch a hook that struck out back on. */
  reenable(stage: Stage, id: string): void {
    const entry = entries.get(stage)?.find((e) => e.id === id);
    if (entry === undefined) return;
    entry.strikes = 0;
    entry.disabled = false;
  },
};
