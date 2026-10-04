import { invoke } from "@tauri-apps/api/core"
import { type UnlistenFn, listen } from "@tauri-apps/api/event"
import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { usePreferences } from "~/components/providers/preferences-provider"
import { NodesContext } from "~/context/contexts"
import type { BackendStage, BackendStatusEvent, DepsStatus, DepsVersions, LogEntry, UvProgress } from "~/types/backend"
import { PORT_STORAGE_KEY } from "./constants"
import type { BackendErrorInfo, PipelineMetrics, RunKind, RunRequest } from "./types"

export function useBackendState() {
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

  const invokeInitialize = useCallback(() => {
    return invoke("initialize", { port: preferredPort === "" ? null : preferredPort })
  }, [preferredPort])

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

  return {
    stage,
    setStage,
    port,
    setPort,
    pipelineActive,
    setPipelineActive,
    pipelineCompleted,
    setPipelineCompleted,
    runKind,
    setRunKind,
    progress,
    setProgress,
    statusMessage,
    setStatusMessage,
    depsStatus,
    versions,
    logs,
    setLogs,
    uvProgress,
    setUvProgress,
    errorInfo,
    setErrorInfo,
    metrics,
    setMetrics,
    preferredPort,
    setPreferredPort,
    nodesRef,
    preferencesRef,
    wsRef,
    pendingRunRef,
    activeRunRef,
    wsErrorRef,
    lastProgressRef,
    lastProgressAtRef,
    invokeInitialize,
    handleCheckDeps,
    handleCheckDepsSilent,
  }
}

export type BackendState = ReturnType<typeof useBackendState>
