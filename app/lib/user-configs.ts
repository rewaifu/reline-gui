import { CONFIG_PRESETS } from "~/lib/config-presets"
import type { ActiveConfig, UserConfig } from "~/types/config"

export const USER_CONFIGS_KEY = "user-configs"
export const ACTIVE_CONFIG_KEY = "active-config"

export function createConfigId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function loadUserConfigs(): UserConfig[] {
  try {
    const raw = localStorage.getItem(USER_CONFIGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (config): config is UserConfig => config && typeof config.id === "string" && typeof config.name === "string" && Array.isArray(config.nodes),
    )
  } catch {
    return []
  }
}

export function saveUserConfigs(configs: UserConfig[]): void {
  try {
    localStorage.setItem(USER_CONFIGS_KEY, JSON.stringify(configs))
  } catch {
    // ignore storage errors
  }
}

export function loadActiveConfig(): ActiveConfig {
  try {
    const raw = localStorage.getItem(ACTIVE_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ActiveConfig
    if (parsed && (parsed.kind === "preset" || parsed.kind === "user") && typeof parsed.id === "string") {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function saveActiveConfig(active: ActiveConfig): void {
  try {
    if (!active) {
      localStorage.removeItem(ACTIVE_CONFIG_KEY)
      return
    }
    localStorage.setItem(ACTIVE_CONFIG_KEY, JSON.stringify(active))
  } catch {
    // ignore storage errors
  }
}

export function isNameTaken(name: string, configs: UserConfig[], excludeId?: string): boolean {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return false

  const conflictsWithConfig = configs.some((config) => config.id !== excludeId && config.name.trim().toLowerCase() === normalized)
  if (conflictsWithConfig) return true

  return CONFIG_PRESETS.some((preset) => preset.name.trim().toLowerCase() === normalized)
}
