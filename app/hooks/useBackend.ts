import { invoke } from "@tauri-apps/api/core"
import { type UnlistenFn, listen } from "@tauri-apps/api/event"
import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { usePreferences } from "~/components/providers/preferences-provider"
import { NodesContext } from "~/context/contexts"
import { playCompletionSound, sendCompletionNotification } from "~/lib/completion-feedback"
import { nodesToString } from "~/lib/utils"
import type { BackendStage, BackendStatusEvent, DepsStatus, DepsVersions, LogEntry, UvProgress } from "~/types/backend"

export interface PipelineMetrics {
  processed: number
  total: number
  lastFileSeconds: number | null
  etaSeconds: number | null
}

export interface BackendErrorInfo {
  name: string
  detail: string
}

type RunKind = "main" | "preview"

interface RunRequest {
  config: string
  kind: RunKind
  resolve?: () => void
  reject?: (error: Error) => void
}

const PROCESSING_STAGES: BackendStage[] = ["cloning", "creating_venv", "installing", "starting"]
const PORT_STORAGE_KEY = "server-port"

export interface UseBackendReturn {
  stage: BackendStage
  isProcessing: boolean
  installingDeps: boolean
  busy: boolean
  runPreviewPipeline: (config: unknown) => Promise<void>
  pipelineActive: boolean
  pipelineCompleted: boolean
  serverRunning: boolean
  serverPort: number | null
  progress: number
  statusMessage: string
  depsStatus: DepsStatus | null
  depsReady: boolean
  versions: DepsVersions | null
  logs: LogEntry[]
  uvProgress: UvProgress | null
  errorInfo: BackendErrorInfo | null
  metrics: PipelineMetrics | null
  preferredPort: number | ""
  setPreferredPort: (port: number | "") => void
  handleStart: () => Promise<void>
  handleStop: () => void
  handleStartServer: () => Promise<void>
  handleStopServer: () => void
  handleCheckPortFree: (port: number) => Promise<boolean>
  handleOpenFolder: (path: string) => Promise<void>
  handleCheckDeps: () => Promise<void>
  handleInstallDeps: (full: boolean) => Promise<void>
  handleGetLogs: () => Promise<void>
  handleClearLogs: () => Promise<void>
}

const EMPTY_METRICS: PipelineMetrics = {
  processed: 0,
  total: 0,
  lastFileSeconds: null,
  etaSeconds: null,
}

