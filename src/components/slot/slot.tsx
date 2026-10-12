import { Errored, For, type Accessor, type Component } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { pipeline } from "~/lib/pipeline/hooks";
import { uiRegistry, type SlotName } from "~/lib/ui/registry";

/** What a slot contribution is rendered as: its own props type was erased when
 * it was stored, and `context` is what the slot's host passes it. */
type Contribution = Component<Record<string, unknown>>;

export interface SlotProps {
  name: SlotName;
  /** Props handed to every contribution of the slot. */
  context?: Record<string, unknown>;
}

/**
 * A place in the host's layout where plugins may put components.
 *
 * Each contribution has its own error boundary: a plugin component that throws
 * while rendering costs its own space, not the screen around it. (A boundary
 * sees render errors only — one thrown inside an effect still halts Solid's
 * reactive system, which is what the watchdog and the plugin crash guard are for.)
 */
export const Slot: Component<SlotProps> = (props) => (
  <For each={uiRegistry.slotEntries(props.name)}>
    {(entry) => (
      <Errored
        fallback={(error: Accessor<unknown>) => {
          pipeline.report("ui", `${entry.owner}:${props.name}`, error());
          return null;
        }}
      >
        <Dynamic
          component={entry.Component as unknown as Contribution}
          {...props.context}
        />
      </Errored>
    )}
  </For>
);
