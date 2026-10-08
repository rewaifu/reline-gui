export type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error"

export interface UpdateInfo {
  version: string
  currentVersion: string
  body?: string
  date?: string
}

export interface UpdaterContextValue {
  status: UpdateStatus
  update: UpdateInfo | null
  progress: number | null
  error: string | null
  checkForUpdates: () => Promise<void>
  downloadAndInstall: () => Promise<void>
  restart: () => Promise<void>
  dismiss: () => void
}
