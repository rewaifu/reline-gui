import { DEFAULT_NODES, STORAGE_KEY } from "~/constants"
import type { StackNode } from "~/types/node"

export function normalizeNodeIds(nodes: StackNode[]): StackNode[] {
  const usedIds = new Set<number>()
  let nextId = 0

  return nodes.map((node, index) => {
    const fallbackId = index
    const rawId = typeof node.id === "number" ? node.id : fallbackId
    const candidate = Number.isNaN(rawId) ? fallbackId : rawId

    if (!usedIds.has(candidate)) {
      usedIds.add(candidate)
      nextId = Math.max(nextId, candidate + 1)
      return { ...node, id: candidate }
    }

    while (usedIds.has(nextId)) {
      nextId += 1
    }

    const normalized = { ...node, id: nextId }
    usedIds.add(nextId)
    nextId += 1
    return normalized
  })
}

export function loadInitialNodes(prepareNodes: (nodes: StackNode[]) => StackNode[]): StackNode[] {
  const data = localStorage.getItem(STORAGE_KEY)
  if (data) {
    try {
      const parsedNodes = JSON.parse(data)
      return normalizeNodeIds(prepareNodes(parsedNodes))
    } catch (error) {
      console.error("Err parsing from storage:", error)
      return prepareNodes(DEFAULT_NODES)
    }
  }
  return prepareNodes(DEFAULT_NODES)
}
