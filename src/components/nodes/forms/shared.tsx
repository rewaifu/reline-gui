import {
  For,
  Show,
  createSignal,
  createUniqueId,
  onSettled,
  useContext,
  type Component,
} from "solid-js";
import { NodesDispatchContext } from "~/context/contexts";
import { NodesActionType } from "~/types/actions";
import type { NodeOptions, StackNode } from "~/types/node";
import {
  Icon,
  Input,
  Label,
  UiSwitch,
  UiCombobox,
  UiSelect,
  UiSlider,
} from "~/components/ui";
import { lsClient } from "~/lib/ls-client";
import {
  modelNames,
  modelsLoaded,
  resolveModelName,
  type MdbModel,
} from "~/lib/model-db";
import styles from "./forms.module.scss";

export interface NodeForm {
  options: () => NodeOptions;
  set: (patch: Partial<NodeOptions>) => void;
}

/** Shared per-node form state: typed read + immutable CHANGE dispatch.
 * Receives the row's node object (from <For>) instead of re-finding it by
 * id on every read. */
export const useNodeForm = (node: () => StackNode): NodeForm => {
  const dispatch = useContext(NodesDispatchContext);

  return {
    options: () => node().options as NodeOptions,
    set: (patch) => {
      dispatch({
        type: NodesActionType.CHANGE,
        payload: { uid: node().uid, options: patch },
      });
    },
  };
};

export interface TextRowProps {
  label: string;
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
}

export const TextRow: Component<TextRowProps> = (props) => {
  const id = createUniqueId();
  return (
    <div class={styles.row}>
      <Label
        for={id}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(id)?.focus();
        }}
      >
        {props.label}
      </Label>
      <Input
        id={id}
        type="text"
        placeholder={props.placeholder}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </div>
  );
};

export interface NumberRowProps {
  label: string;
  value: number | undefined;
  onInput: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export const NumberRow: Component<NumberRowProps> = (props) => {
  const id = createUniqueId();
  const clamp = (value: number) => {
    let v = value;
    if (props.min !== undefined) v = Math.max(props.min, v);
    if (props.max !== undefined) v = Math.min(props.max, v);
    return v;
  };
  const step = (dir: 1 | -1) => {
    const size = props.step ?? 1;
    props.onInput(clamp((props.value ?? props.min ?? 0) + dir * size));
  };
  // While focused the input holds a local string draft: "-1", "1." and "1e"
  // are intermediate states a number round-trip through the store would
  // reject mid-typing (rewriting the field under the caret). The draft
  // commits — clamped, like the stepper buttons — on blur or Enter.
  const [draft, setDraft] = createSignal<string>();
  const shown = () => {
    const d = draft();
    if (d !== undefined) return d;
    return props.value === undefined ? "" : String(props.value);
  };
  // the committed value is read from the element, never from `draft()`:
  // signal writes are deferred, so a blur landing in the same task as the
  // last keystroke would commit the previous (stale) draft
  const commit = (value: string) => {
    setDraft(undefined);
    if (value.trim() === "") return;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) props.onInput(clamp(parsed));
  };
  return (
    <div class={styles.row}>
      <Label
        for={id}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(id)?.focus();
        }}
      >
        {props.label}
      </Label>
      <div class={styles.stepper}>
        <Input
          id={id}
          type="number"
          class={styles.stepInput}
          min={props.min}
          max={props.max}
          step={props.step}
          value={shown()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
        />
        <div class={styles.spinners}>
          <button
            type="button"
            class={styles.stepBtn}
            tabindex="-1"
            aria-label={`Increase ${props.label}`}
            onClick={() => step(1)}
          >
            <Icon name="chevron-up" size={12} />
          </button>
          <button
            type="button"
            class={styles.stepBtn}
            tabindex="-1"
            aria-label={`Decrease ${props.label}`}
            onClick={() => step(-1)}
          >
            <Icon name="chevron-down" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

export interface SliderRowProps {
  label: string;
  value: number | undefined;
  onInput: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/** Label + slider + numeric entry bound to the same value. */
export const SliderRow: Component<SliderRowProps> = (props) => {
  const id = createUniqueId();
  const value = () => props.value ?? props.min ?? 0;
  return (
    <div class={styles.row}>
      <Label
        for={id}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(id)?.focus();
        }}
      >
        {props.label}
      </Label>
      <div class={styles.sliderLine}>
        <UiSlider
          id={id}
          value={value()}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={props.onInput}
        />
        <Input
          class={styles.sliderValue}
          type="number"
          min={props.min}
          max={props.max}
          step={props.step}
          value={String(value())}
          onInput={(e) => {
            const parsed = Number(e.currentTarget.value);
            if (e.currentTarget.value !== "" && Number.isFinite(parsed))
              props.onInput(parsed);
          }}
        />
      </div>
    </div>
  );
};

