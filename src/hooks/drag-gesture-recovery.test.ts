import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDragReorder,
  type DragHandlers,
  type DragReorder,
} from "./use-drag-reorder";

/** A gesture whose pointerup never arrives (lost event under fast dragging)
 * must not poison the next one: the stale dragIndex would make the next drop
 * move the wrong row while the old one keeps the dragging style — and a mere
 * tap would commit a phantom move (which is why clicking another node seemed
 * to "fix" it). A new press owns the gesture and starts clean.
 *
 * NOTE: handlers are driven with fake event objects (clientX/clientY carried
 * directly) because jsdom's PointerEvent drops them from the init dict. */
const ROW_HEIGHT = 40;

const makeContainer = (count: number) => {
  const container = document.createElement("div");
  const rows: HTMLElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement("div");
    row.setAttribute("data-flip-key", `row-${i}`);
    row.getBoundingClientRect = () =>
      ({ top: i * ROW_HEIGHT, height: ROW_HEIGHT }) as DOMRect;
    container.append(row);
    rows.push(row);
  }
  document.body.append(container);
  return { container, rows };
};

const fake = (
  target: EventTarget,
  currentTarget: HTMLElement,
  init: { id: number; x: number; y: number },
) =>
  ({
    pointerId: init.id,
    pointerType: "mouse",
    button: 0,
    clientX: init.x,
    clientY: init.y,
    target,
    currentTarget,
  }) as unknown as PointerEvent;

const down = (h: DragHandlers, row: HTMLElement, id: number, y: number) => {
  h.onPointerDown(fake(row, row, { id, x: 10, y }));
  flush();
};

const dragMove = (h: DragHandlers, row: HTMLElement, id: number, y: number) => {
  h.onPointerMove(fake(row, row, { id, x: 10, y }));
  flush();
};

const up = (h: DragHandlers, row: HTMLElement, id: number, y: number) => {
  h.onPointerUp(fake(row, row, { id, x: 10, y }));
  flush();
};

describe("gesture recovery after a lost pointerup", () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  const setup = () => {
    const { container, rows } = makeContainer(3);
    const moves: [number, number][] = [];
    const drag = createDragReorder(
      () => container,
      (from, to) => moves.push([from, to]),
    );
    return { rows, moves, drag };
  };

  // drop the pointerup on purpose: gesture A drags row 0 and its release
  // never reaches the handler
  const loseRelease = (drag: DragReorder, rows: HTMLElement[]) => {
    down(drag.handlers(0), rows[0]!, 1, 10);
    dragMove(drag.handlers(0), rows[0]!, 1, 3 * ROW_HEIGHT + 10);
    expect(drag.dragIndex()).toBe(0);
  };

  it("the next drag moves the row that is actually dragged", () => {
    const { rows, moves, drag } = setup();
    loseRelease(drag, rows);

    // gesture B grabs row 1 and drops it at the end
    down(drag.handlers(1), rows[1]!, 2, ROW_HEIGHT + 10);
    dragMove(drag.handlers(1), rows[1]!, 2, 3 * ROW_HEIGHT + 10);
    expect(drag.dragIndex()).toBe(1);
    up(drag.handlers(1), rows[1]!, 2, 3 * ROW_HEIGHT + 10);

    expect(moves).toEqual([[1, 2]]);
  });

  it("a tap after the loss commits no phantom move", () => {
    const { rows, moves, drag } = setup();
    loseRelease(drag, rows);

    // a tap is a press that never travels: with the stale dragIndex cleared
    // on press it releases cleanly instead of committing from row 0
    down(drag.handlers(2), rows[2]!, 2, 2 * ROW_HEIGHT + 10);
    up(drag.handlers(2), rows[2]!, 2, 2 * ROW_HEIGHT + 10);

    expect(moves).toEqual([]);
    expect(drag.dragIndex()).toBeNull();
  });
});
