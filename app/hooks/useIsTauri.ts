import { useState } from "react"

export function useIsTauri() {
  const [isTauri] = useState(() => typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window))

  return isTauri
}
