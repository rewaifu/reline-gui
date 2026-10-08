import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react"

export interface ViewState {
  scale: number
  x: number
  y: number
}

export interface CanvasSize {
  width: number
  height: number
}

interface PanState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

interface UseCanvasViewportOptions {
  contentSize: CanvasSize | null
  paneCount?: number
  minZoom?: number
  maxZoom?: number
  // How far past the content edges panning is allowed, as a fraction of the pane.
  // 0 = strict (content always covers the pane), 0.5 = pull the content until half the pane is empty.
  overscroll?: number
  // If true, refit on container resize. Otherwise a resize keeps the current zoom/pan.
  refitOnResize?: boolean
}

export function useCanvasViewport({
  contentSize,
  paneCount = 1,
  minZoom = 0.1,
  maxZoom = 16,
  overscroll = 0,
  refitOnResize = false,
}: UseCanvasViewportOptions) {
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 })

  const containerRef = useRef<HTMLDivElement>(null)
  const panStateRef = useRef<PanState | null>(null)

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    setSize({ width: container.clientWidth / paneCount, height: container.clientHeight })
  }, [paneCount])

  const fitView = useCallback(() => {
    const container = containerRef.current
    if (!container || !contentSize) return
    const paneWidth = container.clientWidth / paneCount
    const paneHeight = container.clientHeight
    if (!paneWidth || !paneHeight) return
    const scale = Math.min(paneWidth / contentSize.width, paneHeight / contentSize.height)
    setView({ scale, x: (paneWidth - contentSize.width * scale) / 2, y: (paneHeight - contentSize.height * scale) / 2 })
  }, [contentSize, paneCount])

  const clampView = useCallback(
    (next: ViewState): ViewState => {
      const container = containerRef.current
      if (!container || !contentSize) return next
      const paneWidth = container.clientWidth / paneCount
      const paneHeight = container.clientHeight
      const scaledWidth = contentSize.width * next.scale
      const scaledHeight = contentSize.height * next.scale
      const marginX = paneWidth * overscroll
      const marginY = paneHeight * overscroll
      const x = scaledWidth <= paneWidth ? (paneWidth - scaledWidth) / 2 : Math.min(marginX, Math.max(paneWidth - scaledWidth - marginX, next.x))
      const y =
        scaledHeight <= paneHeight ? (paneHeight - scaledHeight) / 2 : Math.min(marginY, Math.max(paneHeight - scaledHeight - marginY, next.y))
      return { ...next, x, y }
    },
    [contentSize, paneCount, overscroll],
  )

  // Always point at the latest fitView without making it an effect dependency,
  // so a new result image does not reset zoom/pan.
  const fitViewRef = useRef(fitView)
  fitViewRef.current = fitView
  const fitKeyRef = useRef("")

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    measure()
    if (!contentSize) return

    const fitKey = `${contentSize.width}x${contentSize.height}|${paneCount}`
    const tryFit = () => {
      const element = containerRef.current
      if (!element || element.clientWidth <= 0 || element.clientHeight <= 0) return
      if (fitKeyRef.current === fitKey) return
      fitKeyRef.current = fitKey
      fitViewRef.current()
    }

    const frame = requestAnimationFrame(tryFit)
    const observer = new ResizeObserver(() => {
      measure()
      if (refitOnResize) fitViewRef.current()
      else tryFit()
    })
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [contentSize, measure, paneCount, refitOnResize])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !contentSize) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = container.getBoundingClientRect()
      const paneWidth = rect.width / paneCount
      let cursorX = event.clientX - rect.left
      if (paneCount === 2 && cursorX >= paneWidth) cursorX -= paneWidth
      const cursorY = event.clientY - rect.top
      setView((prev) => {
        const factor = Math.exp(-event.deltaY * 0.0015)
        const nextScale = Math.min(maxZoom, Math.max(minZoom, prev.scale * factor))
        const ratio = nextScale / prev.scale
        return clampView({
          scale: nextScale,
          x: cursorX - (cursorX - prev.x) * ratio,
          y: cursorY - (cursorY - prev.y) * ratio,
        })
      })
    }

    container.addEventListener("wheel", onWheel, { passive: false })
    return () => container.removeEventListener("wheel", onWheel)
  }, [contentSize, clampView, paneCount, minZoom, maxZoom])

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    setView((prev) => clampView({ ...prev, x: pan.originX + (event.clientX - pan.startX), y: pan.originY + (event.clientY - pan.startY) }))
  }

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      return
    }
    panStateRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return { containerRef, view, setView, size, measure, fitView, clampView, beginPan, movePan, endPan }
}

export type CanvasViewport = ReturnType<typeof useCanvasViewport>
