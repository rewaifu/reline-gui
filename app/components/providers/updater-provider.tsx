import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { usePreferences } from "~/components/providers/preferences-provider"
import { UpdaterContext } from "~/context/contexts"
import { isTauriRuntime } from "~/lib/completion-feedback"
import type { UpdateInfo, UpdateStatus, UpdaterContextValue } from "~/types/updater"

const AUTO_CHECK_DELAY_MS = 3000

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { autoCheckUpdates } = usePreferences()
  const [status, setStatus] = useState<UpdateStatus>("idle")
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const updateRef = useRef<Update | null>(null)
  const busyRef = useRef(false)
  const didAutoCheckRef = useRef(false)

  const closeUpdate = useCallback(async () => {
    const current = updateRef.current
    updateRef.current = null
    if (current) {
      try {
        await current.close()
      } catch {
        // resource already released
      }
    }
  }, [])

  const checkForUpdates = useCallback(
    async (silent = false) => {
      if (!isTauriRuntime() || busyRef.current) return
      busyRef.current = true
      setStatus("checking")
      setError(null)
      try {
        const next = await check()
        if (next) {
          await closeUpdate()
          updateRef.current = next
          setUpdate({ version: next.version, currentVersion: next.currentVersion, body: next.body, date: next.date })
          setStatus("available")
          toast.info(t("backend.updates.availableToast", { version: next.version }))
        } else {
          setUpdate(null)
          setStatus("up-to-date")
          if (!silent) toast.success(t("backend.updates.upToDateToast"))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStatus("error")
        if (!silent) toast.error(t("backend.updates.checkError"))
      } finally {
        busyRef.current = false
      }
    },
    [closeUpdate, t],
  )

  useEffect(() => {
    if (!isTauriRuntime() || !autoCheckUpdates || didAutoCheckRef.current) return
    const id = window.setTimeout(() => {
      didAutoCheckRef.current = true
      void checkForUpdates(true)
    }, AUTO_CHECK_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [autoCheckUpdates, checkForUpdates])

  const downloadAndInstall = useCallback(async () => {
    const current = updateRef.current
    if (!current || busyRef.current) return
    busyRef.current = true
    setStatus("downloading")
    setProgress(null)
    setError(null)
    let downloaded = 0
    let total = 0
    try {
      await current.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0
          setProgress(total ? 0 : null)
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength
          setProgress(total ? Math.min(100, (downloaded / total) * 100) : null)
        } else {
          setProgress(100)
        }
      })
      updateRef.current = null
      setStatus("ready")
      toast.success(t("backend.updates.installedToast"))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus("error")
      toast.error(t("backend.updates.installError"))
    } finally {
      busyRef.current = false
    }
  }, [t])

  const restart = useCallback(async () => {
    try {
      await relaunch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const dismiss = useCallback(() => {
    void closeUpdate()
    setUpdate(null)
    setProgress(null)
    setError(null)
    setStatus("idle")
  }, [closeUpdate])

  const value: UpdaterContextValue = useMemo(
    () => ({ status, update, progress, error, checkForUpdates, downloadAndInstall, restart, dismiss }),
    [status, update, progress, error, checkForUpdates, downloadAndInstall, restart, dismiss],
  )

  return <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>
}

export function useUpdater(): UpdaterContextValue {
  const ctx = useContext(UpdaterContext)
  if (!ctx) {
    throw new Error("useUpdater must be used within an UpdaterProvider")
  }
  return ctx
}
