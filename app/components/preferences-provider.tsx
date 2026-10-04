import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { DEFAULT_NODE_OPTIONS } from "~/constants"
import { PreferencesContext, type NodeDefaults, type Preferences, type PreferencesContextValue } from "~/context/contexts"
import { isTauriRuntime } from "~/lib/completion-feedback"
import { normalizeWebPath } from "~/lib/paths"
import { NodeType } from "~/types/enums"
import type { FolderReaderNodeOptions, FolderWriterNodeOptions } from "~/types/options"
import type { NodeOptions } from "~/types/node"

const STORAGE_KEY = "preferences"
const LEGACY_MODELS_FOLDER_KEY = "upscale-models-folder"

export const DEFAULT_COMPLETION_SOUND = "/fart.mp3"

const DEFAULT_PREFERENCES: Preferences = {
  playSoundOnComplete: true,
  notifyOnComplete: false,
  completionSound: DEFAULT_COMPLETION_SOUND,
  nodeDefaults: {},
  defaultReaderPath: "",
  defaultWriterPath: "",
  modelsFolder: "",
}

function loadLegacyModelsFolder(): string {
  try {
    return localStorage.getItem(LEGACY_MODELS_FOLDER_KEY) ?? ""
  } catch {
    return ""
  }
}

function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFERENCES, modelsFolder: loadLegacyModelsFolder() }
    const parsed = JSON.parse(raw) as Partial<Preferences> | null
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      nodeDefaults: (parsed?.nodeDefaults ?? {}) as NodeDefaults,
      modelsFolder: parsed?.modelsFolder || loadLegacyModelsFolder(),
    }
  } catch {
    return { ...DEFAULT_PREFERENCES, modelsFolder: loadLegacyModelsFolder() }
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // ignore storage errors
    }
  }, [preferences])

  const setPlaySoundOnComplete = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, playSoundOnComplete: value }))
  }, [])

  const setNotifyOnComplete = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, notifyOnComplete: value }))
  }, [])

  const setCompletionSound = useCallback((value: string) => {
    setPreferences((prev) => ({ ...prev, completionSound: value }))
  }, [])

  const setDefaultReaderPath = useCallback((value: string) => {
    setPreferences((prev) => ({ ...prev, defaultReaderPath: value }))
  }, [])

  const setDefaultWriterPath = useCallback((value: string) => {
    setPreferences((prev) => ({ ...prev, defaultWriterPath: value }))
  }, [])

  const setModelsFolder = useCallback((value: string) => {
    setPreferences((prev) => ({ ...prev, modelsFolder: value }))
  }, [])

  const getDefaultNodeOptions = useCallback(
    (type: NodeType): NodeOptions => {
      const base = { ...DEFAULT_NODE_OPTIONS[type], ...(preferences.nodeDefaults[type] ?? {}) }
      const inWeb = !isTauriRuntime()
      if (type === NodeType.FOLDER_READER) {
        const path = preferences.defaultReaderPath || (base as FolderReaderNodeOptions).path
        return { ...base, path: inWeb ? normalizeWebPath(path) : path } as FolderReaderNodeOptions
      }
      if (type === NodeType.FOLDER_WRITER) {
        const path = preferences.defaultWriterPath || (base as FolderWriterNodeOptions).path
        return { ...base, path: inWeb ? normalizeWebPath(path) : path } as FolderWriterNodeOptions
      }
      return base as NodeOptions
    },
    [preferences.nodeDefaults, preferences.defaultReaderPath, preferences.defaultWriterPath],
  )

  const setNodeDefault = useCallback((type: NodeType, options: NodeOptions) => {
    setPreferences((prev) => ({
      ...prev,
      nodeDefaults: { ...prev.nodeDefaults, [type]: { ...options } },
    }))
  }, [])

  const resetNodeDefault = useCallback((type: NodeType) => {
    setPreferences((prev) => {
      if (!(type in prev.nodeDefaults)) return prev
      const next = { ...prev.nodeDefaults }
      delete next[type]
      return { ...prev, nodeDefaults: next }
    })
  }, [])

  const resetAllNodeDefaults = useCallback(() => {
    setPreferences((prev) => ({ ...prev, nodeDefaults: {} }))
  }, [])

  const value: PreferencesContextValue = useMemo(
    () => ({
      ...preferences,
      setPlaySoundOnComplete,
      setNotifyOnComplete,
      setCompletionSound,
      setDefaultReaderPath,
      setDefaultWriterPath,
      setModelsFolder,
      getDefaultNodeOptions,
      setNodeDefault,
      resetNodeDefault,
      resetAllNodeDefaults,
    }),
    [
      preferences,
      setPlaySoundOnComplete,
      setNotifyOnComplete,
      setCompletionSound,
      setDefaultReaderPath,
      setDefaultWriterPath,
      setModelsFolder,
      getDefaultNodeOptions,
      setNodeDefault,
      resetNodeDefault,
      resetAllNodeDefaults,
    ],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) {
    throw new Error("usePreferences must be used within a PreferencesProvider")
  }
  return ctx
}
