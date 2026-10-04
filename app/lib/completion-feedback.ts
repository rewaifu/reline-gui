export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
}

export function playCompletionSound(src: string): void {
  if (!src) return
  try {
    const audio = new Audio(src)
    void audio.play().catch(() => {})
  } catch {
    // ignore playback errors
  }
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

export async function sendCompletionNotification(title: string, body: string): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification")
    let granted = await isPermissionGranted()
    if (!granted) {
      const permission = await requestPermission()
      granted = permission === "granted"
    }
    if (granted) {
      sendNotification({ title, body })
    }
  } catch {
    // ignore notification errors
  }
}
