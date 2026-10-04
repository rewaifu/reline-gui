import { type ReactNode, useCallback, useContext, useMemo, useState } from "react"
import { SettingsContext, type SettingsContextValue, type SettingsSection } from "~/context/contexts"

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<SettingsSection>("deps")

  const openSettings = useCallback((next: SettingsSection) => {
    setSection(next)
    setOpen(true)
  }, [])

  const value: SettingsContextValue = useMemo(
    () => ({ open, section, setOpen, openSettings }),
    [open, section, openSettings],
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
