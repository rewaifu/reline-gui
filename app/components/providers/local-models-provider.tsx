import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePreferences } from "~/components/providers/preferences-provider"
import { LocalModelsContext, type LocalModelsContextValue } from "~/context/contexts"
import { useIsTauri } from "~/hooks/useIsTauri"

const MODEL_EXTENSIONS = /\.(pt|pth|safetensors)$/i

export function modelBasename(path: string): string {
  return path
    .replace(/^.*[\\/]/, "")
    .replace(MODEL_EXTENSIONS, "")
    .toLowerCase()
}

export function matchModel(model: string, localModels: string[]): string | undefined {
  if (!model) return undefined
  const target = modelBasename(model)
  return localModels.find((candidate) => modelBasename(candidate) === target)
}

export function LocalModelsProvider({ children }: { children: ReactNode }) {
  const isTauri = useIsTauri()
  const { modelsFolder, setModelsFolder } = usePreferences()
  const [localModels, setLocalModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  const rescan = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    void nonce

    if (!isTauri || !modelsFolder) {
      setLocalModels([])
      return
    }

    let cancelled = false
    setLoading(true)

    const scan = async () => {
      try {
        const { readDir } = await import("@tauri-apps/plugin-fs")
        const entries = await readDir(modelsFolder)
        const folder = modelsFolder.replace(/\\/g, "/")
        const files = entries.filter((entry) => entry.name && MODEL_EXTENSIONS.test(entry.name)).map((entry) => `${folder}/${entry.name}`)
        if (!cancelled) setLocalModels(files)
      } catch (err) {
        console.error("Failed to read models folder:", err)
        if (!cancelled) setLocalModels([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void scan()

    return () => {
      cancelled = true
    }
  }, [isTauri, modelsFolder, nonce])

  const value = useMemo<LocalModelsContextValue>(
    () => ({ modelsFolder, setModelsFolder, localModels, loading, rescan }),
    [modelsFolder, setModelsFolder, localModels, loading, rescan],
  )

  return <LocalModelsContext.Provider value={value}>{children}</LocalModelsContext.Provider>
}

export function useLocalModels(): LocalModelsContextValue {
  const ctx = useContext(LocalModelsContext)
  if (!ctx) {
    throw new Error("useLocalModels must be used within a LocalModelsProvider")
  }
  return ctx
}
