import { lazy } from "react"

// Shared lazy dialog definitions. `load*` is the same promise used by `lazy`, so
// prefetching (on hover/focus) never triggers a second fetch, and callers can
// track a "pending" flag with `is*Loaded` to show a spinner on the trigger.

type SettingsDialogModule = typeof import("~/components/settings/settings-dialog")
type ModelDownloaderModule = typeof import("~/components/layout/model-downloader-dialog.tsx")

let settingsPromise: Promise<SettingsDialogModule> | null = null
let settingsLoaded = false

export const loadSettingsDialog = (): Promise<SettingsDialogModule> => {
  if (!settingsPromise) {
    settingsPromise = import("~/components/settings/settings-dialog").then((mod) => {
      settingsLoaded = true
      return mod
    })
  }
  return settingsPromise
}

export const isSettingsDialogLoaded = () => settingsLoaded

export const SettingsDialog = lazy(() => loadSettingsDialog().then((mod) => ({ default: mod.SettingsDialog })))

let modelDownloaderPromise: Promise<ModelDownloaderModule> | null = null
let modelDownloaderLoaded = false

export const loadModelDownloaderDialog = (): Promise<ModelDownloaderModule> => {
  if (!modelDownloaderPromise) {
    modelDownloaderPromise = import("~/components/layout/model-downloader-dialog.tsx").then((mod) => {
      modelDownloaderLoaded = true
      return mod
    })
  }
  return modelDownloaderPromise
}

export const isModelDownloaderDialogLoaded = () => modelDownloaderLoaded

export const ModelDownloaderDialog = lazy(() => loadModelDownloaderDialog().then((mod) => ({ default: mod.ModelDownloaderDialog })))