export interface ComboboxRowProps {
  label: string;
  value: string;
  items: readonly string[];
  onChange: (value: string) => void;
}

export const ComboboxRow: Component<ComboboxRowProps> = (props) => {
  const id = createUniqueId();
  return (
    <div class={styles.row}>
      <Label
        for={id}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(id)?.focus();
        }}
      >
        {props.label}
      </Label>
      <UiCombobox
        id={id}
        value={props.value}
        items={props.items}
        onChange={props.onChange}
      />
    </div>
  );
};

export interface SelectRowProps {
  label: string;
  value: string;
  items: readonly string[];
  onChange: (value: string) => void;
}

export const SelectRow: Component<SelectRowProps> = (props) => {
  const id = createUniqueId();
  return (
    <div class={styles.row}>
      <Label
        for={id}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(id)?.click();
        }}
      >
        {props.label}
      </Label>
      <UiSelect
        id={id}
        value={props.value}
        items={props.items}
        onChange={props.onChange}
      />
    </div>
  );
};

export interface CheckRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const CheckRow: Component<CheckRowProps> = (props) => {
  const id = createUniqueId();
  return (
    <div class={styles.row}>
      <Label
        for={id}
        onClick={(e) => {
          e.preventDefault();
          props.onChange(!props.checked);
        }}
      >
        {props.label}
      </Label>
      <UiSwitch id={id} checked={props.checked} onChange={props.onChange} />
    </div>
  );
};

export interface NumberOrListRowProps {
  label: string;
  value: number | number[];
  onInput: (value: number | number[]) => void;
}

/** Edits a `number | number[]` option: scalar via number input, arrays via comma-separated text. */
export const NumberOrListRow: Component<NumberOrListRowProps> = (props) => {
  const id = createUniqueId();
  const isList = () => Array.isArray(props.value);
  const text = () =>
    isList() ? (props.value as number[]).join(", ") : String(props.value);

  const toggleMode = () =>
    props.onInput(
      isList()
        ? Number((props.value as number[])[0] ?? 0)
        : [Number(props.value) || 0],
    );

  const parseNumbers = (raw: string): number[] =>
    raw
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n) && raw.trim() !== "");

  return (
    <div class={styles.row}>
      <Label
        for={id}
        onClick={(e) => {
          // the mode toggle inside the label handles its own click — don't
          // focus the input or let the native label forwarding steal it
          if (
            e.target instanceof Element &&
            e.target.closest("button") !== null
          ) {
            e.preventDefault();
            return;
          }
          document.getElementById(id)?.focus();
        }}
      >
        {props.label}
        <button type="button" class={styles.modeToggle} onClick={toggleMode}>
          {isList() ? "list" : "single"}
        </button>
      </Label>
      <Show
        when={isList()}
        fallback={
          <Input
            id={id}
            type="number"
            value={text()}
            onInput={(e) => {
              const parsed = Number(e.currentTarget.value);
              if (e.currentTarget.value !== "" && Number.isFinite(parsed))
                props.onInput(parsed);
            }}
          />
        }
      >
        <Input
          id={id}
          type="text"
          placeholder="1, 2, 3"
          value={text()}
          onInput={(e) => {
            const parsed = parseNumbers(e.currentTarget.value);
            if (parsed.length > 0) props.onInput(parsed);
          }}
        />
      </Show>
    </div>
  );
};

export interface PathRowProps {
  label: string;
  placeholder?: string;
  value: string;
  onInput: (value: string) => void;
  /** fired when a candidate is picked (mdb mode): carries the entry plus
   * its metadata, e.g. the mdb download url */
  onPick?: (value: string, meta: { url?: string }) => void;
  /** candidates: dirs = only folders (folder fields), weights = folders +
   * weight files (own model path), mdb = remote model names (non-own model) */
  source?: "dirs" | "weights" | "mdb";
}

