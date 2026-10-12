import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UiSearchMenu } from "./search-menu";

// Positioning is the library's job and needs real layout: jsdom has none, and
// its zero-size boxes send autoUpdate into a loop. A fixed place is enough to
// test what the menu itself does.
vi.mock("@floating-ui/dom", () => ({
  computePosition: async () => ({ x: 0, y: 0 }),
  autoUpdate: () => () => {},
  flip: () => ({}),
  offset: () => ({}),
  shift: () => ({}),
  size: () => ({}),
}));

// jsdom has no layout, so no scrolling into view either
Element.prototype.scrollIntoView = () => {};

afterEach(cleanup);

const ITEMS = ["Folder Reader", "Upscale", "Sharp", "Folder Writer"];
const wait = () => new Promise((resolve) => setTimeout(resolve, 30));

const mount = () => {
  const onPick = vi.fn();
  const view = render(() => (
    <UiSearchMenu icon="plus" label="Add node" items={ITEMS} onPick={onPick} />
  ));
  const trigger = () => view.getByRole("button", { name: "Add node" });
  const field = () =>
    document.querySelector<HTMLInputElement>("input[role=combobox]");
  const options = () =>
    [...document.querySelectorAll("[role=option]")].map((o) => o.textContent);
  const open = async () => {
    fireEvent.click(trigger());
    flush();
    await wait();
  };
  return { onPick, trigger, field, options, open };
};

describe("UiSearchMenu", () => {
  it("is a closed icon button until clicked", () => {
    const m = mount();
    expect(m.field()).toBeNull();
    expect(m.trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("moves focus into the search field as it opens, with every item listed", async () => {
    const m = mount();
    await m.open();
    expect(m.trigger().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(m.field());
    expect(m.options()).toEqual(ITEMS);
  });

  it("filters by every typed word, in any order", async () => {
    const m = mount();
    await m.open();
    fireEvent.input(m.field()!, { target: { value: "writer fol" } });
    flush();
    expect(m.options()).toEqual(["Folder Writer"]);
    fireEvent.input(m.field()!, { target: { value: "zzz" } });
    flush();
    expect(m.options()).toEqual([]);
    expect(document.body.textContent).toContain("Nothing found");
  });

  it("Enter picks the highlighted item, arrows move it, and the menu closes", async () => {
    const m = mount();
    await m.open();
    // one key per task, as in a browser: a write is not visible before the flush
    fireEvent.keyDown(m.field()!, { key: "ArrowDown" });
    flush();
    fireEvent.keyDown(m.field()!, { key: "ArrowDown" });
    flush();
    fireEvent.keyDown(m.field()!, { key: "Enter" });
    flush();
    expect(m.onPick).toHaveBeenCalledWith("Sharp");
    expect(m.field()).toBeNull();
    expect(document.activeElement).toBe(m.trigger());
  });

  it("a click picks, and Escape closes without picking", async () => {
    const m = mount();
    await m.open();
    fireEvent.click(document.querySelectorAll("[role=option]")[1]!);
    flush();
    expect(m.onPick).toHaveBeenCalledWith("Upscale");
    await m.open();
    fireEvent.keyDown(m.field()!, { key: "Escape" });
    flush();
    expect(m.field()).toBeNull();
    expect(m.onPick).toHaveBeenCalledTimes(1);
  });

  it("starts from an empty search every time it opens", async () => {
    const m = mount();
    await m.open();
    fireEvent.input(m.field()!, { target: { value: "sharp" } });
    flush();
    fireEvent.keyDown(m.field()!, { key: "Escape" });
    flush();
    await m.open();
    expect(m.field()!.value).toBe("");
    expect(m.options()).toEqual(ITEMS);
  });
});
