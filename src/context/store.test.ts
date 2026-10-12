import * as v from "valibot";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, createStore, flush, type Store } from "solid-js";
import { createNodesDispatch } from "~/context/reducer";
import { onStoreAction, storeActions } from "~/context/actions";
import { bindStore, dispatchAction, stackNodes } from "~/context/store-bridge";
import { raw } from "~/lib/i18n";
import { convertToPure, convertToStack } from "~/lib/convert";
import { createNode, nodeRegistry } from "~/lib/nodes";
import { sanitizeNode } from "~/lib/node-shape";
import { pipeline } from "~/lib/pipeline";
import { NodesActionType } from "~/types/actions";
import type { StackNode } from "~/types/node";

/** The store is open: plugins add actions, may rewrite or refuse any action,
 * observe the result, keep data on a node — and the stack survives all of it. */
const undo: (() => void)[] = [];
afterEach(() => {
  while (undo.length > 0) undo.pop()?.();
});

const setup = (seed: StackNode[]) => {
  let result!: {
    nodes: Store<StackNode[]>;
    dispatch: ReturnType<typeof createNodesDispatch>;
  };
  createRoot(() => {
    const [nodes, setNodes] = createStore<StackNode[]>(seed);
    result = { nodes, dispatch: createNodesDispatch(setNodes) };
  });
  return result;
};
const level = (uid: string): StackNode => ({
  ...createNode("level")!,
  uid,
});

describe("plugin actions", () => {
  it("runs a plugin's reducer on the store and tells observers", () => {
    const { nodes, dispatch } = setup([level("a"), level("b")]);
    undo.push(
      storeActions.define("acme:reverse", (state) => {
        const reversed = [...state].reverse();
        state.splice(0, state.length, ...reversed);
      }),
    );
    const heard: string[] = [];
    undo.push(onStoreAction((action) => heard.push(action.type)));
    dispatch({ type: "acme:reverse" });
    flush();
    expect(nodes.map((n) => n.uid)).toEqual(["b", "a"]);
    expect(heard).toEqual(["acme:reverse"]);
  });

  it("an unknown action does nothing and is not announced", () => {
    const { nodes, dispatch } = setup([level("a")]);
    const heard: string[] = [];
    undo.push(onStoreAction((action) => heard.push(action.type)));
    dispatch({ type: "acme:nothing" });
    expect(nodes).toHaveLength(1);
    expect(heard).toEqual([]);
  });

  it("a throwing reducer is recorded and costs the caller nothing", () => {
    const { nodes, dispatch } = setup([level("a")]);
    undo.push(
      storeActions.define("acme:boom", () => {
        throw new Error("kaput");
      }),
    );
    const heard: string[] = [];
    undo.push(onStoreAction((action) => heard.push(action.type)));
    expect(() => dispatch({ type: "acme:boom" })).not.toThrow();
    flush();
    expect(nodes).toHaveLength(1);
    expect(heard).toEqual([]);
    expect(pipeline.failures().at(-1)).toMatchObject({
      stage: "store.reducer",
      id: "acme:boom",
      message: "kaput",
    });
  });

  it("a broken observer does not stop the others", () => {
    const { dispatch } = setup([level("a")]);
    undo.push(storeActions.define("acme:ok", () => {}));
    undo.push(
      onStoreAction(() => {
        throw new Error("observer");
      }),
    );
    const heard: string[] = [];
    undo.push(onStoreAction((action) => heard.push(action.type)));
    dispatch({ type: "acme:ok" });
    expect(heard).toEqual(["acme:ok"]);
  });
});

describe("store.action hooks", () => {
  it("can refuse an action", () => {
    const { nodes, dispatch } = setup([level("a"), level("b")]);
    undo.push(
      pipeline.use("store.action", (action) =>
        action.type === NodesActionType.DELETE ? null : undefined,
      ),
    );
    dispatch({ type: NodesActionType.DELETE, payload: "a" });
    flush();
    expect(nodes).toHaveLength(2);
  });

  it("can rewrite an action", () => {
    const { nodes, dispatch } = setup([level("a")]);
    undo.push(
      pipeline.use("store.action", (action) =>
        action.type === NodesActionType.CHANGE
          ? {
              ...action,
              payload: { ...(action.payload as object), name: "renamed" },
            }
          : undefined,
      ),
    );
    dispatch({ type: NodesActionType.CHANGE, payload: { uid: "a" } });
    flush();
    expect(nodes[0].name).toBe("renamed");
  });

  it("a hook that breaks an action's payload is contained", () => {
    const { nodes, dispatch } = setup([level("a")]);
    undo.push(
      pipeline.use("store.action", () => ({
        type: NodesActionType.MOVE,
        payload: null,
      })),
    );
    expect(() =>
      dispatch({ type: NodesActionType.DELETE, payload: "a" }),
    ).not.toThrow();
    flush();
    expect(nodes).toHaveLength(1);
  });
});

describe("node ext", () => {
  it("CHANGE merges ext per plugin id in place", () => {
    const { nodes, dispatch } = setup([level("a")]);
    dispatch({
      type: NodesActionType.CHANGE,
      payload: { uid: "a", ext: { "acme.tags": ["x"] } },
    });
    dispatch({
      type: NodesActionType.CHANGE,
      payload: { uid: "a", ext: { "acme.note": "n" } },
    });
    flush();
    expect(nodes[0].ext).toEqual({ "acme.tags": ["x"], "acme.note": "n" });
  });

  it("travels through export and import, and survives an unknown plugin", () => {
    const node = level("a");
    node.ext = { "acme.tags": ["x"] };
    const config = convertToPure([node]);
    expect(config.nodes[0].meta?.ext).toEqual({ "acme.tags": ["x"] });
    const back = convertToStack(JSON.parse(JSON.stringify(config)));
    expect(back[0].ext).toEqual({ "acme.tags": ["x"] });
    expect(sanitizeNode({ type: "level", ext: { k: 1 } })?.ext).toEqual({
      k: 1,
    });
    expect(sanitizeNode({ type: "level", ext: [1] })?.ext).toBeUndefined();
    expect(sanitizeNode({ type: "level", ext: {} })?.ext).toBeUndefined();
  });
});

describe("orphan adoption", () => {
  it("a type defined later gets the checks any node of it gets", async () => {
    const { nodes, dispatch } = setup([
      sanitizeNode({
        type: "test.late",
        uid: "o",
        options: { strength: "high" },
      })!,
    ]);
    undo.push(bindStore(nodes, dispatch));
    expect(nodes[0].options).toEqual({ strength: "high" });
    undo.push(
      nodeRegistry.define({
        type: "test.late",
        label: raw("Late"),
        defaults: () => ({ strength: 1, mode: "fast" }),
        schema: v.object({ strength: v.number(), mode: v.string() }),
      }),
    );
    // adoption is deferred out of the definer's reactive scope
    await Promise.resolve();
    flush();
    // the stored string fails the schema → default; the missing key is filled
    expect(nodes[0].options).toEqual({ strength: 1, mode: "fast" });
  });

  it("the bridge hands out the bound store and routes dispatches through the hooks", () => {
    const { nodes, dispatch } = setup([level("a")]);
    undo.push(bindStore(nodes, dispatch));
    expect(stackNodes()).toBe(nodes);
    undo.push(pipeline.use("store.action", () => null));
    dispatchAction({ type: NodesActionType.DELETE, payload: "a" });
    flush();
    expect(nodes).toHaveLength(1);
  });
});
