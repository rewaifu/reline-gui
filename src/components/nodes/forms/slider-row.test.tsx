import { fireEvent, render } from "@solidjs/testing-library";
import { createSignal, flush } from "solid-js";
import { beforeEach, describe, expect, it } from "vitest";
import { setLocale, t } from "~/lib/i18n";
import { SliderRow } from "./shared";

/** The slider, its numeric entry and the ▲/▼ steppers all write through one
 * callback, and the limits are the contract: a value outside `min`/`max` must
 * never reach the store, however it was entered. */

const setup = (start = 250, min = 0, max = 255, step = 1) => {
  const seen: number[] = [];
  const [value, setValue] = createSignal(start);
  const view = render(() => (
    <SliderRow
      label="High input"
      value={value()}
      min={min}
      max={max}
      step={step}
      onInput={(next) => {
        seen.push(next);
        setValue(next);
      }}
    />
  ));
  const field = () => view.container.querySelector('input[type="number"]');
  const arrow = (dir: "up" | "down") =>
    view.container.querySelector<HTMLButtonElement>(
      `button[aria-label="${t(dir === "up" ? "ui.increase" : "ui.decrease", { label: "High input" })}"]`,
    );
  const type = (text: string) => {
    const el = field();
    if (el === null) throw new Error("no number field");
    fireEvent.input(el, { target: { value: text } });
  };
  const blur = () => {
    const el = field();
    if (el === null) throw new Error("no number field");
    fireEvent.blur(el);
  };
  return { seen, value, field, arrow, type, blur };
};

describe("slider row: entry and steppers respect the limits", () => {
  beforeEach(() => setLocale("ru"));

  it("renders the arrows next to the value", () => {
    const { arrow } = setup();
    expect(arrow("up")?.textContent).toBe("");
    expect(arrow("up")).not.toBeNull();
    expect(arrow("down")).not.toBeNull();
  });

  it("steps by one and clamps at the top", () => {
    const { seen, arrow } = setup(254);
    arrow("up")?.click();
    expect(seen).toEqual([255]);
    arrow("up")?.click();
    expect(seen).toEqual([255, 255]);
  });

  it("steps down and clamps at the bottom", () => {
    const { seen, arrow } = setup(1);
    arrow("down")?.click();
    expect(seen).toEqual([0]);
    arrow("down")?.click();
    expect(seen).toEqual([0, 0]);
  });

  it("commits a typed value that already sits inside the limits", () => {
    const { seen, type } = setup();
    type("42");
    expect(seen).toEqual([42]);
  });

  it("holds an out-of-range value until the field is committed", () => {
    const { seen, type, blur } = setup(200);
    type("999");
    expect(seen).toEqual([]);
    blur();
    expect(seen).toEqual([255]);
  });

  it("holds half-typed intermediate states and clamps them on commit", () => {
    const { seen, type, blur } = setup(200);
    type("");
    type("-");
    expect(seen).toEqual([]);
    blur();
    expect(seen).toEqual([]);
  });

  it("steps a fractional number by its own step", () => {
    const { seen, arrow, type, blur } = setup(1, 0, 10, 0.1);
    arrow("up")?.click();
    expect(seen).toEqual([1.1]);
    type("99");
    expect(seen).toEqual([1.1]);
    blur();
    expect(seen).toEqual([1.1, 10]);
  });

  it("stores no float residue when stepping fractions", () => {
    const { seen, arrow } = setup(0.2, 0, 10, 0.1);
    arrow("up")?.click();
    expect(seen).toEqual([0.3]);
    expect(seen[0]).toBe(0.3);
  });

  it("snaps an off-grid value to the step grid instead of keeping the offset", () => {
    const { seen, arrow } = setup(500, 0, 2048, 128);
    arrow("up")?.click();
    flush();
    expect(seen).toEqual([512]);
    arrow("up")?.click();
    flush();
    expect(seen).toEqual([512, 640]);
    arrow("down")?.click();
    flush();
    expect(seen).toEqual([512, 640, 512]);
  });
});
