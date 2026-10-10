import { render } from "@solidjs/testing-library";
import { createStore, flush } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NodesContext, NodesDispatchContext } from "~/context/contexts";
import { createNodesDispatch } from "~/context/reducer";
import { NodesList } from "~/components/nodes-list/nodes-list";
import { createDefaultNodes } from "~/constants";

/** Rapid re-drop while the previous FLIP animation is still in flight.
 * WAAPI transforms shift getBoundingClientRect, so an insertion slot measured
 * mid-flight lands a slot off and the dropped row teleports. Dropping right
 * after a previous drop must settle the running flip first.
 *
 * NOTE: jsdom's PointerEvent drops clientX/clientY from the init dict, so
 * pointer events are dispatched as MouseEvents typed as pointer events (the
 * hook only reads clientX/clientY/pointerId/button off them). */
const ROW = 40;
const SHIFT = 17; // sub-row in-flight displacement

const order = (nodes: readonly { type: string }[]) => nodes.map((n) => n.type);

const pointerEvent = (
  type: "pointerdown" | "pointermove" | "pointerup",
  id: number,
  y: number,
): Event => {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 10,
    clientY: y,
    button: 0,
  });
  (event as unknown as Record<string, unknown>).pointerId = id;
  return event;
};

describe("drop during in-flight flip", () => {
  const running = new Set<HTMLElement>();

  beforeEach(() => {
    running.clear();
    (
      Element.prototype as unknown as Record<string, unknown>
    ).setPointerCapture = () => {};
    (
      Element.prototype as unknown as Record<string, unknown>
    ).releasePointerCapture = () => {};
    (HTMLElement.prototype as unknown as Record<string, unknown>).animate =
      function (this: HTMLElement) {
        running.add(this);
        return {
          finished: Promise.resolve(),
          cancel: () => void running.delete(this),
        };
      };
    (
      HTMLElement.prototype as unknown as Record<string, unknown>
    ).getAnimations = function (this: HTMLElement) {
      return running.has(this)
        ? [{ cancel: () => void running.delete(this) }]
        : [];
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.hasAttribute("data-flip-key")) {
          const rows = Array.from(document.querySelectorAll("[data-flip-key]"));
          const i = rows.indexOf(this);
          const top = i * ROW + (running.size > 0 ? SHIFT : 0);
          return {
            top,
            bottom: top + ROW,
            height: ROW,
            left: 0,
            right: 100,
            width: 100,
            x: 0,
            y: top,
            toJSON: () => {},
          } as DOMRect;
        }
        return {
          top: 0,
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => {},
        } as DOMRect;
      },
    );
  });

  const gesture = (
    rows: () => HTMLElement[],
    id: number,
    fromY: number,
    toY: number,
  ) => {
    rows()[0]!.dispatchEvent(pointerEvent("pointerdown", id, fromY));
    flush();
    rows()[0]!.dispatchEvent(pointerEvent("pointermove", id, toY));
    flush();
    rows()[0]!.dispatchEvent(pointerEvent("pointerup", id, toY));
    flush();
  };

  it("second drop lands correctly despite the first animation", async () => {
    const [nodes, setNodes] = createStore(createDefaultNodes().slice(0, 3));
    const before = order(nodes);
    const dispatch = createNodesDispatch(setNodes);
    const [selected] = createStore<Record<string, boolean>>({});
    const view = render(() => (
      <NodesContext value={nodes}>
        <NodesDispatchContext value={dispatch}>
          <NodesList
            selectedUid={() => null}
            isSelected={selected}
            onSelect={() => {}}
          />
        </NodesDispatchContext>
      </NodesContext>
    ));
    const rows = () =>
      Array.from(
        view.container.querySelectorAll("[data-flip-key]"),
      ) as HTMLElement[];

    // drop 1: first card to the end -> [B, C, A]
    gesture(rows, 1, 10, 3 * ROW + 10);
    await vi.waitFor(() =>
      expect(order(nodes)).toEqual([before[1], before[2], before[0]]),
    );
    // let the flip rAF run so its WAAPI animation starts (still in flight:
    // nothing cancels it except the next gesture)
    await vi.waitFor(() => expect(running.size).toBeGreaterThan(0));

    // drop 2, immediately: first card (B) just past C's midpoint.
    // clean midpoints are 20/60/100; polluted 37/77/117. y=75 is slot 2
    // clean but slot 1 polluted — without settling the move is swallowed.
    gesture(rows, 2, 10, 75);
    await vi.waitFor(() =>
      expect(order(nodes)).toEqual([before[2], before[1], before[0]]),
    );
    view.unmount();
  });
});
