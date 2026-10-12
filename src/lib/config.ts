import type { PureConfig, StackNode } from "~/types/node";
import {
  convertToStack,
  exportConfig,
  type StackImportOptions,
} from "~/lib/convert";
import { message } from "~/lib/i18n";
import { pipeline } from "~/lib/pipeline/hooks";
import { validateNodes } from "~/lib/pipeline/validate";
import type { Diagnostic } from "~/lib/pipeline/types";

/** The config as the text the user sees, copies and downloads — the same text
 * a hook of the `export.serialize` stage may rewrite. Throws only when the
 * config holds something JSON cannot carry (a cycle, a BigInt); `analyze`
 * catches that for the memo, a one-off caller can too. */
const serializeConfig = (config: PureConfig): string =>
  pipeline.apply("export.serialize", JSON.stringify(config, null, 2), config);

/** The config as JSON text. Never throws for node data: a node that cannot be
 * serialised is written as it is (see `exportConfig` for the report). */
export const nodesToString = (nodes: readonly StackNode[]): string =>
  serializeConfig(exportConfig(nodes).config);

/** A config text read as nodes. A hook of the `import.parse` stage sees the
 * parsed JSON first (an older or foreign shape can be rewritten there). */
export const stringToNodes = (
  text: string,
  options: StackImportOptions = {},
): StackNode[] =>
  convertToStack(
    pipeline.apply("import.parse", JSON.parse(text) as unknown) as Parameters<
      typeof convertToStack
    >[0],
    options,
  );

/** Everything the UI knows about the stack as it stands. */
export interface Analysis {
  config: PureConfig;
  /** The config as shown in the Code tab ("" when it cannot be serialised). */
  text: string;
  diagnostics: readonly Diagnostic[];
  /** The diagnostics that name a node, by its uid. */
  byUid: ReadonlyMap<string, readonly Diagnostic[]>;
  errors: number;
  warnings: number;
}

/** Serialise and validate the stack in one pass. Pure and total: every input a
 * user (or a plugin) can produce comes back as findings, never as a throw — the
 * UI calls this inside a memo, where an exception halts Solid's reactive
 * system. */
export const analyze = (nodes: readonly StackNode[]): Analysis => {
  const { config, issues } = exportConfig(nodes);
  const found = validateNodes(nodes);
  // a node the schema already flagged would be reported twice: its converter
  // fails on the very same value
  const flagged = new Set(
    found.filter((d) => d.severity === "error").map((d) => d.uid),
  );
  const diagnostics: Diagnostic[] = [
    ...issues
      .filter((issue) => !flagged.has(issue.uid))
      .map((issue): Diagnostic => ({
        code: "node.convert",
        severity: "error",
        uid: issue.uid,
        message: message("diag.convertFailed", { detail: issue.message }),
      })),
    ...found,
  ];
  let text = "";
  try {
    text = serializeConfig(config);
  } catch (error) {
    diagnostics.push({
      code: "export.failed",
      severity: "error",
      message: message("diag.exportFailed", {
        detail: error instanceof Error ? error.message : String(error),
      }),
    });
  }
  const byUid = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.uid === undefined) continue;
    const list = byUid.get(diagnostic.uid) ?? [];
    list.push(diagnostic);
    byUid.set(diagnostic.uid, list);
  }
  return {
    config,
    text,
    diagnostics,
    byUid,
    errors: diagnostics.filter((d) => d.severity === "error").length,
    warnings: diagnostics.filter((d) => d.severity === "warn").length,
  };
};
