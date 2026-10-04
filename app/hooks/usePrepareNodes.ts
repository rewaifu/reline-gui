import { useCallback } from "react"
import { usePreferences } from "~/components/providers/preferences-provider"
import { migrateNodes } from "~/lib/config-migration"
import { applyPathOverrides } from "~/lib/node-overrides"
import type { StackNode } from "~/types/node"

export function usePrepareNodes(): (nodes: StackNode[]) => StackNode[] {
  const { defaultReaderPath, defaultWriterPath } = usePreferences()

  return useCallback(
    (nodes: StackNode[]) => applyPathOverrides(migrateNodes(nodes), { defaultReaderPath, defaultWriterPath }),
    [defaultReaderPath, defaultWriterPath],
  )
}
