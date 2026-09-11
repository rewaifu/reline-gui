import { render as mount } from "@solidjs/web";
import {
  createErrorBoundary,
  createSignal,
  flush,
  type Component,
} from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "~/constants";
import { setLocale } from "~/lib/i18n";
import { Crash, clearStoredNodes } from "./crash";

/** Solid 2 halts the *whole* reactive system on an uncaught error, so one
 * throwing computation used to freeze every input on the page and say nothing.
 * These tests pin what the boundary promises instead: the error lands in the
 * fallback, the rest of the tree keeps reacting, and the screen offers the two
 * actions that actually recover — reload, or drop the saved tree and reload. */

const Boom: Component = () => {
  throw new Error("boom in a node form");
};

/** The boundary is created *inside* the render root on purpose — one created
 * outside a reactive owner warns `[NO_OWNER_BOUNDARY]`; `App.tsx` builds its
 * boundary in the component body for the same reason. */
const withBoundary = (child: () => unknown, outside: () => unknown) => {
  const view = createErrorBoundary(child, (error) => <Crash error={error} />);
  return [outside(), view()] as unknown as Element;
};

describe("workspace error boundary", () => {
  beforeEach(() => setLocale("ru"));

  it("shows the failure and leaves the reactive system alive", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const [count, setCount] = createSignal(0);
    mount(
      () =>
        withBoundary(
          () => <Boom />,
          () => <p id="outside">{String(count())}</p>,
        ),
      host,
    );
    flush();

    // the failure is on screen, with the stack that makes it fixable
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Интерфейс сломался");
    expect(alert?.textContent).toContain("boom in a node form");

    // the point of the boundary: updates outside it still reach the DOM
    expect(host.querySelector("#outside")?.textContent).toBe("0");
    setCount(1);
    flush();
    expect(host.querySelector("#outside")?.textContent).toBe("1");

    // recovery is offered, and it is not a button that cannot work: a boundary
    // reset does not resurrect a component that threw on its own state
    const labels = [...host.querySelectorAll("button")].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual([
      "Перезагрузить страницу",
      "Сбросить ноды и перезагрузить",
    ]);
  });
});

describe("clearStoredNodes", () => {
  beforeEach(() => {
    setLocale("ru");
    // this runner's bare `localStorage` is Node's (and throws without
    // --localstorage-file), so the storage the app talks to is stubbed
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("drops the saved tree and leaves everything else alone", () => {
    localStorage.setItem(STORAGE_KEY, '[{"uid":"a","type":"level"}]');
    localStorage.setItem("reline-web:runEndpoint", "ws://runner/run");

    clearStoredNodes();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    // a crash screen must not take the run address or presets with it
    expect(localStorage.getItem("reline-web:runEndpoint")).toBe(
      "ws://runner/run",
    );
  });
});
