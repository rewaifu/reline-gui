import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { type UnlistenFn, listen } from "@tauri-apps/api/event"
import { loadModelDownloaderDialog } from "~/components/providers/lazy-dialogs"
import { useLocalModels } from "~/components/providers/local-models-provider"
import { ModelDownloadsContext, type ModelDownloadsContextValue } from "~/context/contexts"
import { useIsTauri } from "~/hooks/useIsTauri"
import type { DownloadState, ModelDownloadProgress } from "~/types/backend"

const CANCELLED_MARKER = "cancelled"

// Keep the spinner up at least this long so the feedback is actually visible
// even when the chunk is served from cache and resolves within a microtask.
const MIN_SPINNER_MS = 300

export function ModelDownloadsProvider({ children }: { children: ReactNode }) {
  const isTauri = useIsTauri()
  const { modelsFolder, rescan } = useLocalModels()
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogFilter, setDialogFilter] = useState("")
  const [dialogPending, setDialogPending] = useState(false)
  const dialogReadyRef = useRef(false)
  const dialogShownAtRef = useRef(0)
  const modelsFolderRef = useRef(modelsFolder)
  modelsFolderRef.current = modelsFolder

  useEffect(() => {
    if (!isTauri) return

    let cancelled = false
    let unlisten: UnlistenFn | null = null

    listen<ModelDownloadProgress>("model-download-progress", (event) => {
      if (cancelled) return
      const { filename, progress, downloaded, total, stage } = event.payload
      setDownloads((prev) => ({
        ...prev,
        [filename]: {
          status: stage,
          progress: Math.round(progress),
          downloaded,
          total,
          error: prev[filename]?.error,
        },
      }))
    })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
      .catch(() => {})

    return () => {
      cancelled = true
      if (unlisten) unlisten()
    }
  }, [isTauri])

  const startDownload = useCallback(
    async (filename: string, url: string) => {
      const targetDir = modelsFolderRef.current
      if (!targetDir) {
        setDownloads((prev) => ({
          ...prev,
          [filename]: { status: "error", progress: 0, downloaded: 0, total: 0, error: "no-folder" },
        }))
        return
      }

      setDownloads((prev) => ({
        ...prev,
        [filename]: { status: "downloading", progress: 0, downloaded: 0, total: 0 },
      }))

      try {
        await invoke("download_model", { url, filename, targetDir })
        setDownloads((prev) => ({
          ...prev,
          [filename]: { status: "done", progress: 100, downloaded: prev[filename]?.downloaded ?? 0, total: prev[filename]?.total ?? 0 },
        }))
        rescan()
      } catch (err) {
        const message = String(err)
        const isCancelled = message.toLowerCase().includes(CANCELLED_MARKER)
        setDownloads((prev) => ({
          ...prev,
          [filename]: {
            status: isCancelled ? "cancelled" : "error",
            progress: prev[filename]?.progress ?? 0,
            downloaded: prev[filename]?.downloaded ?? 0,
            total: prev[filename]?.total ?? 0,
            error: isCancelled ? undefined : message,
          },
        }))
      }
    },
    [rescan],
  )

  const cancelDownload = useCallback((filename: string) => {
    void invoke("cancel_model_download", { filename }).catch(() => {})
  }, [])

  const deleteModel = useCallback(
    async (modelName: string) => {
      await invoke("delete_model", { folder: modelsFolderRef.current, modelName })
      rescan()
    },
    [rescan],
  )

  const clearDownload = useCallback((filename: string) => {
    setDownloads((prev) => {
      const next = { ...prev }
      delete next[filename]
      return next
    })
  }, [])

  const openDialog = useCallback((filter = "") => {
    setDialogFilter(filter)
    setDialogOpen(true)
    if (!dialogReadyRef.current) {
      dialogShownAtRef.current = performance.now()
      setDialogPending(true)
    }
  }, [])

  const preloadDialog = useCallback(() => {
    void loadModelDownloaderDialog()
  }, [])

  const markModelDownloaderReady = useCallback(() => {
    dialogReadyRef.current = true
    const remaining = MIN_SPINNER_MS - (performance.now() - dialogShownAtRef.current)
    if (remaining > 0) {
      window.setTimeout(() => setDialogPending(false), remaining)
    } else {
      setDialogPending(false)
    }
  }, [])

  const closeDialog = useCallback(() => setDialogOpen(false), [])

  const activeCount = useMemo(
    () => Object.values(downloads).filter((d) => d.status === "downloading" || d.status === "extracting").length,
    [downloads],
  )

  const value = useMemo<ModelDownloadsContextValue>(
    () => ({
      downloads,
      activeCount,
      dialogOpen,
      dialogFilter,
      dialogPending,
      openDialog,
      closeDialog,
      preloadDialog,
      markModelDownloaderReady,
      startDownload,
      cancelDownload,
      deleteModel,
      clearDownload,
    }),
    [
      downloads,
      activeCount,
      dialogOpen,
      dialogFilter,
      dialogPending,
      openDialog,
      closeDialog,
      preloadDialog,
      markModelDownloaderReady,
      startDownload,
      cancelDownload,
      deleteModel,
      clearDownload,
    ],
  )

  return <ModelDownloadsContext.Provider value={value}>{children}</ModelDownloadsContext.Provider>
}

export function useModelDownloads(): ModelDownloadsContextValue {
  const ctx = useContext(ModelDownloadsContext)
  if (!ctx) {
    throw new Error("useModelDownloads must be used within a ModelDownloadsProvider")
  }
  return ctx
}
