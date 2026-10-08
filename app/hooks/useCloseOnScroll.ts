import * as React from "react"

type DismissOnScrollOptions = {
  open: boolean
  onDismiss: (event: Event) => void
  ignoreRef?: React.RefObject<HTMLElement | null>
}

export function useCloseOnScroll({
  open,
  onDismiss,
  ignoreRef,
}: DismissOnScrollOptions) {
  React.useEffect(() => {
    if (!open) {
      return
    }

    const handleScroll = (event: Event) => {
      const target = event.target

      if (
        target instanceof Node &&
        ignoreRef?.current &&
        ignoreRef.current.contains(target)
      ) {
        return
      }

      onDismiss(event)
    }

    window.addEventListener("scroll", handleScroll, true)

    return () => {
      window.removeEventListener("scroll", handleScroll, true)
    }
  }, [open, onDismiss, ignoreRef])
}
