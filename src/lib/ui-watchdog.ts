import { t } from "~/lib/i18n";
import styles from "./ui-watchdog.module.scss";

/** Turns the one failure that leaves no trace into something on screen.
 *
 * Solid 2 halts the *whole* reactive system on an uncaught error, and an error
 * thrown inside an effect (the common case — a form computing on data it did
 * not expect) never reaches an error boundary, which only sees render errors.
 * The page then looks alive: it paints, it scrolls, and every input ignores the
 * keyboard. Nothing in the console is visible to the person using it.
 *
 * A boundary cannot catch this, so it is *detected* instead. The probe is a
 * token: a signal is bumped on a timer and one hidden node renders it, and the
 * timers keep running when the scheduler is dead. A DOM that stops following
 * the beat for a few ticks is a halted reactive system, not a slow frame.
 */

export interface WatchdogOptions {
  /** Advance the probe; returns the token the DOM is expected to show. */
  beat: () => string;
  /** What the probe shows right now; `null` when it is not in the DOM. */
  rendered: () => string | null;
  /** Called once, on the first confirmed stall. */
  onStall: () => void;
  /** Ticks between checks. */
  intervalMs?: number;
  /** Missed ticks that confirm a stall. */
  strikes?: number;
}

export interface Watchdog {
  start: () => void;
  stop: () => void;
  /** One check — exposed so the decision can be tested without timers. */
  tick: () => void;
}

export const createWatchdog = (options: WatchdogOptions): Watchdog => {
  const { beat, rendered, onStall, intervalMs = 1000, strikes = 3 } = options;
  // The token written on the previous tick: the DOM has had a whole tick to
  // catch up, so anything else means the update never arrived.
  let pending: string | undefined;
  let missed = 0;
  let stalled = false;
  let lastAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };

  const tick = () => {
    // a halt is not a state to keep re-detecting: the overlay is already up
    if (stalled) return;
    const now = Date.now();
    // A tick that arrives late means the main thread was busy (a big import,
    // serialising a large tree) — the queued callbacks run together and the DOM
    // has had no chance to follow. That is a slow frame, not a dead system, so
    // it neither counts as a miss nor keeps the previous one alive.
    const late = lastAt !== 0 && now - lastAt > intervalMs * 2;
    lastAt = now;
    if (pending !== undefined) {
      if (late || rendered() === pending) missed = 0;
      else missed += 1;
    }
    pending = beat();
    if (missed >= strikes) {
      stalled = true;
      stop();
      onStall();
    }
  };

  return {
    start: () => {
      stop();
      timer = setInterval(tick, intervalMs);
    },
    stop,
    tick,
  };
};

/** The last error the browser reported. A halt is caused by an error that was
 * thrown outside Solid's error handling, so this is the text worth showing
 * next to "it stopped responding" — without it the report is unusable. */
let lastError: string | undefined;

export const rememberedError = (): string | undefined => lastError;

export const rememberErrors = (): (() => void) => {
  const onError = (event: ErrorEvent) => {
    lastError =
      event.error instanceof Error
        ? (event.error.stack ?? event.error.message)
        : event.message;
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    lastError =
      reason instanceof Error
        ? (reason.stack ?? reason.message)
        : String(reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
};

/** The overlay is built with plain DOM on purpose: it exists to survive a dead
 * reactive system, so it must not depend on one. */
export const showHaltOverlay = (detail?: string): void => {
  if (document.getElementById("reline-halt") !== null) return;
  const box = document.createElement("div");
  box.id = "reline-halt";
  box.className = styles.overlay;
  box.setAttribute("role", "alert");

  const title = document.createElement("p");
  title.className = styles.title;
  title.textContent = t("chrome.crash.halted");
  const hint = document.createElement("p");
  hint.className = styles.hint;
  hint.textContent = t("chrome.crash.haltedHint");

  box.append(title, hint);

  if (detail !== undefined && detail.length > 0) {
    const label = document.createElement("p");
    label.className = styles.hint;
    label.textContent = t("chrome.crash.lastError");
    const pre = document.createElement("pre");
    pre.className = styles.detail;
    pre.textContent = detail;
    box.append(label, pre);
  }

  const actions = document.createElement("div");
  actions.className = styles.actions;
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = styles.button;
  reload.textContent = t("chrome.crash.reload");
  reload.addEventListener("click", () => window.location.reload());
  actions.append(reload);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = styles.button;
  copy.textContent = t("chrome.crash.copyError");
  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(
      `${t("chrome.crash.halted")}\n${detail ?? ""}\n${navigator.userAgent}`,
    );
  });
  actions.append(copy);
  box.append(actions);
  document.body.append(box);
};
