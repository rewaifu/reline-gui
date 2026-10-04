import { invoke } from "@tauri-apps/api/core"
import { useCallback } from "react"
import { toast } from "sonner"
import type { LogEntry } from "~/types/backend"
import type { BackendState } from "./state"

export function useBackendActions(state: BackendState) {
  const {
    setStage,
    setPort,
    setPipelineActive,
    setPipelineCompleted,
    setRunKind,
    setErrorInfo,
    setMetrics,
    setLogs,
    setUvProgress,
    pendingRunRef,
    activeRunRef,
    invokeInitialize,
    handleCheckDepsSilent,
  } = state

  const handleStartServer = useCallback(async () => {
    setLogs([])
    setPipelineCompleted(false)
    pendingRunRef.current = null
    setRunKind(null)
    try {
      await invokeInitialize()
    } catch (err) {
      toast.error(String(err))
    }
  }, [setLogs, setPipelineCompleted, pendingRunRef, setRunKind, invokeInitialize])

  const handleStopServer = useCallback(() => {
    invoke("stop_backend").catch(() => {})
    setStage("idle")
    setPort(null)
    setPipelineActive(false)
    setMetrics(null)
    setErrorInfo(null)
    pendingRunRef.current = null
    const run = activeRunRef.current
    activeRunRef.current = null
    setRunKind(null)
    run?.reject?.(new Error("Backend stopped"))
  }, [setStage, setPort, setPipelineActive, setMetrics, setErrorInfo, pendingRunRef, activeRunRef, setRunKind])

  const handleCheckPortFree = useCallback(async (port: number) => {
    return invoke<boolean>("check_port_free", { port })
  }, [])

  const handleOpenFolder = useCallback(async (path: string) => {
    try {
      await invoke("open_folder", { path })
    } catch (err) {
      toast.error(String(err))
    }
  }, [])

  const handleInstallDeps = useCallback(
    async (full: boolean) => {
      try {
        setLogs([])
        setUvProgress(null)
        await invoke("install_deps", { full })
        await handleCheckDepsSilent()
      } catch (err) {
        toast.error(String(err))
      }
    },
    [setLogs, setUvProgress, handleCheckDepsSilent],
  )

  const handleGetLogs = useCallback(async () => {
    try {
      const entries = await invoke<LogEntry[]>("get_logs")
      setLogs(entries)
    } catch {
      // ignore
    }
  }, [setLogs])

  const handleClearLogs = useCallback(async () => {
    try {
      await invoke("clear_logs")
      setLogs([])
    } catch {
      setLogs([])
    }
  }, [setLogs])

  return {
    handleStartServer,
    handleStopServer,
    handleCheckPortFree,
    handleOpenFolder,
    handleInstallDeps,
    handleGetLogs,
    handleClearLogs,
  }
}

export type BackendActions = ReturnType<typeof useBackendActions>
