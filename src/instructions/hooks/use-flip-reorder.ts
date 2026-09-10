/**
 * FLIP reorder animation: capture item positions keyed by a stable identity
 * (see `getKey`), apply the mutation, then animate every item from its old
 * spot to the new one with the Web Animations API.
 *
 * WAAPI is used instead of inline `transition` juggling on purpose: the
 * transform offset and the release never collapse into a single style pass,
 * so the animation reliably plays even while Solid is flushing the DOM
 * reorder. Positions are measured relative to the scroll container, so
 * container scrolling cannot skew them.
 */
export const flipReorder = (
  container: HTMLElement | undefined,
  itemSelector: string,
  mutate: () => void,
  getKey: (el: HTMLElement) => string | null = (el) =>
    el.dataset.nodeId ?? null,
): void => {
  if (!container) {
    mutate();
    return;
  }

  const relativeTop = (el: HTMLElement): number =>
    el.getBoundingClientRect().top - container.getBoundingClientRect().top;

  const firstTop = new Map<string, number>();
  for (const el of Array.from(
    container.querySelectorAll<HTMLElement>(itemSelector),
  )) {
    const key = getKey(el);
    if (key !== null) firstTop.set(key, relativeTop(el));
  }

  mutate();

  requestAnimationFrame(() => {
    for (const el of Array.from(
      container.querySelectorAll<HTMLElement>(itemSelector),
    )) {
      const key = getKey(el);
      const prevTop = key === null ? undefined : firstTop.get(key);
      if (prevTop === undefined) continue;
      const delta = prevTop - relativeTop(el);
      if (Math.abs(delta) < 1) continue;
      el.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: "none" }],
        {
          duration: 350,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    }
  });
};
