import { createSignal, onSettled, type Accessor } from "solid-js";

/**
 * Reactive `matchMedia`: the signal follows the live query, so rotating a
 * phone or resizing a window re-evaluates the layout without a reload.
 * `window` is read lazily — the initial value is computed on the client.
 */
export const createMediaQuery = (query: string): Accessor<boolean> => {
  const [matches, setMatches] = createSignal(window.matchMedia(query).matches);
  onSettled(() => {
    const list = window.matchMedia(query);
    const sync = () => setMatches(list.matches);
    // the query may have changed between the first render and the effect
    sync();
    list.addEventListener("change", sync);
    // onSettled takes the cleanup as a return value — `onCleanup` inside it
    // is a forbidden scope and halts the reactive system
    return () => list.removeEventListener("change", sync);
  });
  return matches;
};
