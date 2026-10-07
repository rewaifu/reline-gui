import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { DEFAULT_NODE_OPTIONS } from "~/constants"
import {
  PreferencesContext,
  SoundPreferencesContext,
  type NodeDefaults,
  type NotifyMode,
  type Preferences,
  type PreferencesContextValue,
  type SoundPreferencesContextValue,
} from "~/context/contexts"
import { isTauriRuntime } from "~/lib/completion-feedback"
import { normalizeWebPath } from "~/lib/paths"
import { DEFAULT_COMPLETION_SOUND } from "~/lib/sound-store"
import { NodeType } from "~/types/enums"
import type { FolderReaderNodeOptions, FolderWriterNodeOptions } from "~/types/options"
import type { NodeOptions } from "~/types/node"

const STORAGE_KEY = "preferences"
const LEGACY_MODELS_FOLDER_KEY = "upscale-models-folder"

export { DEFAULT_COMPLETION_SOUND }

const DEFAULT_PREFERENCES: Preferences = {
  playSoundOnComplete: true,
  notifyOnComplete: false,
  notifyMode: "always",
  completionSound: DEFAULT_COMPLETION_SOUND,
  maxSoundDuration: 5,
  maxSoundDurationEnabled: true,
  soundVolume: 0.2,
  screentoneUseSsaa: true,
  screentoneMinProduct: 10,
  screentoneFractionalDot: false,
  forceStopBackend: false,
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

let soundPreferencesSnapshot: SoundPreferencesContextValue | null = null

export function getSoundPreferencesSnapshot(): SoundPreferencesContextValue | null {
  return soundPreferencesSnapshot
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
      } catch {
        // ignore storage errors
      }
    }, 200)
    return () => window.clearTimeout(handle)
  }, [preferences])

  const setPlaySoundOnComplete = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, playSoundOnComplete: value }))
  }, [])

  const setNotifyOnComplete = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, notifyOnComplete: value }))
  }, [])

  const setNotifyMode = useCallback((value: NotifyMode) => {
    setPreferences((prev) => ({ ...prev, notifyMode: value }))
  }, [])

  const setCompletionSound = useCallback((value: string) => {
    setPreferences((prev) => ({ ...prev, completionSound: value }))
  }, [])

  const setMaxSoundDuration = useCallback((value: number) => {
    setPreferences((prev) => ({ ...prev, maxSoundDuration: value }))
  }, [])

  const setMaxSoundDurationEnabled = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, maxSoundDurationEnabled: value }))
  }, [])

  const setSoundVolume = useCallback((value: number) => {
    setPreferences((prev) => ({ ...prev, soundVolume: value }))
  }, [])

  const setScreentoneUseSsaa = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, screentoneUseSsaa: value }))
  }, [])

  const setScreentoneMinProduct = useCallback((value: number) => {
    setPreferences((prev) => ({ ...prev, screentoneMinProduct: value }))
  }, [])

  const setScreentoneFractionalDot = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, screentoneFractionalDot: value }))
  }, [])

  const setForceStopBackend = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, forceStopBackend: value }))
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
      screentoneUseSsaa: preferences.screentoneUseSsaa,
      screentoneMinProduct: preferences.screentoneMinProduct,
      screentoneFractionalDot: preferences.screentoneFractionalDot,
      forceStopBackend: preferences.forceStopBackend,
      nodeDefaults: preferences.nodeDefaults,
      defaultReaderPath: preferences.defaultReaderPath,
      defaultWriterPath: preferences.defaultWriterPath,
      modelsFolder: preferences.modelsFolder,
      setScreentoneUseSsaa,
      setScreentoneMinProduct,
      setScreentoneFractionalDot,
      setForceStopBackend,
      setDefaultReaderPath,
      setDefaultWriterPath,
      setModelsFolder,
      getDefaultNodeOptions,
      setNodeDefault,
      resetNodeDefault,
      resetAllNodeDefaults,
    }),
    [
      preferences.screentoneUseSsaa,
      preferences.screentoneMinProduct,
      preferences.screentoneFractionalDot,
      preferences.forceStopBackend,
      preferences.nodeDefaults,
      preferences.defaultReaderPath,
      preferences.defaultWriterPath,
      preferences.modelsFolder,
      setScreentoneUseSsaa,
      setScreentoneMinProduct,
      setScreentoneFractionalDot,
      setForceStopBackend,
      setDefaultReaderPath,
      setDefaultWriterPath,
      setModelsFolder,
      getDefaultNodeOptions,
      setNodeDefault,
      resetNodeDefault,
      resetAllNodeDefaults,
    ],
  )

  const soundValue: SoundPreferencesContextValue = useMemo(
    () => ({
      playSoundOnComplete: preferences.playSoundOnComplete,
      notifyOnComplete: preferences.notifyOnComplete,
      notifyMode: preferences.notifyMode,
      completionSound: preferences.completionSound,
      maxSoundDuration: preferences.maxSoundDuration,
      maxSoundDurationEnabled: preferences.maxSoundDurationEnabled,
      soundVolume: preferences.soundVolume,
      setPlaySoundOnComplete,
      setNotifyOnComplete,
      setNotifyMode,
      setCompletionSound,
      setMaxSoundDuration,
      setMaxSoundDurationEnabled,
      setSoundVolume,
    }),
    [
      preferences.playSoundOnComplete,
      preferences.notifyOnComplete,
      preferences.notifyMode,
      preferences.completionSound,
      preferences.maxSoundDuration,
      preferences.maxSoundDurationEnabled,
      preferences.soundVolume,
      setPlaySoundOnComplete,
      setNotifyOnComplete,
      setNotifyMode,
      setCompletionSound,
      setMaxSoundDuration,
      setMaxSoundDurationEnabled,
      setSoundVolume,
    ],
  )

  soundPreferencesSnapshot = soundValue

  return (
    <PreferencesContext.Provider value={value}>
      <SoundPreferencesContext.Provider value={soundValue}>{children}</SoundPreferencesContext.Provider>
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) {
    throw new Error("usePreferences must be used within a PreferencesProvider")
  }
  return ctx
}

export function useSoundPreferences(): SoundPreferencesContextValue {
  const ctx = useContext(SoundPreferencesContext)
  if (!ctx) {
    throw new Error("useSoundPreferences must be used within a PreferencesProvider")
  }
  return ctx
}
