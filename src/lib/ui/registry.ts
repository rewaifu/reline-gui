import { createSignal } from "solid-js";
import type { Component } from "solid-js";
import type { LocalText } from "~/lib/i18n";
import type { StackNode } from "~/types/node";
import type { NodeCardProps } from "~/components/node-card/node-card";
import type { AddNodeMenuProps } from "~/components/nodes-list/add-node-menu";
import type { NodeFormProps } from "~/components/nodes/node-options-form";

/**
 * What plugins add to the screen, held as data: slot contributions, settings
 * panel tabs, replacements of host components, and style sheets. The components
 * that render them (`Slot`, `overridable`, the panel) live in `~/components`;
 * this file has no JSX so the registry can be read from anywhere — tests, a
 * plugin's activation — without pulling the UI in.
 *
 * Reads are reactive; every mutation returns its own disposer.
 */
type Dispose = () => void;

/** What each slot's host passes to its contributions. */
export interface SlotContext {
  topbar: Record<string, never>;
  "stack.footer": Record<string, never>;
  "node.card.header": { node: StackNode };
  "node.card.footer": { node: StackNode };
}

/** The places a plugin may put a component. A slot gets the context its host
 * passes — `node.card.*` get `{ node }`, the others get nothing. */
export type SlotName = keyof SlotContext;

/** The props of each host component a plugin may replace or wrap. */
export interface OverrideProps {
  NodeCard: NodeCardProps;
  NodeBody: NodeFormProps;
  AddNodeMenu: AddNodeMenuProps;
}

/** The host components a plugin may replace or wrap. */
export type OverridableId = keyof OverrideProps;

/** Wraps the component that was there: gets the previous one, returns the one
 * to render. Call the previous inside to decorate instead of replace. */
export type OverrideWrap<I extends OverridableId> = (
  previous: Component<OverrideProps[I]>,
) => Component<OverrideProps[I]>;

/** A component with its props type erased, for storage: the registry keeps
 * components of many prop types in one list, and each caller got its own type
 * back through the generic entry points below. */
type Erased = Component<never>;

export interface SlotOptions {
  /** Lower first. Default 100. */
  order?: number;
  /** Who contributed it, for the failure journal. */
  owner?: string;
}

interface SlotEntry {
  readonly id: number;
  readonly slot: SlotName;
  readonly Component: Erased;
  readonly order: number;
  readonly owner: string;
}

export interface PanelTabDef {
  /** Unique; `instructions`, `code`, `presets`, `run`, `settings`, `plugins` are the host's. */
  id: string;
  label: LocalText;
  Component: Component<{ selectedUid: () => string | null }>;
  /** Lower first. Default 100 (the host's tabs use 10–50). */
  order?: number;
  /** The panel scrolls the tab's content when it is taller than the panel. Off
   * for a tab that manages its own scrolling (the code view). A plugin's tab
   * gets it by default — a list that grows must not run off the screen. */
  scroll?: boolean;
}

interface OverrideEntry {
  readonly wrap: (previous: Erased) => Erased;
  readonly owner: string;
}

let nextId = 1;
const slots: SlotEntry[] = [];
const tabs = new Map<string, PanelTabDef>();
const overrides = new Map<OverridableId, OverrideEntry[]>();

// `ownedWrite`: plugins register from inside their own reactive root
const [revision, setRevision] = createSignal(0, { ownedWrite: true });
const changed = () => setRevision((n) => n + 1);

const removeFrom = <T>(list: T[], item: T): void => {
  const at = list.indexOf(item);
  if (at !== -1) list.splice(at, 1);
};

export const uiRegistry = {
  /** Put a component into a slot. */
  slot<N extends SlotName>(
    name: N,
    Component: Component<SlotContext[N]>,
    options: SlotOptions = {},
  ): Dispose {
    const entry: SlotEntry = {
      id: nextId++,
      slot: name,
      Component: Component as unknown as Erased,
      order: options.order ?? 100,
      owner: options.owner ?? "host",
    };
    slots.push(entry);
    changed();
    return () => {
      removeFrom(slots, entry);
      changed();
    };
  },

  /** The contributions of one slot, in order. */
  slotEntries(name: SlotName): readonly SlotEntry[] {
    revision();
    return slots
      .filter((entry) => entry.slot === name)
      .sort((a, b) => a.order - b.order || a.id - b.id);
  },

  /** Add a settings-panel tab. Defining an id again replaces it. */
  panelTab(def: PanelTabDef): Dispose {
    tabs.set(def.id, def);
    changed();
    return () => {
      if (tabs.get(def.id) !== def) return;
      tabs.delete(def.id);
      changed();
    };
  },

  panelTabs(): PanelTabDef[] {
    revision();
    return [...tabs.values()].sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100),
    );
  },

  /** Replace or wrap a host component. Overrides stack in the order they were
   * added; the last one sees the ones before it as its `previous`. */
  override<I extends OverridableId>(
    id: I,
    wrap: OverrideWrap<I>,
    owner = "host",
  ): Dispose {
    const entry: OverrideEntry = {
      wrap: wrap as unknown as OverrideEntry["wrap"],
      owner,
    };
    const list = overrides.get(id) ?? [];
    list.push(entry);
    overrides.set(id, list);
    changed();
    return () => {
      removeFrom(overrides.get(id) ?? [], entry);
      changed();
    };
  },

  overridesFor(id: OverridableId): readonly OverrideEntry[] {
    revision();
    return [...(overrides.get(id) ?? [])];
  },

  /** Add a style sheet. It is global and comes after the host's, so it can
   * theme the app (`:root { --color-primary: … }`) and restyle host parts;
   * scope the selectors of your own UI with a class of your own. */
  styles(css: string, owner = "plugin"): Dispose {
    let sheet: HTMLStyleElement | CSSStyleSheet;
    if (
      "adoptedStyleSheets" in document &&
      typeof CSSStyleSheet !== "undefined" &&
      typeof CSSStyleSheet.prototype.replaceSync === "function"
    ) {
      const constructed = new CSSStyleSheet();
      constructed.replaceSync(css);
      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        constructed,
      ];
      sheet = constructed;
    } else {
      const element = document.createElement("style");
      element.dataset.plugin = owner;
      element.textContent = css;
      document.head.append(element);
      sheet = element;
    }
    return () => {
      if (sheet instanceof HTMLStyleElement) sheet.remove();
      else
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
          (s) => s !== sheet,
        );
    };
  },
};