const WEIGHT_EXTS = ["pth", "pt", "safetensors", "safetensor"];

/** The path to send for `ls`. A bare name ("raws") means "complete in the
 * folder we are in", but splitting it gives an *empty* directory name: runner
 * builds that do not turn that into "." (`directory = directory or "."`) list
 * nothing and the field looks dead until the user types a slash. `./raws`
 * names the same folder, keeps the same last-segment prefix the server
 * matches on, and lists the same entries on every build. */
export const queryPath = (value: string): string =>
  value.includes("/") ? value : `./${value}`;

/** Text input with path completion: debounced `ls` lookups populate a
 * dropdown; picking an entry completes the last path segment, directories
 * get a trailing slash so browsing continues deeper. `mdb` completes against
 * the remote model database instead of the filesystem. */
export const PathRow: Component<PathRowProps> = (props) => {
  const id = createUniqueId();
  const listId = createUniqueId();
  const [entries, setEntries] = createSignal<string[]>([]);
  const [dirs, setDirs] = createSignal<ReadonlySet<string>>(new Set());
  const [open, setOpen] = createSignal(false);
  let lastDir = "";
  let mdbHits: MdbModel[] = [];
  const [active, setActive] = createSignal(0);
  let timer: number | undefined;
  // monotonically increasing per lookup: a slow older response (fast typing
  // across the debounce boundary, mdb + ls interleaved) must never overwrite
  // the results of a newer query
  let seq = 0;
  // direct refs — no getElementById walks
  let inputEl: HTMLInputElement | undefined;
  let listEl: HTMLUListElement | undefined;

  onSettled(() => clearTimeout(timer));

  const lookup = (value: string) => {
    clearTimeout(timer);
    const mine = ++seq;
    // capture the props the async continuation needs: a reactive read inside
    // a promise callback is untracked anyway, so read it once here
    const source = props.source;
    const query = () => {
      const stale = () => mine !== seq;
      if (source === "mdb") {
        modelNames()
          .then((all) => {
            if (stale()) return;
            // the whole database is already in memory — show every match
            const q = (value.split("/").pop() ?? "").toLowerCase();
            const hits = all.filter((m) => m.name.toLowerCase().includes(q));
            mdbHits = hits;
            setEntries(hits.map((m) => m.name));
            setDirs(new Set<string>());
            setActive(0);
            setOpen(hits.length > 0);
            if (listEl !== undefined) listEl.scrollTop = 0;
          })
          .catch(() => {
            if (!stale()) setOpen(false);
          });
        return;
      }
      mdbHits = [];
      lsClient
        .ls(queryPath(value), source === "weights" ? { ext: WEIGHT_EXTS } : {})
        // the active() read is a deliberate current-index snapshot on landing
        // oxlint-disable-next-line solid/reactivity
        .then((r) => {
          if (stale()) return;
          const dirs = new Set(r.dirs);
          // server returns raw readdir order — sort for a stable list
          let names = r.entries.slice().sort();
          if (source === "dirs") names = names.filter((n) => dirs.has(n));
          names = names.slice(0, 8);
          setEntries(names);
          setDirs(dirs);
          // fresh directory starts at the top; a re-listing of the same dir
          // (e.g. after arrow-reopen) keeps the highlighted row
          const dir = value.slice(0, value.lastIndexOf("/") + 1);
          if (dir !== lastDir || names.length === 0) setActive(0);
          else if (active() >= names.length) setActive(names.length - 1);
          lastDir = dir;
          setOpen(names.length > 0);
          // rows were replaced: keep the highlighted row inside the viewport
          const ul = listEl;
          const el = document.getElementById(`${listId}-${active()}`);
          if (ul !== undefined && el !== null) {
            if (
              el.offsetTop < ul.scrollTop ||
              el.offsetTop + el.offsetHeight > ul.scrollTop + ul.clientHeight
            ) {
              ul.scrollTop = el.offsetTop;
            }
          }
        })
        .catch(() => {
          if (!stale()) setOpen(false);
        });
    };
    // A warm model index answers from memory, so the debounce (which exists
    // to spare the runner from one `ls` per keystroke) only delays the user.
    if (source === "mdb" && modelsLoaded()) {
      query();
      return;
    }
    timer = window.setTimeout(query, 250);
  };

  const complete = (name: string) => {
    const head = props.value.slice(0, props.value.lastIndexOf("/") + 1);
    const isDir = dirs().has(name);
    const next = head + name + (isDir ? "/" : "");
    props.onInput(next);
    if (isDir) {
      // a directory completes into itself: keep the menu open and list the
      // folder contents right away, no extra keystrokes needed
      lookup(next);
    } else {
      if (props.source === "mdb") {
        const hit = mdbHits.find((m) => m.name === name);
        props.onPick?.(next, { url: hit?.url });
      }
      setOpen(false);
    }
  };

  const move = (delta: number) => {
    const count = entries().length;
    if (count === 0) return;
    // solid 2 batches signal writes inside handlers: reading active() right
    // after setActive yields the stale value, so keep the index in a local
    // clamp, not wrap: wrapping teleports the selection across the whole list
    const next = Math.min(count - 1, Math.max(0, active() + delta));
    setActive(next);
    // keep the highlighted row inside the capped menu (it can hold ~6 rows)
    const ul = listEl;
    const el = document.getElementById(`${listId}-${next}`);
    if (ul !== undefined && el !== null) {
      if (el.offsetTop < ul.scrollTop) ul.scrollTop = el.offsetTop;
      else if (
        el.offsetTop + el.offsetHeight >
        ul.scrollTop + ul.clientHeight
      ) {
        ul.scrollTop = el.offsetTop + el.offsetHeight - ul.clientHeight;
      }
    }
  };

  return (
    <div class={styles.row}>
      <Label
        for={id}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(id)?.focus();
        }}
      >
        {props.label}
      </Label>
      <div class={styles.pathWrap}>
        <Input
          id={id}
          ref={inputEl}
          type="text"
          role="combobox"
          aria-expanded={open() ? "true" : "false"}
          aria-controls={listId}
          aria-activedescendant={open() ? `${listId}-${active()}` : undefined}
          autocomplete="off"
          placeholder={props.placeholder}
          value={props.value}
          onInput={(e) => {
            props.onInput(e.currentTarget.value);
            lookup(e.currentTarget.value);
          }}
          onFocus={() => lookup(props.value)}
          onBlur={() => {
            setOpen(false);
            if (props.source !== "mdb") return;
            const typed = props.value;
            const { onInput, onPick } = props;
            // leaving the field with a not-exact model name snaps it to the
            // closest mdb entry — an invalid model must never survive
            void resolveModelName(typed)
              .then((hit) => {
                if (hit === undefined) return;
                // refocused meanwhile: the user is typing again, don't fight it
                if (document.activeElement === inputEl) return;
                if (hit.name !== typed) onInput(hit.name);
                onPick?.(hit.name, { url: hit.url });
              })
              // An unreachable mdb (offline, CDN hiccup, CORS) must not escape
              // as an unhandled rejection — the console showed
              // "Uncaught (in promise) TypeError: Failed to fetch" on every
              // preset switch that blurred this field. The typed name stands
              // and the next focus retries the lookup.
              .catch(() => undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            // no candidates yet: arrows keep their normal caret semantics
            if (entries().length === 0) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              // preventDefault stops the caret jump; reopen the menu if it
              // was closed (Esc / fresh focus) and refresh a stale listing
              e.preventDefault();
              if (!open()) {
                setOpen(true);
                lookup(props.value);
              }
              move(e.key === "ArrowDown" ? 1 : -1);
            } else if (open() && (e.key === "Tab" || e.key === "Enter")) {
              e.preventDefault();
              const picked = entries()[active()];
              if (picked !== undefined) complete(picked);
            }
          }}
        />
        <Show when={open()}>
          <div class={styles.pathMenu}>
            <ul
              id={listId}
              ref={listEl}
              class={styles.pathMenuList}
              role="listbox"
            >
              <For each={entries()}>
                {(name, index) => (
                  <li>
                    <button
                      id={`${listId}-${index()}`}
                      type="button"
                      class={index() === active() ? styles.active : undefined}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => complete(name)}
                    >
                      {name}
                      {dirs().has(name) ? "/" : ""}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </div>
    </div>
  );
};
