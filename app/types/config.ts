import type { StackNode } from "~/types/node"

export interface UserConfig {
  id: string
  name: string
  nodes: StackNode[]
  createdAt: number
  updatedAt: number
}

export type ActiveConfig = { kind: "preset"; id: string } | { kind: "user"; id: string } | null

export type ConfigBase = { kind: "empty" } | { kind: "preset"; id: string } | { kind: "current" }
