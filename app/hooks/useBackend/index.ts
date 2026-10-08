import { useBackendActions } from "./actions"
import { PROCESSING_STAGES } from "./constants"
import { useBackendSocket } from "./socket"
import { useBackendState } from "./state"
import type { UseBackendReturn } from "./types"

export type { BackendErrorInfo, PipelineMetrics, RunPhase, UseBackendReturn } from "./types"
export { isPipelineCancelled, PipelineCancelledError } from "./types"

export function useBackend(): UseBackendReturn {
  const state = useBackendState()
  const { handleStart, handleStop, runPreviewPipeline, cancelPreviewPipeline } = useBackendSocket(state)
  const actions = useBackendActions(state)

  const isProcessing = PROCESSING_STAGES.includes(state.stage)
  const installingDeps = state.stage === "cloning" || state.stage === "creating_venv" || state.stage === "installing"
  const busy = isProcessing || state.runState !== "idle"
  const canQueue = state.runState === "idle" || state.runState === "stopping"

  return {
    stage: state.stage,
    isProcessing,
    installingDeps,
    busy,
    runState: state.runState,
    canQueue,
    runPreviewPipeline,
    cancelPreviewPipeline,
    pipelineActive: state.pipelineActive,
    pipelineCompleted: state.pipelineCompleted,
    serverRunning: state.stage === "running",
    serverPort: state.port,
    progress: state.progress,
    statusMessage: state.statusMessage,
    startupReady: state.startupReady,
    depsStatus: state.depsStatus,
    depsReady:
      state.depsStatus?.deps_installed === true && state.depsStatus.repo_cloned && state.depsStatus.venv_created && state.depsStatus.uv_installed,
    versions: state.versions,
    cleanupSize: state.cleanupSize,
    logs: state.logs,
    uvProgress: state.uvProgress,
    errorInfo: state.errorInfo,
    metrics: state.metrics,
    preferredPort: state.preferredPort,
    setPreferredPort: state.setPreferredPort,
    handleCheckDeps: state.handleCheckDeps,
    handleStart,
    handleStop,
    ...actions,
  }
}
