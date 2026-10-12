import * as v from "valibot";
import { message, raw } from "~/lib/i18n";
import { nodeRegistry } from "~/lib/nodes";
import { NodeType } from "~/types/enums";
import type { StackNode } from "~/types/node";
import { pipeline } from "./hooks";
import type { Diagnostic } from "./types";

/** Findings about the pipeline as a whole. Warnings, not errors, where a
 * plugin's node could plausibly stand in (a reader of its own). */
const pipelineRules = (nodes: readonly StackNode[]): Diagnostic[] => {
  if (nodes.length === 0)
    return [
      { code: "pipeline.empty", severity: "error", message: "diag.empty" },
    ];
  const active = nodes.filter((node) => node.enabled !== false);
  if (active.length === 0)
    return [
      {
        code: "pipeline.noneEnabled",
        severity: "error",
        message: "diag.noneEnabled",
      },
    ];
  const found: Diagnostic[] = [];
  if (!active.some((node) => node.type === NodeType.FOLDER_READER))
    found.push({
      code: "pipeline.noReader",
      severity: "warn",
      message: "diag.noReader",
    });
  if (!active.some((node) => node.type === NodeType.FOLDER_WRITER))
    found.push({
      code: "pipeline.noWriter",
      severity: "warn",
      message: "diag.noWriter",
    });
  return found;
};

/** What one node's options are checked against: its definition's schema, then
 * the definition's own `validate`. A node nothing defines is an orphan — kept
 * and exported as it is, but the runner may not know it. */
const nodeRules = (node: StackNode): Diagnostic[] => {
  const def = nodeRegistry.get(node.type);
  if (def === undefined)
    return [
      {
        code: "node.orphan",
        severity: "warn",
        uid: node.uid,
        message: message("diag.orphan", { type: node.type }),
      },
    ];
  const found: Diagnostic[] = [];
  if (def.schema !== undefined) {
    const result = v.safeParse(def.schema, node.options);
    if (!result.success)
      for (const issue of result.issues)
        found.push({
          code: "node.schema",
          severity: "error",
          uid: node.uid,
          path: issue.path?.map((step) => String(step.key)).join("."),
          message: message("diag.field", {
            field: issue.path?.map((step) => String(step.key)).join(".") ?? "",
            detail: raw(issue.message),
          }),
        });
  }
  try {
    found.push(
      ...(def.validate?.(node) ?? []).map((d) => ({ ...d, uid: node.uid })),
    );
  } catch (error) {
    found.push({
      code: "node.validateFailed",
      severity: "error",
      uid: node.uid,
      message: message("diag.validateFailed", {
        detail: error instanceof Error ? error.message : String(error),
      }),
    });
  }
  return found;
};

/** Everything wrong (or doubtful) about the stack: built-in rules, each node's
 * own checks, then the `validate` hooks. Never throws — it runs in a memo. */
export const validateNodes = (nodes: readonly StackNode[]): Diagnostic[] => [
  ...pipelineRules(nodes),
  ...nodes.flatMap(nodeRules),
  ...pipeline.collect(nodes),
];
