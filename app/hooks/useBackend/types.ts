import type { BackendStage, DepsStatus, DepsVersions, LogEntry, UvProgress } from "~/types/backend"

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

export type RunKind = "main" | "preview"

export interface RunRequest {
  config: string
  kind: RunKind
  resolve?: () => void
  reject?: (error: Error) => void
}

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
