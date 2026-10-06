import { useContext } from "react"
import { ActiveNodeContext } from "~/context/contexts"

export function useActiveNode() {
  const ctx = useContext(ActiveNodeContext)
  if (!ctx) {
    throw new Error("useActiveNode must be used within an ActiveNodeContext provider")
  }
  return ctx
}
