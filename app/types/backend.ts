export type BackendStage = "idle" | "cloning" | "creating_venv" | "installing" | "starting" | "running" | "error"

export interface BackendStatusEvent {
  stage: BackendStage
  message: string
  port: number | null
}

export interface DepsStatus {
  uv_installed: boolean
  repo_cloned: boolean
  venv_created: boolean
  deps_installed: boolean
  has_nvidia_gpu: boolean
}

export interface DepsVersions {
  torch_version: string | null
  torch_cuda: boolean
  resselt_version: string | null
  reline_version: string | null
}

export interface LogEntry {
  timestamp: string
  level: string
  message: string
}

export interface UvProgress {
  stage: string
  current: number
  total: number
  raw_message: string
}
