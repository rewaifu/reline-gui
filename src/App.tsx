import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  createSignal,
  createStore,
  Errored,
  onCleanup,
  onSettled,
  untrack,
} from "solid-js";
import { sanitizeNodes } from "~/lib/node-shape";
import { storage } from "~/lib/storage";
import { preloadModelNames } from "~/lib/model-db";
import { STORAGE_KEY } from "~/constants";
import { createDefaultNodes } from "~/lib/nodes";
import { locale } from "~/lib/i18n";
import { RUN_ID_KEY, runClient } from "~/lib/run-client";
import { faviconStatusFor, syncFavicon } from "~/lib/favicon-status";
import type { StackNode } from "~/types/node";
import { createNodesDispatch } from "~/context/reducer";
import { pluginRuntime } from "~/lib/plugins/runtime";
import { bindStore } from "~/context/store-bridge";
import {
  AnalysisContext,
  NodesContext,
  NodesDispatchContext,
} from "~/context/contexts";
import { analyze } from "~/lib/config";
import { Crash } from "~/components/crash/crash";
import {
  createWatchdog,
  rememberErrors,
  rememberedError,
  showHaltOverlay,
} from "~/lib/ui-watchdog";
import { Workspace } from "~/routes/workspace/workspace";
import "~/styles/global.scss";

const loadNodes = (): StackNode[] => {
  // Every entry is parsed, not trusted: a tree written by an older build,
  // truncated by a full quota or hand-edited carries shapes the forms read
  // during render, and a throw there halts the whole reactive system.
  // Unreadable storage and corrupt JSON both come back as `undefined`.
  const nodes = sanitizeNodes(storage.getJson(STORAGE_KEY));
  return nodes.length > 0 ? nodes : createDefaultNodes();
};

const App: Component = () => {
  const [nodes, setNodes] = createStore<StackNode[]>(
    // a one-time snapshot: reading the node registry here is not a subscription
    untrack(loadNodes),
  );
  const dispatch = createNodesDispatch(setNodes);
  // code outside the component tree (plugins) reaches the stack through this
  onCleanup(bindStore(nodes, dispatch));
  // `analyze` never throws for node data, which is what makes it safe here: an
  // exception inside a memo halts Solid's whole reactive system
  const analysis = createMemo(() => analyze([...nodes]));
  // the probe: a signal written by a timer and rendered into one hidden node
  const [beat, setBeat] = createSignal(0);
  let beats = 0;
  let probe: HTMLSpanElement | undefined;

  // Warm the remote model index once, in the background: model completion and
  // name resolution read it synchronously, so the first focus on a model field
  // no longer waits for the network (and the legacy-config import can look up
  // download links right away).
  onSettled(() => {
    void preloadModelNames();
    // after the stack is bound and the watchdog below is about to run: a plugin
    // that halts the page is caught by it, and the next start skips that plugin
    void pluginRuntime.start();
    // A reload in the middle of a run must not orphan it: the server keeps
    // the job detached and the run id survived in storage, so ask the server
    // where it stands instead of leaving a dead bar behind.
    if (storage.get(RUN_ID_KEY) !== undefined) runClient.recover();
    // A halt is invisible: the page paints, the inputs ignore the keyboard, and
    // the error that caused it is already behind us. The watchdog watches for
    // exactly that, and the listener keeps the cause around for the overlay.
    const forget = rememberErrors();
    const watchdog = createWatchdog({
      beat: () => {
        beats += 1;
        setBeat(beats);
        return String(beats);
      },
      rendered: () => probe?.textContent ?? null,
      onStall: () => {
        pluginRuntime.markStalled();
        // a plugin is the likeliest cause of a halt it can be switched off for:
        // the overlay offers that way out only when there is something to turn off
        showHaltOverlay(rememberedError(), {
          onDisablePlugins: pluginRuntime.hasEnabled()
            ? () => pluginRuntime.disableAllStored()
            : undefined,
        });
      },
      // the plugins that started are not what stops the page
      onHealthy: () => pluginRuntime.confirmHealthy(),
    });
    watchdog.start();
    return () => {
      watchdog.stop();
      forget();
    };
  });

  // The document language drives hyphenation, spell-check and which voice a
  // screen reader uses — a Russian page announced as English is unreadable
  // with a screen reader, so it follows the switcher.
  createEffect(
    () => locale(),
    (lang) => {
      document.documentElement.lang = lang;
    },
  );
  // Tab-icon run status: the panda stays only while idle — a busy run draws
  // a progress ring over it, a finished one a green check, a failed one a
  // red cross. The journal outlives the run, so the outcome badge survives
  // until the next start.
  createEffect(
    () => ({
      phase: runClient.phase(),
      percent: runClient.progress()?.percent,
      last: runClient.messages().at(-1)?.kind,
    }),
    ({ phase, percent, last }) => {
      syncFavicon(faviconStatusFor(phase, percent, last));
    },
  );

  // Single write path for persistence: any store change lands in localStorage.
  // The compute must read through the store proxy: `snapshot()` is untracked,
  // so wrapping it here would only persist the initial state. The write is
  // debounced: serialisation subscribes to every option leaf, so typing in a
  // number field would otherwise block the main thread once per keystroke.
  let saveTimer: number | undefined;
  createEffect(
    () => JSON.stringify(nodes),
    (json) => {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        // a full or blocked storage keeps the app usable: the write is lost
        storage.set(STORAGE_KEY, json);
      }, 300);
      // cancel a pending write before the next run (and on disposal)
      return () => clearTimeout(saveTimer);
    },
  );

  return (
    <NodesContext value={nodes}>
      <NodesDispatchContext value={dispatch}>
        <AnalysisContext value={analysis}>
          <main>
            {/* An uncaught error anywhere below halts Solid's reactive system:
              every later update is ignored, which reads as "the page froze,
              nothing types". The boundary keeps the blast radius to the
              workspace and puts the stack on screen.
              It has to be the JSX form: a child created imperatively
              (`createErrorBoundary(() => <Workspace/>)`) renders outside the
              context providers above and dies on `useContext`. */}
            <Errored
              fallback={(error: Accessor<unknown>) => {
                console.error("workspace crashed", error());
                return <Crash error={error} />;
              }}
            >
              <Workspace />
            </Errored>
            {/* read by the watchdog: if this stops following the timer, the
              reactive system is gone and nothing else on the page will move */}
            <span ref={probe} hidden>
              {String(beat())}
            </span>
          </main>
        </AnalysisContext>
      </NodesDispatchContext>
    </NodesContext>
  );
};

export default App;
