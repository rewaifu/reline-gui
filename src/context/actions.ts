import type { StackNode } from "~/types/node";

/** What a plugin's action does to the stack: mutate the list in place (a keyed
 * write, like the editor's own reducer) or return a replacement. */
export type ActionReducer = (
  nodes: StackNode[],
  payload: unknown,
) => StackNode[] | void;

type Dispose = () => void;

const reducers = new Map<string, ActionReducer>();

/** Actions plugins add to the store. The editor's own are not here: a plugin
 * cannot redefine `CHANGE`, only intercept it (`pipeline.use("store.action")`). */
export const storeActions = {
  define(type: string, reducer: ActionReducer): Dispose {
    reducers.set(type, reducer);
    return () => {
      if (reducers.get(type) === reducer) reducers.delete(type);
    };
  },
  get: (type: string): ActionReducer | undefined => reducers.get(type),
};

type Observer = (action: { type: string; payload?: unknown }) => void;
const observers = new Set<Observer>();

/** Told after every action that went through, in order. */
export const onStoreAction = (observer: Observer): Dispose => {
  observers.add(observer);
  return () => {
    observers.delete(observer);
  };
};

export const notifyObservers = (action: {
  type: string;
  payload?: unknown;
}): void => {
  for (const observer of observers) {
    try {
      observer(action);
    } catch {
      // an observer's bug must not undo an action that already happened
    }
  }
};
