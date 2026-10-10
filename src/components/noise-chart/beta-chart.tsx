import { createMemo, type Component } from "solid-js";
import type { NoiseNodeOptions } from "~/types/options/noise";
import styles from "./beta-chart.module.scss";

/** Beta(a, b) pdf via log-gamma (Lanczos), sampled on [0, 1]. */
const logGamma = (z: number): number => {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0]!;
  for (let i = 1; i < 9; i += 1) x += c[i]! / (z + i);
  const t = z + 7.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
  );
};

const pdf = (x: number, a: number, b: number): number => {
  if (x <= 0 || x >= 1) return 0;
  if (a <= 0 || b <= 0 || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const logB = logGamma(a) + logGamma(b) - logGamma(a + b);
  const v = Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logB);
  return Number.isFinite(v) ? v : 0;
};

const N = 60;
const W = 280;
const H = 96;
const PAD = 6;

/** Live Beta(a, b) density of the noise the node adds (before the alpha
 * scaling): `rng.beta(a, b) * 2 - 1`. Recomputes from the selected node's
 * current a/b — the guide's chart always matches the form. */
export const BetaChart: Component<{ options: NoiseNodeOptions }> = (props) => {
  const curve = createMemo(() => {
    const a = props.options.a;
    const b = props.options.b;
    const ys = Array.from({ length: N + 1 }, (_, i) => pdf(i / N, a, b));
    // headroom so the peak never kisses the frame's top edge
    const peak = Math.max(1e-9, ...ys) * 1.1;
    return ys
      .map(
        (y, i) =>
          `${(PAD + (i / N) * (W - 2 * PAD)).toFixed(1)},${(H - PAD - (y / peak) * (H - 2 * PAD)).toFixed(1)}`,
      )
      .join(" ");
  });
  const midX = PAD + 0.5 * (W - 2 * PAD);
  return (
    <figure class={styles.chart}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        class={styles.plot}
        role="img"
        aria-label={`Beta(${props.options.a}, ${props.options.b})`}
      >
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - PAD}
          y2={H - PAD}
          class={styles.axis}
        />
        <line x1={midX} y1={PAD} x2={midX} y2={H - PAD} class={styles.zero} />
        <polyline points={curve()} class={styles.curve} />
      </svg>
      <figcaption class={styles.caption}>
        <span>−255</span>
        <span>0</span>
        <span>+255</span>
      </figcaption>
    </figure>
  );
};
