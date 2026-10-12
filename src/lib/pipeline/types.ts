import type { LocalText } from "~/lib/i18n";

/** One finding about the pipeline the user is building. Errors stop a run;
 * warnings are shown and let it go on. */
export interface Diagnostic {
  /** Stable id of the rule (`pipeline.empty`, `node.schema`, `acme.no-gpu`).
   * Plugins prefix theirs with their own id. */
  code: string;
  severity: "error" | "warn";
  /** A dictionary key / descriptor for built-in rules, `raw("…")` for a plugin's. */
  message: LocalText;
  /** The node it is about; absent for a finding about the pipeline as a whole. */
  uid?: string;
  /** The option it is about (`exact_tiler_size`, `postprocess.psd.fit`). */
  path?: string;
}
