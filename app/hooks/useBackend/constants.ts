import type { BackendStage } from "~/types/backend"

export const PROCESSING_STAGES: BackendStage[] = ["cloning", "creating_venv", "installing", "starting"]
export const PORT_STORAGE_KEY = "server-port"
