import type { BackendStage, CleanupInfo, DepsStatus, DepsVersions, LogEntry, UvProgress } from "~/types/backend"

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

export type RunPhase = "idle" | "running" | "stopping" | "queued"

// Rejection reason used when a run is cancelled. Consumers can detect it to
// avoid showing an error for a user-requested cancellation.
export class PipelineCancelledError extends Error {
  constructor() {
    super("Pipeline cancelled")
    this.name = "PipelineCancelledError"
  }
}

export function isPipelineCancelled(error: unknown): error is PipelineCancelledError {
  return error instanceof PipelineCancelledError
}

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
  runState: RunPhase
  // Whether a new run may be queued right now (idle, or the active run is being stopped).
  canQueue: boolean
  runPreviewPipeline: (config: unknown) => Promise<void>
  cancelPreviewPipeline: () => void
  pipelineActive: boolean
  pipelineCompleted: boolean
  serverRunning: boolean
  serverPort: number | null
  progress: number
  statusMessage: string
  depsStatus: DepsStatus | null
  depsReady: boolean
  versions: DepsVersions | null
  cleanupSize: CleanupInfo | null
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
  handleHardStop: () => void
  handleCheckPortFree: (port: number) => Promise<boolean>
  handleOpenFolder: (path: string) => Promise<void>
  handleCheckDeps: () => Promise<void>
  handleInstallDeps: (full: boolean) => Promise<void>
  handleCleanupDeps: () => Promise<boolean>
  handleGetLogs: () => Promise<void>
  handleClearLogs: () => Promise<void>
}
