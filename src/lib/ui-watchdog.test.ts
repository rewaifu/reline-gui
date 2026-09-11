import { describe, expect, it, vi } from "vitest";
import { createWatchdog } from "./ui-watchdog";

/** The watchdog exists for the failure a boundary cannot see: an error thrown
 * inside an effect halts Solid's whole reactive system, and the page keeps
 * painting while every input ignores the keyboard. Timers keep running, so the
 * probe is a token written by a signal and read back from the DOM — if the DOM
 * stops following the beat, the scheduler is dead. */

const setup = (rendered: (token: number) => string | null, strikes = 3) => {
  let token = 0;
  const stalls: number[] = [];
  const watchdog = createWatchdog({
    beat: () => String(++token),
    // `token` is the value the beat just wrote; the probe answers for the DOM
    rendered: () => rendered(token),
    onStall: () => stalls.push(token),
    strikes,
  });
  return { watchdog, stalls };
};

describe("createWatchdog", () => {
  it("stays quiet while the probe follows the beat", () => {
    const { watchdog, stalls } = setup((token) => String(token));

    for (let i = 0; i < 10; i += 1) watchdog.tick();

    expect(stalls).toEqual([]);
  });

  it("does not fire over a busy tick that catches up", () => {
    // one slow frame is a slow frame: only *consecutive* misses count
    const answers = ["1", "2", "3", "frozen", "5", "6", "7", "8"];
    let call = 0;
    const { watchdog, stalls } = setup(() => answers[call++] ?? "8");

    for (let i = 0; i < answers.length; i += 1) watchdog.tick();

    expect(stalls).toEqual([]);
  });

  it("reports a stall once the strikes run out", () => {
    const { watchdog, stalls } = setup(() => "0", 3);

    watchdog.tick(); // first tick only writes the token
    expect(stalls).toEqual([]);
    watchdog.tick();
    watchdog.tick();
    expect(stalls).toEqual([]);
    watchdog.tick();
    expect(stalls).toEqual([4]);

    // and it stops probing: a halt is not a state to keep re-detecting
    watchdog.tick();
    watchdog.tick();
    expect(stalls).toEqual([4]);
  });

  it("does not count a tick that arrived late", () => {
    // the main thread was busy: three queued ticks run together, and none of
    // them is evidence that the DOM stopped following
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const { watchdog, stalls } = setup(() => "frozen", 2);
      watchdog.tick();
      vi.advanceTimersByTime(5000);
      watchdog.tick();
      vi.advanceTimersByTime(5000);
      watchdog.tick();
      expect(stalls).toEqual([]);

      // …and a following on-time tick still detects the real thing
      vi.advanceTimersByTime(250);
      watchdog.tick();
      vi.advanceTimersByTime(250);
      watchdog.tick();
      expect(stalls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats a probe that left the DOM as a stall, not as health", () => {
    const { watchdog, stalls } = setup(() => null, 2);

    watchdog.tick();
    watchdog.tick();
    watchdog.tick();

    expect(stalls).toHaveLength(1);
  });

  it("runs on its own timer once started, and stops on request", () => {
    vi.useFakeTimers();
    try {
      const { watchdog, stalls } = setup(() => "frozen", 2);
      watchdog.start();
      vi.advanceTimersByTime(5000);
      expect(stalls).toHaveLength(1);

      watchdog.stop();
      const after = stalls.length;
      vi.advanceTimersByTime(5000);
      expect(stalls).toHaveLength(after);
    } finally {
      vi.useRealTimers();
    }
  });
});
