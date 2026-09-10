import type { StackNode } from "~/types/node";

/**
 * Stable per-node identity. `uid` is the ONLY identity a node has: it keys
 * FLIP reorder animations (`data-flip-key`), preprocessors' `meta.parents`,
 * selection, and every reducer action that addresses a node. Missing uids
 * are filled in for nodes loaded from older storage or imported configs.
 */
export const newUid = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `uid-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

export const ensureUids = (list: StackNode[]): StackNode[] =>
  list.map((node) => (node.uid ? node : { ...node, uid: newUid() }));

/**
 * Give an imported list fresh uids: the same preset can be applied twice
 * and saved configs may carry stale or duplicated ids — imports must never
 * reuse whatever identity the serialized payload claims.
 */
export const withFreshUids = (list: StackNode[]): StackNode[] =>
  list.map((node) => ({ ...node, uid: newUid() }));
