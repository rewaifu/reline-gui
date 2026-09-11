import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDragReorder, type DragHandlers } from "./use-drag-reorder";

/** The reorder gesture used to live on a grip icon in every row. Now the whole
 * row is the drag source — which puts a switch and a delete button *inside* the
 * drag surface, so the rules that matter are: a control's own press never
 * becomes a drag, a tap is not a drag, and a reorder still happens. */

/** Rows are 40px tall and stacked; jsdom reports zero-size rects. */
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

/** The handlers only read these fields; a real PointerEvent is not required. */
const pointer = (
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

/** Solid 2 defers signal writes until the flush, and these handlers read the
 * signal they just wrote (`dragIndex()` gates the drop tracking), so every
 * dispatched event is followed by one. */
const press = (
  handlers: DragHandlers,
  row: HTMLElement,
  target: EventTarget,
  init: { id: number; x: number; y: number },
) => {
  handlers.onPointerDown(pointer(target, row, init));
  flush();
};

const move = (
  handlers: DragHandlers,
  row: HTMLElement,
  init: { id: number; x: number; y: number },
) => {
  handlers.onPointerMove(pointer(row, row, init));
  flush();
};

const release = (
  handlers: DragHandlers,
  row: HTMLElement,
  target: EventTarget,
  init: { id: number; x: number; y: number },
) => {
  handlers.onPointerUp(pointer(target, row, init));
  flush();
};

describe("createDragReorder", () => {
  beforeEach(() => {
    // jsdom has no pointer capture
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  const setup = (count = 3) => {
    const { container, rows } = makeContainer(count);
    const moves: [number, number][] = [];
    const drag = createDragReorder(
      () => container,
      (from, to) => moves.push([from, to]),
    );
    return { container, rows, moves, drag };
  };

  it("moves a row once the press has travelled past the threshold", () => {
    const { rows, moves, drag } = setup();
    const handlers = drag.handlers(0);

    press(handlers, rows[0]!, rows[0]!, { id: 1, x: 10, y: 10 });
    expect(drag.dragIndex()).toBeNull();
    move(handlers, rows[0]!, { id: 1, x: 10, y: 15 });
    expect(drag.dragIndex()).toBeNull();
    move(handlers, rows[0]!, { id: 1, x: 10, y: 90 });
    expect(drag.dragIndex()).toBe(0);

    // dropping between rows 1 and 2: the row leaves its slot first, so the
    // final index is 1 — the same (from, to) the MOVE reducer splices with
    release(handlers, rows[0]!, rows[0]!, { id: 1, x: 10, y: 90 });
    expect(moves).toEqual([[0, 1]]);
    expect(drag.dragIndex()).toBeNull();
  });

  it("treats a press that never travelled as a tap", () => {
    const { rows, moves, drag } = setup();
    const handlers = drag.handlers(0);

    press(handlers, rows[0]!, rows[0]!, { id: 1, x: 10, y: 10 });
    move(handlers, rows[0]!, { id: 1, x: 11, y: 12 });
    release(handlers, rows[0]!, rows[0]!, { id: 1, x: 11, y: 12 });

    expect(moves).toEqual([]);
    expect(drag.dragIndex()).toBeNull();
  });

  it("leaves a press that starts on a button alone", () => {
    const { rows, moves, drag } = setup();
    const handlers = drag.handlers(0);
    const control = document.createElement("button");
    rows[0]!.append(control);

    // pointer capture here would swallow the click the button is about to get
    press(handlers, rows[0]!, control, { id: 1, x: 10, y: 10 });
    move(handlers, rows[0]!, { id: 1, x: 10, y: 120 });
    release(handlers, rows[0]!, control, { id: 1, x: 10, y: 120 });

    expect(drag.dragIndex()).toBeNull();
    expect(moves).toEqual([]);
  });

  it("leaves a press on the visible part of a switch alone", () => {
    const { rows, moves, drag } = setup();
    const handlers = drag.handlers(0);

    // the shape the list actually renders (Kobalte switch): the input that
    // carries the role is hidden, the visible track and thumb are plain nodes
    const wrapper = document.createElement("div");
    const input = document.createElement("input");
    input.setAttribute("role", "switch");
    const track = document.createElement("div");
    const thumb = document.createElement("div");
    track.append(thumb);
    wrapper.append(input, track);
    rows[0]!.append(wrapper);

    press(handlers, rows[0]!, thumb, { id: 1, x: 10, y: 10 });
    move(handlers, rows[0]!, { id: 1, x: 10, y: 120 });
    release(handlers, rows[0]!, thumb, { id: 1, x: 10, y: 120 });

    expect(drag.dragIndex()).toBeNull();
    expect(moves).toEqual([]);
  });

  it("still drags from the row's own text", () => {
    const { rows, moves, drag } = setup();
    const handlers = drag.handlers(0);
    const label = document.createElement("span");
    rows[0]!.append(label);

    press(handlers, rows[0]!, label, { id: 1, x: 10, y: 10 });
    move(handlers, rows[0]!, { id: 1, x: 10, y: 90 });
    release(handlers, rows[0]!, label, { id: 1, x: 10, y: 90 });

    expect(moves).toEqual([[0, 1]]);
  });

  it("reorders from the keyboard without a pointer", () => {
    const { rows, moves, drag } = setup();
    const handlers = drag.handlers(1);

    handlers.onKeyDown(
      new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true }),
    );
    flush();
    expect(moves).toEqual([[1, 0]]);

    handlers.onKeyDown(
      new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true }),
    );
    flush();
    expect(moves).toEqual([
      [1, 0],
      [1, 2],
    ]);
    // the first row cannot move up any further
    drag
      .handlers(0)
      .onKeyDown(
        new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true }),
      );
    flush();
    expect(moves).toHaveLength(2);
    void rows;
  });
});
