import { invoke } from "@tauri-apps/api/core"
import { useEffect, useState } from "react"
import { useIsTauri } from "~/hooks/useIsTauri"

export function useCustomTitlebar() {
  const isTauri = useIsTauri()
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (!isTauri) return
    let active = true
    invoke<boolean>("get_window_mode")
      .then((value) => {
        if (active) setEnabled(value)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [isTauri])

  return enabled
}
