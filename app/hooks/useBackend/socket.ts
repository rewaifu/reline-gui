import { useCallback, useEffect } from "react"
import { toast } from "sonner"
import { playCompletionSound, sendCompletionNotification } from "~/lib/completion-feedback"
import { nodesToString } from "~/lib/utils"
import { PROCESSING_STAGES } from "./constants"
import type { BackendState } from "./state"
import type { RunKind } from "./types"
import {t} from "i18next";

export function useBackendSocket(state: BackendState) {
  const {
    stage,
    port,
    setPipelineActive,
    setPipelineCompleted,
    setRunKind,
    setProgress,
    setStatusMessage,
    setMetrics,
    setErrorInfo,
    nodesRef,
    preferencesRef,
    wsRef,
    pendingRunRef,
    activeRunRef,
    wsErrorRef,
    lastProgressRef,
    lastProgressAtRef,
    invokeInitialize,
    setLogs,
  } = state

  const enqueueRun = useCallback(
    (config: string, kind: RunKind, resolve?: () => void, reject?: (error: Error) => void) => {
      if (activeRunRef.current || pendingRunRef.current) {
        reject?.(new Error("Another pipeline is already running"))
        return
      }
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        activeRunRef.current = { config, kind, resolve, reject }
        setRunKind(kind)
        ws.send(config)
      } else {
        pendingRunRef.current = { config, kind, resolve, reject }
        setRunKind(kind)
      }
    },
    [activeRunRef, pendingRunRef, wsRef, setRunKind],
  )

  const sendConfig = useCallback(() => {
    enqueueRun(nodesToString(nodesRef.current), "main")
  }, [enqueueRun, nodesRef])

  // ── WebSocket connection to running backend ───────────────────
  useEffect(() => {
    if (stage !== "running" || port == null) return

    let retries = 0
    const retryDelay = 500
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const connect = () => {
      if (stopped) return
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)

      ws.onopen = () => {
        retries = 0
        setPipelineActive(false)
        const pending = pendingRunRef.current
        if (pending) {
          pendingRunRef.current = null
          activeRunRef.current = { config: pending.config, kind: pending.kind, resolve: pending.resolve, reject: pending.reject }
          setRunKind(pending.kind)
          ws.send(pending.config)
        }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const isPreview = activeRunRef.current?.kind === "preview"

          if (msg.status === "running" && typeof msg.progress === "number" && typeof msg.data_len === "number") {
            if (isPreview) return
            setPipelineActive(true)
            setPipelineCompleted(false)
            const processed = msg.progress
            const total = msg.data_len
            setProgress(total > 0 ? Math.round((processed / total) * 100) : 0)
            setStatusMessage(`Processing ${processed + 1} / ${total}`)

            const now = Date.now()
            let lastFileSeconds: number | null = null
            if (lastProgressRef.current >= 0 && processed > lastProgressRef.current && lastProgressAtRef.current != null) {
              lastFileSeconds = Math.max(0, (now - lastProgressAtRef.current) / 1000)
            }
            lastProgressAtRef.current = now
            lastProgressRef.current = processed
            const remaining = Math.max(0, total - processed)
            const etaSeconds = lastFileSeconds != null ? lastFileSeconds * remaining : null
            setMetrics({ processed, total, lastFileSeconds, etaSeconds })
          } else if (msg.status === "running" && msg.message) {
            if (isPreview) return
            setPipelineActive(true)
            setStatusMessage(msg.message)
          } else if (msg.status === "queued") {
            if (!isPreview) setStatusMessage(msg.message ?? "Waiting...")
          } else if (msg.status === "done") {
            const run = activeRunRef.current
            activeRunRef.current = null
            setRunKind(null)
            if (run?.kind === "preview") {
              run.resolve?.()
            } else {
              setPipelineActive(false)
              setPipelineCompleted(true)
              setProgress(100)
              setStatusMessage(t("backend.pipelineComplete"))
              setMetrics((prev) => (prev ? { ...prev, processed: prev.total, etaSeconds: 0 } : prev))
              toast.success(t("backend.pipelineComplete"))
              if (preferencesRef.current.playSoundOnComplete) {
                playCompletionSound(preferencesRef.current.completionSound)
              }
              if (preferencesRef.current.notifyOnComplete) {
                void sendCompletionNotification("Reline Configurator", t("backend.pipelineComplete"), {
                  onlyWhenMinimized: preferencesRef.current.notifyMode === "when-minimized",
                })
              }
            }
          } else if (msg.status === "error") {
            const run = activeRunRef.current
            activeRunRef.current = null
            setRunKind(null)
            if (run?.kind === "preview") {
              run.reject?.(new Error(msg.error ?? "Pipeline error"))
            } else {
              setPipelineActive(false)
              setPipelineCompleted(false)
              wsErrorRef.current = msg.error ?? "Pipeline error"
              setStatusMessage(msg.error ?? "Pipeline error")
              toast.error(msg.error ?? "Pipeline error")
            }
          } else if (msg.status === "cancelled") {
            const run = activeRunRef.current
            activeRunRef.current = null
            setRunKind(null)
            if (run?.kind === "preview") {
              run.reject?.(new Error("Pipeline cancelled"))
            } else {
              setPipelineActive(false)
              setPipelineCompleted(false)
              setStatusMessage("Pipeline cancelled")
              toast.info("Pipeline cancelled")
            }
          } else if (typeof msg.error === "string") {
            const run = activeRunRef.current
            activeRunRef.current = null
            setRunKind(null)
            if (run?.kind === "preview") {
              run.reject?.(new Error(msg.error))
            } else {
              setPipelineActive(false)
              wsErrorRef.current = msg.error
              setStatusMessage(msg.error)
              toast.error(msg.error)
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        const run = activeRunRef.current
        if (run) {
          activeRunRef.current = null
          setRunKind(null)
          if (run.kind === "preview") run.reject?.(new Error("Connection closed"))
        }
        if (!stopped) {
          retries++
          const delay = Math.min(retries * retryDelay, 5000)
          setStatusMessage(`Reconnecting... (${retries})`)
          timer = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        ws.close()
      }

      wsRef.current = ws
    }

    timer = setTimeout(connect, 300)

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [
    stage,
    port,
    setPipelineActive,
    setPipelineCompleted,
    setRunKind,
    setProgress,
    setStatusMessage,
    setMetrics,
    preferencesRef,
    wsRef,
    pendingRunRef,
    activeRunRef,
    wsErrorRef,
    lastProgressRef,
    lastProgressAtRef,
  ])

  const handleStart = useCallback(async () => {
    if (activeRunRef.current || pendingRunRef.current) return
    setProgress(0)
    setMetrics(null)
    setPipelineCompleted(false)
    lastProgressRef.current = -1
    lastProgressAtRef.current = null
    setErrorInfo(null)
    if (stage === "running") {
      sendConfig()
      return
    }
    setLogs([])
    enqueueRun(nodesToString(nodesRef.current), "main")
    try {
      await invokeInitialize()
    } catch (err) {
      pendingRunRef.current = null
      setRunKind(null)
      toast.error(String(err))
    }
  }, [
    stage,
    sendConfig,
    enqueueRun,
    invokeInitialize,
    setProgress,
    setMetrics,
    setPipelineCompleted,
    lastProgressRef,
    lastProgressAtRef,
    setErrorInfo,
    setLogs,
    nodesRef,
    pendingRunRef,
    activeRunRef,
    setRunKind,
  ])

  const runPreviewPipeline = useCallback(
    (config: unknown) => {
      return new Promise<void>((resolve, reject) => {
        if (activeRunRef.current || pendingRunRef.current || PROCESSING_STAGES.includes(stage)) {
          reject(new Error("Another pipeline is already running"))
          return
        }
        if (stage !== "running") {
          setProgress(0)
          setMetrics(null)
          setPipelineCompleted(false)
          lastProgressRef.current = -1
          lastProgressAtRef.current = null
          setErrorInfo(null)
          setLogs([])
        }
        enqueueRun(JSON.stringify(config), "preview", resolve, reject)
        if (stage !== "running") {
          invokeInitialize().catch((err) => {
            activeRunRef.current = null
            pendingRunRef.current = null
            setRunKind(null)
            reject(err instanceof Error ? err : new Error(String(err)))
            toast.error(String(err))
          })
        }
      })
    },
    [
      stage,
      enqueueRun,
      invokeInitialize,
      setProgress,
      setMetrics,
      setPipelineCompleted,
      lastProgressRef,
      lastProgressAtRef,
      setErrorInfo,
      setLogs,
      activeRunRef,
      pendingRunRef,
      setRunKind,
    ],
  )

  const handleStop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "cancel" }))
    }
  }, [wsRef])

  return { handleStart, handleStop, runPreviewPipeline }
}

export type BackendSocket = ReturnType<typeof useBackendSocket>
