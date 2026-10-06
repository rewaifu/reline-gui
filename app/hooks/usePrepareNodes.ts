import { useCallback } from "react"
import { matchModel, useLocalModels } from "~/components/providers/local-models-provider"
import { usePreferences } from "~/components/providers/preferences-provider"
import { useIsTauri } from "~/hooks/useIsTauri"
import { migrateNodes } from "~/lib/config-migration"
import { applyPathOverrides } from "~/lib/node-overrides"
import { NodeType } from "~/types/enums"
import type { StackNode } from "~/types/node"
import type { UpscaleNodeOptions } from "~/types/options"

function applyLocalModelMatches(nodes: StackNode[], localModels: string[]): StackNode[] {
  if (localModels.length === 0) return nodes

  return nodes.map((node) => {
    if (node.type !== NodeType.UPSCALE) return node
    const options = node.options as UpscaleNodeOptions
    if (options.is_own_model || !options.model) return node
    const matched = matchModel(options.model, localModels)
    if (matched && matched !== options.model) {
      return { ...node, options: { ...options, model: matched } }
    }
    return node
  })
}

export function usePrepareNodes(): (nodes: StackNode[]) => StackNode[] {
  const { defaultReaderPath, defaultWriterPath } = usePreferences()
  const isTauri = useIsTauri()
  const { localModels } = useLocalModels()

  return useCallback(
    (nodes: StackNode[]) => {
      const prepared = applyPathOverrides(migrateNodes(nodes), { defaultReaderPath, defaultWriterPath })
      return isTauri ? applyLocalModelMatches(prepared, localModels) : prepared
    },
    [defaultReaderPath, defaultWriterPath, isTauri, localModels],
  )
}
