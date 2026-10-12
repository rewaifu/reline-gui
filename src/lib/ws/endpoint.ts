import { createSignal } from "solid-js";
import { storage } from "~/lib/storage";

const RUN_ENDPOINT_KEY = "reline-web:runEndpoint";
const DEFAULT_ENDPOINT = "ws://127.0.0.1:8000/run";

const apiEndpointFromUrl = (): string | undefined => {
  const q = new URLSearchParams(window.location.search).get("api")?.trim();
  if (!q) return undefined;
  return q.replace(/^http/, "ws");
};

/** ?api= wins, then the last value typed in the run tab, then the default. */
const resolveEndpoint = (): string =>
  apiEndpointFromUrl() ?? storage.get(RUN_ENDPOINT_KEY) ?? DEFAULT_ENDPOINT;

const initialEndpoint = (): string => {
  if (typeof window === "undefined") return DEFAULT_ENDPOINT;
  try {
    return resolveEndpoint();
  } catch {
    return DEFAULT_ENDPOINT;
  }
};

/** The address the runner is reached at, as one live setting.

 * The run tab edits it, the shared connection (`ls`, plugin calls) dials it, and
 * every keystroke is stored right away. When the field only fed `start()` while
 * `ls` kept dialling `resolveEndpoint()` — and a value typed but never used in a
 * run vanished on the next tab switch — the app looked like it ignored the
 * address entirely.
 */
const [endpoint, setEndpointSignal] = createSignal(initialEndpoint());
export { endpoint };
export const setEndpoint = (value: string) => {
  setEndpointSignal(value);
  // private mode or a full quota: the field keeps the value in memory
  storage.set(RUN_ENDPOINT_KEY, value);
  dropApiParam();
};

/** Typing an address settles it.

 * `?api=` is a seed for a shared link, but one that keeps winning on every
 * reload would silently undo the field — so the first edit drops it from the
 * URL, and the stored value is the only thing left to read.
 */
const dropApiParam = () => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("api")) return;
    url.searchParams.delete("api");
    window.history.replaceState({}, "", url);
  } catch {
    // no history (or an opaque origin): the stored value is enough
  }
};
