// The entry the app imports. The built-in types are registered as a side effect
// so that anything reading the registry sees a complete one — `registry.ts` on
// its own is the empty registry the built-ins are defined into.
import "~/nodes/builtin";

export {
  nodeLabel,
  nodeMenuEntries,
  nodeRegistry,
  type NodeMenuEntry,
} from "./registry";
export { createDefaultNodes, createNode, defaultOptions } from "./factory";
export type {
  FromPure,
  LegacyMigration,
  NodeDef,
  PrepareRun,
  StackImportContext,
  StackImportOptions,
  ToPure,
  ToPureContext,
} from "./types";
