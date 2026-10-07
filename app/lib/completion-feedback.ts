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
