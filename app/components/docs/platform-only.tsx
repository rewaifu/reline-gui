import type { ReactNode } from "react"

import { useIsTauri } from "~/hooks/useIsTauri"

type PlatformOnlyProps = {
  /** Where the wrapped content should be rendered. */
  platform: "web" | "tauri"
  children: ReactNode
}

export function PlatformOnly({ platform, children }: PlatformOnlyProps) {
  const isTauri = useIsTauri()
  const active = platform === "tauri" ? isTauri : !isTauri

  return active ? <>{children}</> : null
}