export function useBackend(): UseBackendReturn {
  const [stage, setStage] = useState<BackendStage>("idle")
  const [port, setPort] = useState<number | null>(null)
  const [pipelineActive, setPipelineActive] = useState(false)
  const [pipelineCompleted, setPipelineCompleted] = useState(false)
  const [runKind, setRunKind] = useState<RunKind | null>(null)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState("")
  const [depsStatus, setDepsStatus] = useState<DepsStatus | null>(null)
  const [versions, setVersions] = useState<DepsVersions | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [uvProgress, setUvProgress] = useState<UvProgress | null>(null)
  const [errorInfo, setErrorInfo] = useState<BackendErrorInfo | null>(null)
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null)
  const [preferredPort, setPreferredPortState] = useState<number | "">(() => {
    try {
      const raw = localStorage.getItem(PORT_STORAGE_KEY)
      const n = raw == null ? Number.NaN : Number(raw)
      return Number.isFinite(n) && n > 0 ? n : ""
    } catch {
      return ""
    }
  })
  const nodes = useContext(NodesContext)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const preferences = usePreferences()
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences
  const wsRef = useRef<WebSocket | null>(null)
  const pendingRunRef = useRef<RunRequest | null>(null)
  const activeRunRef = useRef<RunRequest | null>(null)
  const wsErrorRef = useRef<string | null>(null)
  const lastProgressRef = useRef(-1)
  const lastProgressAtRef = useRef<number | null>(null)

  const setPreferredPort = useCallback((p: number | "") => {
    setPreferredPortState(p)
    try {
      if (p === "") localStorage.removeItem(PORT_STORAGE_KEY)
      else localStorage.setItem(PORT_STORAGE_KEY, String(p))
    } catch {
      // ignore storage errors
    }
  }, [])

  const enqueueRun = useCallback((config: string, kind: RunKind, resolve?: () => void, reject?: (error: Error) => void) => {
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
  }, [])

  const sendConfig = useCallback(() => {
    enqueueRun(nodesToString(nodesRef.current), "main")
  }, [enqueueRun])

  // ── Listen for backend-status events ──────────────────────────
  useEffect(() => {
    let cancelled = false
    let unlisten: UnlistenFn | null = null

    listen<BackendStatusEvent>("backend-status", (event) => {
      if (cancelled) return
      const payload = event.payload
      if (payload?.stage) {
        setStage(payload.stage)
        setStatusMessage(payload.message)
        if (payload.port != null) {
          setPort(payload.port)
        }
        if (payload.stage === "error") {
          const detail = wsErrorRef.current ? `${payload.message}\n${wsErrorRef.current}` : payload.message
          setErrorInfo({ name: payload.message, detail })
          const failedRun = activeRunRef.current ?? pendingRunRef.current
          activeRunRef.current = null
          pendingRunRef.current = null
          setRunKind(null)
          if (failedRun?.kind === "preview") failedRun.reject?.(new Error(payload.message))
        } else if (payload.stage === "running" || payload.stage === "idle") {
          setErrorInfo(null)
          wsErrorRef.current = null
        }
      }
    })
      .then((fn) => {
        if (cancelled) {
          fn()
        } else {
          unlisten = fn
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
      if (unlisten) unlisten()
    }
  }, [])

  // ── Listen for backend-log events ─────────────────────────────
  useEffect(() => {
    let cancelled = false
    let unlisten: UnlistenFn | null = null

    listen<LogEntry>("backend-log", (event) => {
      if (cancelled) return
      setLogs((prev) => [...prev, event.payload])
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
  }, [])

  // ── Listen for uv-progress-update events ─────────────────────
  useEffect(() => {
    let cancelled = false
    let unlisten: UnlistenFn | null = null

    listen<UvProgress>("uv-progress-update", (event) => {
      if (cancelled) return
      setUvProgress(event.payload)
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
  }, [])

  // ── Reset uv progress when not installing deps ───────────────
  useEffect(() => {
    if (stage !== "cloning" && stage !== "creating_venv" && stage !== "installing") {
      setUvProgress(null)
    }
  }, [stage])

  const handleCheckDepsSilent = useCallback(async () => {
    try {
      const deps = await invoke<DepsStatus>("check_deps")
      setDepsStatus(deps)
      try {
        const vers = await invoke<DepsVersions>("check_versions")
        setVersions(vers)
      } catch {
        setVersions(null)
      }
    } catch {
      setDepsStatus(null)
    }
  }, [])

  // ── On mount: check for existing port, check deps ─────────────
  useEffect(() => {
    invoke<number | null>("get_backend_port")
      .then((p) => {
        if (p != null) {
          setStage("running")
          setPort(p)
        }
      })
      .catch(() => {})

    handleCheckDepsSilent()
  }, [handleCheckDepsSilent])

  const handleCheckDeps = async () => {
    await handleCheckDepsSilent()
  }

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
              setStatusMessage("Pipeline completed")
              setMetrics((prev) => (prev ? { ...prev, processed: prev.total, etaSeconds: 0 } : prev))
              toast.success("Pipeline completed")
              if (preferencesRef.current.playSoundOnComplete) {
                playCompletionSound(preferencesRef.current.completionSound)
              }
              if (preferencesRef.current.notifyOnComplete) {
                void sendCompletionNotification("Reline Configurator", "Pipeline completed")
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
  }, [stage, port])

  // ── Actions ───────────────────────────────────────────────────

  const invokeInitialize = useCallback(() => {
    return invoke("initialize", { port: preferredPort === "" ? null : preferredPort })
  }, [preferredPort])

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
  }, [stage, sendConfig, enqueueRun, invokeInitialize])

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
    [stage, enqueueRun, invokeInitialize],
  )

  const handleStop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "cancel" }))
    }
  }, [])

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
  }, [invokeInitialize])

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
  }, [])

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
    [handleCheckDepsSilent],
  )

  const handleGetLogs = useCallback(async () => {
    try {
      const entries = await invoke<LogEntry[]>("get_logs")
      setLogs(entries)
    } catch {
      // ignore
    }
  }, [])

  const handleClearLogs = useCallback(async () => {
    try {
      await invoke("clear_logs")
      setLogs([])
    } catch {
      setLogs([])
    }
  }, [])

  const isProcessing = PROCESSING_STAGES.includes(stage)
  const installingDeps = stage === "cloning" || stage === "creating_venv" || stage === "installing"
  const busy = isProcessing || pipelineActive || runKind !== null

  return {
    stage,
    isProcessing,
    installingDeps,
    busy,
    runPreviewPipeline,
    pipelineActive,
    pipelineCompleted,
    serverRunning: stage === "running",
    serverPort: port,
    progress,
    statusMessage,
    depsStatus,
    depsReady: depsStatus?.deps_installed === true && depsStatus.repo_cloned && depsStatus.venv_created && depsStatus.uv_installed,
    versions,
    logs,
    uvProgress,
    errorInfo,
    metrics,
    preferredPort,
    setPreferredPort,
    handleStart,
    handleStop,
    handleStartServer,
    handleStopServer,
    handleCheckPortFree,
    handleOpenFolder,
    handleCheckDeps,
    handleInstallDeps,
    handleGetLogs,
    handleClearLogs,
  }
}
