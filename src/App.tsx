import { type Component, createEffect, createStore, onSettled } from "solid-js";
import { NodeType } from "~/types/enums";
import { ensureUids } from "~/lib/uid";
import { preloadModelNames } from "~/lib/model-db";
import { STORAGE_KEY, createDefaultNodes } from "~/constants";
import { locale } from "~/lib/i18n";
import type { StackNode } from "~/types/node";
import { createNodesDispatch } from "~/context/reducer";
import { NodesContext, NodesDispatchContext } from "~/context/contexts";
import { Workspace } from "~/routes/workspace/workspace";
import "~/styles/global.scss";

const loadNodes = (): StackNode[] => {
  const known = new Set<string>(Object.values(NodeType));
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // drop node types this build no longer knows (e.g. removed experiments)
      const parsed = (JSON.parse(raw) as StackNode[]).filter((n) =>
        known.has(n.type),
      );
      return ensureUids(parsed);
    }
  } catch {
    // corrupted storage — fall through to defaults
  }
  return ensureUids(createDefaultNodes());
};

const App: Component = () => {
  const [nodes, setNodes] = createStore<StackNode[]>(loadNodes());
  const dispatch = createNodesDispatch(setNodes);

  // Warm the remote model index once, in the background: model completion and
  // name resolution read it synchronously, so the first focus on a model field
  // no longer waits for the network (and the legacy-config import can look up
  // download links right away).
  onSettled(() => {
    void preloadModelNames();
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
        try {
          localStorage.setItem(STORAGE_KEY, json);
        } catch {
          // storage full or unavailable — keep the app usable
        }
      }, 300);
      // cancel a pending write before the next run (and on disposal)
      return () => clearTimeout(saveTimer);
    },
  );

  return (
    <NodesContext value={nodes}>
      <NodesDispatchContext value={dispatch}>
        <main>
          <Workspace />
        </main>
      </NodesDispatchContext>
    </NodesContext>
  );
};

export default App;
