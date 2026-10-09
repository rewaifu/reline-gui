import { useEffect } from "react"

// Rendered as a sibling of a `lazy` component inside the same <Suspense>
// boundary. Its effect only runs once the boundary has resolved (i.e. the lazy
// chunk loaded *and* the component rendered), which is a reliable signal that
// the dialog is actually ready to show.
export function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady()
  }, [onReady])
  return null
}
