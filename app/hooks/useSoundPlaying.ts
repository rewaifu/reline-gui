import { useSyncExternalStore } from "react"
import { isPlaying, subscribePlayback } from "~/lib/audio"

export function useSoundPlaying(): boolean {
  return useSyncExternalStore(subscribePlayback, isPlaying, () => false)
}
