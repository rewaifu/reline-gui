import { type Dispatch, createContext } from "react"
import type { UseBackendReturn } from "~/hooks/useBackend"
import type { NodesAction } from "~/types/actions.ts"
import type { NodeType } from "~/types/enums"
import type { NodeOptions, StackNode } from "~/types/node"

export const NodesContext = createContext<StackNode[]>([])
export const NodesDispatchContext = createContext<Dispatch<NodesAction>>(() => {})
export const ModelsContext = createContext<string[]>([])
export const DocsNavigationContext = createContext<(slug: string) => void>(() => {})

export type NodeDefaults = Partial<Record<NodeType, Partial<NodeOptions>>>

export interface Preferences {
  playSoundOnComplete: boolean
  notifyOnComplete: boolean
  completionSound: string
  nodeDefaults: NodeDefaults
  defaultReaderPath: string
  defaultWriterPath: string
  modelsFolder: string
}

export interface PreferencesContextValue extends Preferences {
  setPlaySoundOnComplete: (value: boolean) => void
  setNotifyOnComplete: (value: boolean) => void
  setCompletionSound: (value: string) => void
  setDefaultReaderPath: (value: string) => void
  setDefaultWriterPath: (value: string) => void
  setModelsFolder: (value: string) => void
  getDefaultNodeOptions: (type: NodeType) => NodeOptions
  setNodeDefault: (type: NodeType, options: NodeOptions) => void
  resetNodeDefault: (type: NodeType) => void
  resetAllNodeDefaults: () => void
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export interface LocalModelsContextValue {
  modelsFolder: string
  setModelsFolder: (value: string) => void
  localModels: string[]
  loading: boolean
  rescan: () => void
}

export const LocalModelsContext = createContext<LocalModelsContextValue | null>(null)

export type SettingsSection = "deps" | "logs" | "prefs" | "nodes" | "sound"

export interface SettingsContextValue {
  open: boolean
  section: SettingsSection
  setOpen: (open: boolean) => void
  openSettings: (section: SettingsSection) => void
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export type BackendContextValue = UseBackendReturn

export const BackendContext = createContext<BackendContextValue | null>(null)
