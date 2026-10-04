import type { Preferences } from "~/context/contexts"
import { NodeType } from "~/types/enums"
import type { StackNode } from "~/types/node"
import type { FolderReaderNodeOptions, FolderWriterNodeOptions } from "~/types/options"

type PathOverrides = Pick<Preferences, "defaultReaderPath" | "defaultWriterPath">

export function applyPathOverrides(nodes: StackNode[], overrides: PathOverrides): StackNode[] {
  if (!overrides.defaultReaderPath && !overrides.defaultWriterPath) {
    return nodes
  }

  return nodes.map((node) => {
    if (node.type === NodeType.FOLDER_READER && overrides.defaultReaderPath) {
      return {
        ...node,
        options: { ...(node.options as FolderReaderNodeOptions), path: overrides.defaultReaderPath },
      }
    }
    if (node.type === NodeType.FOLDER_WRITER && overrides.defaultWriterPath) {
      return {
        ...node,
        options: { ...(node.options as FolderWriterNodeOptions), path: overrides.defaultWriterPath },
      }
    }
    return node
  })
}
