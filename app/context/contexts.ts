import { type Dispatch, createContext } from "react"
import type { UseBackendReturn } from "~/hooks/useBackend"
import type { NodesAction } from "~/types/actions.ts"
import type { DownloadState } from "~/types/backend"
import type { ActiveConfig, ConfigBase, UserConfig } from "~/types/config"
import type { NodeType } from "~/types/enums"
import type { NodeOptions, StackNode } from "~/types/node"

export const NodesContext = createContext<StackNode[]>([])
export const NodesDispatchContext = createContext<Dispatch<NodesAction>>(() => {})
export const ModelsContext = createContext<string[]>([])
export const DocsNavigationContext = createContext<(slug: string) => void>(() => {})

export interface ActiveNodeContextValue {
  activeNodeId: number | null
  setActiveNodeId: (id: number) => void
}

export const ActiveNodeContext = createContext<ActiveNodeContextValue | null>(null)

export type CreateDialogMode = "full" | "name-only"

export interface ConfigsContextValue {
  userConfigs: UserConfig[]
  activeConfig: ActiveConfig
  activeName: string
  dirty: boolean
  createDialogOpen: boolean
  createDialogMode: CreateDialogMode
  loadConfig: (target: ActiveConfig) => void
  createConfig: (name: string, base: ConfigBase) => void
  saveActiveConfig: () => void
  renameConfig: (id: string, name: string) => void
  deleteConfig: (id: string) => void
  openCreateDialog: (mode?: CreateDialogMode) => void
}

export const ConfigsContext = createContext<ConfigsContextValue | null>(null)

export type NodeDefaults = Partial<Record<NodeType, Partial<NodeOptions>>>

export type NotifyMode = "always" | "when-minimized"

export interface Preferences {
  playSoundOnComplete: boolean
  notifyOnComplete: boolean
  notifyMode: NotifyMode
  completionSound: string
  maxSoundDuration: number
  maxSoundDurationEnabled: boolean
  soundVolume: number
  screentoneUseSsaa: boolean
  screentoneMinProduct: number
  screentoneFractionalDot: boolean
  forceStopBackend: boolean
  nodeDefaults: NodeDefaults
  defaultReaderPath: string
  defaultWriterPath: string
  modelsFolder: string
}

export interface SoundPreferences {
  playSoundOnComplete: boolean
  notifyOnComplete: boolean
  notifyMode: NotifyMode
  completionSound: string
  maxSoundDuration: number
  maxSoundDurationEnabled: boolean
  soundVolume: number
}

export type GeneralPreferences = Omit<Preferences, keyof SoundPreferences>

export interface PreferencesContextValue extends GeneralPreferences {
  setScreentoneUseSsaa: (value: boolean) => void
  setScreentoneMinProduct: (value: number) => void
  setScreentoneFractionalDot: (value: boolean) => void
  setForceStopBackend: (value: boolean) => void
  setDefaultReaderPath: (value: string) => void
  setDefaultWriterPath: (value: string) => void
  setModelsFolder: (value: string) => void
  getDefaultNodeOptions: (type: NodeType) => NodeOptions
  setNodeDefault: (type: NodeType, options: NodeOptions) => void
  resetNodeDefault: (type: NodeType) => void
  resetAllNodeDefaults: () => void
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export interface SoundPreferencesContextValue extends SoundPreferences {
  setPlaySoundOnComplete: (value: boolean) => void
  setNotifyOnComplete: (value: boolean) => void
  setNotifyMode: (value: NotifyMode) => void
  setCompletionSound: (value: string) => void
  setMaxSoundDuration: (value: number) => void
  setMaxSoundDurationEnabled: (value: boolean) => void
  setSoundVolume: (value: number) => void
}

export const SoundPreferencesContext = createContext<SoundPreferencesContextValue | null>(null)

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

export interface ModelDownloadsContextValue {
  downloads: Record<string, DownloadState>
  activeCount: number
  startDownload: (filename: string, url: string) => Promise<void>
  cancelDownload: (filename: string) => void
  deleteModel: (modelName: string) => Promise<void>
  clearDownload: (filename: string) => void
}

export const ModelDownloadsContext = createContext<ModelDownloadsContextValue | null>(null)
