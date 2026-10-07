import { decodeAudio, playBuffer } from "~/lib/audio"
import { isCustomSoundRef, resolveSoundBlob } from "~/lib/sound-store"

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
}

const presetBufferCache = new Map<string, AudioBuffer>()

async function resolveCompletionBuffer(src: string): Promise<AudioBuffer> {
  const cached = presetBufferCache.get(src)
  if (cached) return cached

  let arrayBuffer: ArrayBuffer
  if (isCustomSoundRef(src)) {
    const blob = await resolveSoundBlob(src)
    if (!blob) throw new Error("Completion sound not found")
    arrayBuffer = await blob.arrayBuffer()
  } else {
    const response = await fetch(src)
    arrayBuffer = await response.arrayBuffer()
  }

  const buffer = await decodeAudio(arrayBuffer)
  if (!isCustomSoundRef(src)) presetBufferCache.set(src, buffer)
  return buffer
}

export function playCompletionSound(src: string, maxDuration: number, gain: number): Promise<void> {
  if (!src) return Promise.resolve()
  return (async () => {
    try {
      const buffer = await resolveCompletionBuffer(src)
      await playBuffer(buffer, { gain, maxDuration })
    } catch {
      // ignore playback errors
    }
  })()
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauriRuntime()) return false
  try {
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification")
    let granted = await isPermissionGranted()
    if (!granted) {
      const permission = await requestPermission()
      granted = permission === "granted"
    }
    return granted
  } catch {
    return false
  }
}

export async function sendCompletionNotification(title: string, body: string, options?: { onlyWhenMinimized?: boolean }): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    const win = getCurrentWindow()
    if (options?.onlyWhenMinimized && !(await win.isMinimized())) return

    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification")
    let granted = await isPermissionGranted()
    if (!granted) {
      const permission = await requestPermission()
      granted = permission === "granted"
    }
    if (!granted) return

    const notification = new Notification(title, { body })
    notification.onclick = () => {
      void focusAppWindow()
      notification.close()
    }
  } catch {
    // ignore notification errors
  }
}

export async function focusAppWindow(): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    const win = getCurrentWindow()
    if (await win.isMinimized()) await win.unminimize()
    await win.show()
    await win.setFocus()
  } catch {
    // ignore window errors
  }
}
