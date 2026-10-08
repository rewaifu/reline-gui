import { useCallback, useEffect } from "react"
import { toast } from "sonner"
import { playCompletionSound, sendCompletionNotification } from "~/lib/completion-feedback"
import { nodesToString } from "~/lib/utils"
import { PROCESSING_STAGES } from "./constants"
import type { BackendState } from "./state"
import { PipelineCancelledError, type RunKind } from "./types"
import { t } from "i18next"

export function useBackendSocket(state: BackendState) {
  const {
    stage,
    port,
    setPipelineActive,
    setPipelineCompleted,
    setRunState,
    setProgress,
    setStatusMessage,
    setMetrics,
    setErrorInfo,
    nodesRef,
    preferencesRef,
    wsRef,
    pendingRunRef,
    activeRunRef,
    stoppingRef,
    socketReadyRef,
    wsErrorRef,
    lastProgressRef,
    lastProgressAtRef,
    invokeInitialize,
    setLogs,
  } = state

  // ── Run phase (drives UI gating) ──────────────────────────────
  const syncRunState = useCallback(() => {
    const active = activeRunRef.current
    const pending = pendingRunRef.current
    if (pending) setRunState("queued")
    else if (active && stoppingRef.current) setRunState("stopping")
    else if (active) setRunState("running")
    else setRunState("idle")
  }, [activeRunRef, pendingRunRef, stoppingRef, setRunState])

  // Queues a run. Sends it immediately when the socket is ready and nothing is
  // active; otherwise it waits in the single pending slot (depth 1).
  const enqueueRun = useCallback(
    (config: string, kind: RunKind, resolve?: () => void, reject?: (error: Error) => void): boolean => {
      if (pendingRunRef.current) {
        reject?.(new Error("Another pipeline is already running"))
        return false
      }
      if (activeRunRef.current && !stoppingRef.current) {
        reject?.(new Error("Another pipeline is already running"))
        return false
      }
      const request = { config, kind, resolve, reject }
      const ws = wsRef.current
      if (!activeRunRef.current && socketReadyRef.current && ws?.readyState === WebSocket.OPEN) {
        activeRunRef.current = request
        ws.send(config)
      } else {
        pendingRunRef.current = request
      }
      syncRunState()
      return true
    },
    [activeRunRef, pendingRunRef, wsRef, socketReadyRef, stoppingRef, syncRunState],
  )

  // Finishes the active run and promotes/holds the queued one.
  const settleActive = useCallback(
    (outcome: "done" | "error" | "cancelled" | "closed", message?: string) => {
      const run = activeRunRef.current
      activeRunRef.current = null
      stoppingRef.current = false
      // The server closes the connection after a terminal status; do not send the
      // next run on this soon-to-be-dead socket.
      socketReadyRef.current = false
      const hasPending = pendingRunRef.current != null

      if (run?.kind === "preview") {
        if (outcome === "done") run.resolve?.()
        else if (outcome === "cancelled") run.reject?.(new PipelineCancelledError())
        else run.reject?.(new Error(message ?? "Pipeline error"))
      } else if (run?.kind === "main") {
        const pendingIsMain = pendingRunRef.current?.kind === "main"
        if (outcome === "done") {
          if (hasPending) {
            setProgress(0)
            setMetrics(null)
            setPipelineActive(pendingIsMain)
          } else {
            setPipelineActive(false)
            setPipelineCompleted(true)
            setProgress(100)
            setStatusMessage(t("backend.pipelineComplete"))
            setMetrics((prev) => (prev ? { ...prev, processed: prev.total, etaSeconds: 0 } : prev))
            toast.success(t("backend.pipelineComplete"))
            const prefs = preferencesRef.current
            if (prefs?.playSoundOnComplete) {
              const cap = prefs.maxSoundDurationEnabled ? prefs.maxSoundDuration : 0
              playCompletionSound(prefs.completionSound, cap, prefs.soundVolume)
            }
            if (prefs?.notifyOnComplete) {
              void sendCompletionNotification("Reline Configurator", t("backend.pipelineComplete"), {
                onlyWhenMinimized: prefs.notifyMode === "when-minimized",
              })
            }
          }
        } else if (outcome === "cancelled") {
          setPipelineCompleted(false)
          setStatusMessage("Pipeline cancelled")
          setPipelineActive(pendingIsMain)
        } else {
          setPipelineCompleted(false)
          if (outcome === "error") {
            wsErrorRef.current = message ?? "Pipeline error"
            setStatusMessage(message ?? "Pipeline error")
            toast.error(message ?? "Pipeline error")
          }
          setPipelineActive(pendingIsMain)
        }
      }
      syncRunState()
    },
    [
      activeRunRef,
      pendingRunRef,
      stoppingRef,
      socketReadyRef,
      setPipelineActive,
      setPipelineCompleted,
      setProgress,
      setStatusMessage,
      setMetrics,
      preferencesRef,
      wsErrorRef,
      syncRunState,
    ],
  )

  // ── WebSocket connection to running backend ───────────────────
  useEffect(() => {
    if (stage !== "running" || port == null) return

    let retries = 0
    const retryDelay = 500
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const pump = (ws: WebSocket) => {
      if (activeRunRef.current) return
      const pending = pendingRunRef.current
      if (!pending || ws.readyState !== WebSocket.OPEN) return
      pendingRunRef.current = null
      activeRunRef.current = pending
      if (pending.kind === "main") setPipelineActive(true)
      syncRunState()
      ws.send(pending.config)
    }

    const connect = () => {
      if (stopped) return
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)

      ws.onopen = () => {
        retries = 0
        socketReadyRef.current = true
        pump(ws)
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
            settleActive("done")
          } else if (msg.status === "error") {
            settleActive("error", msg.error ?? "Pipeline error")
          } else if (msg.status === "cancelled") {
            settleActive("cancelled")
          } else if (typeof msg.error === "string") {
            settleActive("error", msg.error)
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        socketReadyRef.current = false
        if (activeRunRef.current) {
          settleActive("closed", "Connection closed")
        } else {
          syncRunState()
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
      socketReadyRef.current = false
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
    setProgress,
    setStatusMessage,
    setMetrics,
    wsRef,
    pendingRunRef,
    activeRunRef,
    socketReadyRef,
    lastProgressRef,
    lastProgressAtRef,
    syncRunState,
    settleActive,
  ])

  const handleStart = useCallback(async () => {
    const queued = enqueueRun(nodesToString(nodesRef.current), "main")
    if (!queued) return

    setProgress(0)
    setMetrics(null)
    setPipelineCompleted(false)
    lastProgressRef.current = -1
    lastProgressAtRef.current = null
    setErrorInfo(null)
    if (stage !== "running") setLogs([])
    setPipelineActive(true)

    if (stage !== "running" && !PROCESSING_STAGES.includes(stage)) {
      try {
        await invokeInitialize()
      } catch (err) {
        if (activeRunRef.current?.kind === "main") activeRunRef.current = null
        if (pendingRunRef.current?.kind === "main") pendingRunRef.current = null
        setPipelineActive(false)
        syncRunState()
        toast.error(String(err))
      }
    }
  }, [
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
    nodesRef,
    pendingRunRef,
    activeRunRef,
    setPipelineActive,
    syncRunState,
  ])

  const runPreviewPipeline = useCallback(
    (config: unknown) => {
      return new Promise<void>((resolve, reject) => {
        const queued = enqueueRun(JSON.stringify(config), "preview", resolve, reject)
        if (!queued) return
        if (stage !== "running") {
          setProgress(0)
          setMetrics(null)
          setPipelineCompleted(false)
          lastProgressRef.current = -1
          lastProgressAtRef.current = null
          setErrorInfo(null)
          setLogs([])
        }
        if (stage !== "running" && !PROCESSING_STAGES.includes(stage)) {
          invokeInitialize().catch((err) => {
            if (activeRunRef.current?.kind === "preview") activeRunRef.current = null
            if (pendingRunRef.current?.kind === "preview") pendingRunRef.current = null
            syncRunState()
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
      syncRunState,
    ],
  )

  // Cancels the main run: drops a queued run and/or asks the server to stop the
  // active one. The UI is reset optimistically; the queued run is sent only after
  // the server confirms "cancelled".
  const handleStop = useCallback(() => {
    const pending = pendingRunRef.current
    if (pending?.kind === "main") {
      pendingRunRef.current = null
    }
    const active = activeRunRef.current
    if (active?.kind === "main" && !stoppingRef.current) {
      stoppingRef.current = true
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "cancel" }))
      }
    }
    setPipelineActive(false)
    setPipelineCompleted(false)
    setProgress(0)
    setMetrics(null)
    syncRunState()
    toast.info(t("backend.pipelineCancelled"))
  }, [pendingRunRef, activeRunRef, stoppingRef, wsRef, setPipelineActive, setPipelineCompleted, setProgress, setMetrics, syncRunState])

  // Cancels the preview run the same way handleStop does for the main run.
  const cancelPreviewPipeline = useCallback(() => {
    const pending = pendingRunRef.current
    if (pending?.kind === "preview") {
      pendingRunRef.current = null
      pending.reject?.(new PipelineCancelledError())
    }
    const active = activeRunRef.current
    if (active?.kind === "preview" && !stoppingRef.current) {
      stoppingRef.current = true
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "cancel" }))
      }
    }
    syncRunState()
  }, [pendingRunRef, activeRunRef, stoppingRef, wsRef, syncRunState])

  return { handleStart, handleStop, runPreviewPipeline, cancelPreviewPipeline }
}

export type BackendSocket = ReturnType<typeof useBackendSocket>
