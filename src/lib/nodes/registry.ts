import { createSignal } from "solid-js";
import { render } from "~/lib/i18n";
import type { NodeDef } from "./types";

/**
 * The registry of node types: the one answer to "what is a node of type X".
 *
 * Reads are reactive (`get`, `menu`, `nodeLabel` inside JSX re-run when a type
 * is defined, patched or hidden), so a plugin that arrives after the first
 * paint updates the screen without a reload. Every mutation returns its own
 * disposer; a plugin unloads by calling the ones it collected.
 *
 * Importing this file alone gives an empty registry. `~/lib/nodes` is the entry
 * the app uses — it also registers the built-in types.
 */
type Dispose = () => void;

interface Patch {
  readonly changes: Partial<NodeDef>;
}

const bases = new Map<string, NodeDef>();
const patches = new Map<string, Patch[]>();
/** Reference counts: two plugins hiding one type need both to let go. */
const hidden = new Map<string, number>();
/** `base` with its patches folded in, oldest first. What every read returns. */
const effective = new Map<string, NodeDef>();
let byPure = new Map<string, NodeDef>();

// The Map answers immediately; the signal only tells subscribers to ask again.
// `ownedWrite`: a plugin defines its types from inside its own reactive root,
// and the registry is shared state, not that root's — the write is intended.
const definedListeners = new Set<(type: string) => void>();
const [revision, setRevision] = createSignal(0, { ownedWrite: true });
const changed = () => setRevision((n) => n + 1);

const recompute = (type: string): void => {
  const base = bases.get(type);
  if (base === undefined) {
    effective.delete(type);
  } else {
    let def = base;
    for (const patch of patches.get(type) ?? [])
      def = { ...def, ...patch.changes };
    // identity can't be patched: it is the key everything else is stored under
    effective.set(type, { ...def, type });
  }
  byPure = new Map(
    [...effective.values()].map((def) => [def.pureType ?? def.type, def]),
  );
  changed();
};

const track = (): void => {
  revision();
};

const removeFrom = <T>(list: T[] | undefined, item: T): void => {
  if (list === undefined) return;
  const at = list.indexOf(item);
  if (at !== -1) list.splice(at, 1);
};

export const nodeRegistry = {
  /** Add a node type. Defining a type that exists replaces it (a hot reload
   * re-runs the definitions); the disposer removes it only if it is still the
   * definition this call put there. */
  define(def: NodeDef): Dispose {
    // a delete first keeps registration order meaningful: the menu lists
    // types in the order they were (last) defined
    bases.delete(def.type);
    bases.set(def.type, def);
    recompute(def.type);
    for (const listener of definedListeners) {
      try {
        listener(def.type);
      } catch {
        // a subscriber's bug must not stop the definition from landing
      }
    }
    return () => {
      if (bases.get(def.type) !== def) return;
      bases.delete(def.type);
      patches.delete(def.type);
      recompute(def.type);
    };
  },

  /** Told after a type is defined (or redefined), with its id — how the store
   * learns that nodes it kept as orphans now have a definition. */
  subscribe(listener: (type: string) => void): Dispose {
    definedListeners.add(listener);
    return () => {
      definedListeners.delete(listener);
    };
  },

  /** Change fields of an existing type (its defaults, its form, its converters).
   * Patches stack in the order they were applied; disposing one leaves the
   * others in place. A patch for a type that is not defined yet takes effect
   * when it is. */
  patch(type: string, changes: Partial<NodeDef>): Dispose {
    const patch: Patch = { changes };
    const list = patches.get(type) ?? [];
    list.push(patch);
    patches.set(type, list);
    recompute(type);
    return () => {
      removeFrom(patches.get(type), patch);
      recompute(type);
    };
  },

  /** Keep a type out of the add and swap menus. Nodes already in the tree are
   * untouched — hiding is for retiring a type, not for deleting data. */
  hide(type: string): Dispose {
    hidden.set(type, (hidden.get(type) ?? 0) + 1);
    changed();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (hidden.get(type) ?? 1) - 1;
      if (left <= 0) hidden.delete(type);
      else hidden.set(type, left);
      changed();
    };
  },

  /** The definition of a stack type, or `undefined` for an orphan. */
  get(type: string): NodeDef | undefined {
    track();
    return effective.get(type);
  },

  /** The definition whose wire type is `pureType`. */
  byPureType(pureType: string): NodeDef | undefined {
    track();
    return byPure.get(pureType);
  },

  /** Every defined type, in definition order. */
  list(): NodeDef[] {
    track();
    return [...effective.values()];
  },

  /** What the add and swap menus offer: defined and not hidden. */
  menu(): NodeDef[] {
    track();
    return [...effective.values()].filter((def) => !hidden.has(def.type));
  },
};

/** The node type's name in the current language. Call it where the name
 * renders — a stored result would freeze the language. An orphan has no
 * definition to name it, so it shows the raw type id. */
export const nodeLabel = (type: string): string => {
  const def = nodeRegistry.get(type);
  return def === undefined ? type : render(def.label);
};

export interface NodeMenuEntry {
  type: string;
  /** What the menu shows. Unique within one call: two types that share a name
   * (a plugin reusing a built-in's) are told apart by their id. */
  text: string;
}

/** The add and swap menus' entries, in the current language. A picked entry
 * is resolved back to its `type` through the same list, so the identity never
 * depends on the name being unique in the dictionaries. */
export const nodeMenuEntries = (exclude?: string): NodeMenuEntry[] => {
  const defs = nodeRegistry.menu().filter((def) => def.type !== exclude);
  const labels = defs.map((def) => render(def.label));
  return defs.map((def, index) => ({
    type: def.type,
    text:
      labels.indexOf(labels[index]) === labels.lastIndexOf(labels[index])
        ? labels[index]
        : `${labels[index]} (${def.type})`,
  }));
};
