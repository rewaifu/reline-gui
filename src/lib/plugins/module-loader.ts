/**
 * Turns verified plugin code into a module. The code is the exact string whose
 * hash was checked — it is imported from a Blob, never re-fetched from its URL,
 * so nothing can be swapped between the check and the run. (Needs `blob:` in a
 * `script-src` policy, if the page has one.)
 *
 * A seam for tests: jsdom cannot import a Blob URL.
 */
export type ModuleLoader = (code: string) => Promise<unknown>;

const importFromBlob: ModuleLoader = async (code) => {
  const url = URL.createObjectURL(
    new Blob([code], { type: "text/javascript" }),
  );
  try {
    return (await import(/* @vite-ignore */ url)) as unknown;
  } finally {
    URL.revokeObjectURL(url);
  }
};

let loader: ModuleLoader = importFromBlob;

export const loadModule: ModuleLoader = (code) => loader(code);

/** Replace the loader; returns a function that restores the previous one. */
export const setModuleLoader = (next: ModuleLoader): (() => void) => {
  const previous = loader;
  loader = next;
  return () => {
    loader = previous;
  };
};
