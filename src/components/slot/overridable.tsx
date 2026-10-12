import { Errored, type Accessor, type Component } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { pipeline } from "~/lib/pipeline/hooks";
import {
  uiRegistry,
  type OverridableId,
  type OverrideProps,
} from "~/lib/ui/registry";

/** One override on top of what it replaces. If it throws while rendering, the
 * previous component is rendered in its place — a broken plugin degrades the
 * piece it touched back to what the host (or the plugin before it) drew. */
const guarded = <P extends object>(
  id: OverridableId,
  owner: string,
  next: Component<P>,
  previous: Component<P>,
): Component<P> => {
  const Guarded: Component<P> = (props) => (
    <Errored
      fallback={(error: Accessor<unknown>) => {
        pipeline.report("ui", `${owner}:${id}`, error());
        return <Dynamic component={previous} {...props} />;
      }}
    >
      <Dynamic component={next} {...props} />
    </Errored>
  );
  return Guarded;
};

/** Composed components by id, valid while the override list is unchanged: a new
 * component identity on every read would remount the piece on every render. */
interface Composed {
  base: unknown;
  key: string;
  component: unknown;
}
const cache = new Map<OverridableId, Composed>();
const identities = new WeakMap<object, number>();
let nextIdentity = 1;
const identityOf = (entry: object): number => {
  let id = identities.get(entry);
  if (id === undefined) {
    id = nextIdentity++;
    identities.set(entry, id);
  }
  return id;
};

/**
 * Make a host component replaceable. The host renders `Overridable` wherever it
 * rendered the original; with no override it is the original, with some it is
 * the chain they build.
 */
export const overridable = <I extends OverridableId>(
  id: I,
  Base: Component<OverrideProps[I]>,
): Component<OverrideProps[I]> => {
  const Overridable: Component<OverrideProps[I]> = (props) => {
    const resolved = (): Component<OverrideProps[I]> => {
      const list = uiRegistry.overridesFor(id);
      if (list.length === 0) return Base;
      const key = list.map(identityOf).join(",");
      const hit = cache.get(id);
      if (hit !== undefined && hit.base === Base && hit.key === key)
        return hit.component as Component<OverrideProps[I]>;
      let current = Base;
      for (const entry of list) {
        // the registry stores wraps with their prop types erased; this id's
        // props are what they were registered for
        const wrap = entry.wrap as unknown as (
          previous: Component<OverrideProps[I]>,
        ) => Component<OverrideProps[I]>;
        current = guarded(id, entry.owner, wrap(current), current);
      }
      cache.set(id, { base: Base, key, component: current });
      return current;
    };
    // `Dynamic` is generic over one props type; this id's is `OverrideProps[I]`
    return (
      <Dynamic
        component={resolved() as unknown as Component<Record<string, unknown>>}
        {...(props as unknown as Record<string, unknown>)}
      />
    );
  };
  return Overridable;
};
