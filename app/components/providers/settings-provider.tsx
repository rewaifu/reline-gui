import { type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react"
import { loadSettingsDialog } from "~/components/providers/lazy-dialogs"
import { SettingsContext, type SettingsContextValue, type SettingsSection } from "~/context/contexts"

// Keep the spinner up at least this long so the feedback is actually visible
// even when the chunk is served from cache and resolves within a microtask.
const MIN_SPINNER_MS = 300

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<SettingsSection>("deps")
  const [pending, setPending] = useState(false)
  const readyRef = useRef(false)
  const shownAtRef = useRef(0)

  const preloadSettings = useCallback(() => {
    void loadSettingsDialog()
  }, [])

  const openSettings = useCallback((next: SettingsSection) => {
    setSection(next)
    setOpen(true)
    if (!readyRef.current) {
      shownAtRef.current = performance.now()
      setPending(true)
    }
  }, [])

  const markSettingsReady = useCallback(() => {
    readyRef.current = true
    const remaining = MIN_SPINNER_MS - (performance.now() - shownAtRef.current)
    if (remaining > 0) {
      window.setTimeout(() => setPending(false), remaining)
    } else {
      setPending(false)
    }
  }, [])

  const value: SettingsContextValue = useMemo(
    () => ({ open, section, setOpen, openSettings, pending, preloadSettings, markSettingsReady }),
    [open, section, openSettings, pending, preloadSettings, markSettingsReady],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return ctx
}
