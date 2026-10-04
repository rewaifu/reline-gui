import { type ReactNode, useContext } from "react"
import { BackendContext, type BackendContextValue } from "~/context/contexts"
import { useBackend } from "~/hooks/useBackend"

interface BackendProviderProps {
  children: ReactNode
}

export function BackendProvider({ children }: BackendProviderProps) {
  const backend = useBackend()
  const value: BackendContextValue = backend

  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>
}

export function useBackendContext(): BackendContextValue {
  const ctx = useContext(BackendContext)
  if (!ctx) {
    throw new Error("useBackendContext must be used within a BackendProvider")
  }
  return ctx
}
