import type { RunPhase } from "~/lib/run-client";
import type { RunMessage } from "~/lib/run-client";

/** Tab-icon run status: the panda stays only for idle — a busy run draws a
 * progress ring over it, a finished one a green check, a failed one a red
 * cross. Rendered on a canvas into a data-URL `icon` link, so no extra
 * static assets are needed. */
export type FaviconStatus =
  | { kind: "idle" }
  | { kind: "running"; percent: number }
  | { kind: "ok" }
  | { kind: "error" };

/** Pure pick of the icon state: busy phases win, otherwise the last journal
 * line decides, and a fresh page (empty journal) keeps the panda. */
export const faviconStatusFor = (
  phase: RunPhase,
  percent: number | undefined,
  lastKind: RunMessage["kind"] | undefined,
): FaviconStatus => {
  if (phase === "connecting" || phase === "running" || phase === "stopping")
    return { kind: "running", percent: percent ?? 0 };
  if (lastKind === "error") return { kind: "error" };
  if (lastKind === "ok") return { kind: "ok" };
  return { kind: "idle" };
};

const SIZE = 64;
const RING = "#38bdf8";
const OK = "#22c55e";
const ERR = "#ef4444";

let base: HTMLImageElement | undefined;
let baseReady = false;
let pending: FaviconStatus = { kind: "idle" };
let timer: number | undefined;
let angle = 0;
let originalHref: string | undefined;

const iconLink = (): HTMLLinkElement | undefined => {
  const links = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
  ];
  return links.find((l) => l.type === "image/png") ?? links[0];
};

const ensureBase = (draw: () => void) => {
  if (baseReady) {
    draw();
    return;
  }
  if (base === undefined) {
    base = new Image();
    base.onload = () => {
      baseReady = true;
      draw();
    };
    // same relative base the shell's icon links use
    base.src = "./favicon-32x32.png";
    return;
  }
  const prev = pending;
  base.onload = () => {
    baseReady = true;
    pending = prev;
    draw();
  };
};

const paint = (status: FaviconStatus) => {
  const link = iconLink();
  if (link === undefined) return;
  if (originalHref === undefined) originalHref = link.href;
  if (status.kind === "idle") {
    link.href = originalHref;
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx === null || base === undefined) return;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(base, 0, 0, SIZE, SIZE);
  if (status.kind === "running") {
    const pct = Math.min(100, Math.max(0, status.percent)) / 100;
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = RING;
    ctx.beginPath();
    ctx.arc(
      SIZE / 2,
      SIZE / 2,
      24,
      -Math.PI / 2,
      -Math.PI / 2 + pct * Math.PI * 2,
    );
    ctx.stroke();
    // rotating gap marker so 0 % still reads as busy, not stuck
    const a = angle;
    ctx.fillStyle = RING;
    ctx.beginPath();
    ctx.arc(
      SIZE / 2 + 24 * Math.cos(a),
      SIZE / 2 + 24 * Math.sin(a),
      4.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else {
    const color = status.kind === "ok" ? OK : ERR;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(SIZE - 18, SIZE - 18, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (status.kind === "ok") {
      ctx.moveTo(SIZE - 26, SIZE - 18);
      ctx.lineTo(SIZE - 20, SIZE - 11);
      ctx.lineTo(SIZE - 9, SIZE - 25);
    } else {
      ctx.moveTo(SIZE - 25, SIZE - 25);
      ctx.lineTo(SIZE - 11, SIZE - 11);
      ctx.moveTo(SIZE - 11, SIZE - 25);
      ctx.lineTo(SIZE - 25, SIZE - 11);
    }
    ctx.stroke();
  }
  link.href = canvas.toDataURL("image/png");
};

/** Push a new icon state; the running ring animates until replaced. */
export const syncFavicon = (status: FaviconStatus): void => {
  pending = status;
  window.clearInterval(timer);
  timer = undefined;
  if (status.kind === "running") {
    timer = window.setInterval(() => {
      angle += Math.PI / 6;
      ensureBase(() => paint(pending));
    }, 200);
  }
  ensureBase(() => paint(pending));
};
