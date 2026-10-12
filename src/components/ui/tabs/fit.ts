export interface FitInput {
  /** Natural width of every tab, in order. */
  widths: readonly number[];
  /** Index of the selected tab, or -1: it is never put into the menu. */
  active: number;
  /** Width of the strip the tabs and the menu button share. */
  available: number;
  gap: number;
  /** Width of the menu button. */
  menu: number;
}

/**
 * Which tabs stay on the strip; the rest go to the menu button. Tabs keep their
 * order, the selected one is always kept (a selection you cannot see is a lost
 * place), and the others fill what is left from the start. Returns a set of
 * indexes; the menu button takes its room only when something is left out.
 */
export const fitTabs = ({
  widths,
  active,
  available,
  gap,
  menu,
}: FitInput): Set<number> => {
  const all = new Set(widths.keys());
  const row = (count: number, width: number) =>
    width + Math.max(0, count - 1) * gap;
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (row(widths.length, total) <= available) return all;

  // the menu button sits in the row with the tabs
  const room = available - menu - gap;
  const kept = new Set<number>();
  let used = 0;
  const take = (i: number) => {
    const width = widths[i] ?? 0;
    const next = row(kept.size + 1, used + width);
    if (next > room) return false;
    kept.add(i);
    used += width;
    return true;
  };
  // the selected tab first, even when nothing else then fits next to it
  if (active >= 0 && active < widths.length) {
    kept.add(active);
    used = widths[active] ?? 0;
  }
  for (let i = 0; i < widths.length; i += 1) {
    if (i === active) continue;
    // stop at the first that does not fit: the strip stays a prefix, not a
    // random pick of the short labels
    if (!take(i)) break;
  }
  return kept;
};
