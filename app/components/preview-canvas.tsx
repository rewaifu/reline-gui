import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "~/lib/utils"

export type CompareMode = "single" | "slider" | "side"

interface ViewState {
  scale: number
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 16
const PIXELATE_ZOOM = 3

function useImage(src: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!src) {
      setImage(null)
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setImage(img)
    }
    img.onerror = () => {
      if (!cancelled) setImage(null)
    }
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src])

  return image
}

function CanvasLayer({
  image,
  view,
  size,
  alignTo,
}: {
  image: HTMLImageElement | null
  view: ViewState
  size: Size
  alignTo?: Size | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image || size.width <= 0 || size.height <= 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(size.width * dpr))
    canvas.height = Math.max(1, Math.round(size.height * dpr))
    const context = canvas.getContext("2d")
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, size.width, size.height)
    // Smooth (high-quality) interpolation when far away; pixelated only at close zoom.
    context.imageSmoothingEnabled = view.scale < PIXELATE_ZOOM
    context.imageSmoothingQuality = "high"
    // Match the reference (upscaled) dimensions so comparisons line up.
    const factorX = alignTo && image.naturalWidth > 0 ? alignTo.width / image.naturalWidth : 1
    const factorY = alignTo && image.naturalHeight > 0 ? alignTo.height / image.naturalHeight : 1
    context.translate(view.x, view.y)
    context.scale(view.scale * factorX, view.scale * factorY)
    context.drawImage(image, 0, 0)
  }, [image, view, size, alignTo])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
}

export function PreviewCanvas({
  previewSrc,
  beforeSrc,
  afterSrc,
  mode,
  className,
}: {
  previewSrc: string | null
  beforeSrc: string | null
  afterSrc: string | null
  mode: CompareMode
  className?: string
}) {
  const preview = useImage(previewSrc)
  const before = useImage(beforeSrc)
  const after = useImage(afterSrc)
  const active = after ?? preview

  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [sliderPos, setSliderPos] = useState(0.5)

  const containerRef = useRef<HTMLDivElement>(null)
  const panStateRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const dividerDragRef = useRef(false)

  const paneCount = mode === "side" ? 2 : 1

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    setSize({ width: container.clientWidth / paneCount, height: container.clientHeight })
  }, [paneCount])

  const fitView = useCallback(() => {
    const container = containerRef.current
    if (!container || !active) return
    const paneWidth = container.clientWidth / paneCount
    const paneHeight = container.clientHeight
    if (!paneWidth || !paneHeight) return
    const scale = Math.min(paneWidth / active.naturalWidth, paneHeight / active.naturalHeight)
    setView({ scale, x: (paneWidth - active.naturalWidth * scale) / 2, y: (paneHeight - active.naturalHeight * scale) / 2 })
  }, [active, paneCount])

  const clampView = useCallback(
    (next: ViewState): ViewState => {
      const container = containerRef.current
      if (!container || !active) return next
      const paneWidth = container.clientWidth / paneCount
      const paneHeight = container.clientHeight
      const scaledWidth = active.naturalWidth * next.scale
      const scaledHeight = active.naturalHeight * next.scale
      const x = scaledWidth <= paneWidth ? (paneWidth - scaledWidth) / 2 : Math.min(0, Math.max(paneWidth - scaledWidth, next.x))
      const y = scaledHeight <= paneHeight ? (paneHeight - scaledHeight) / 2 : Math.min(0, Math.max(paneHeight - scaledHeight, next.y))
      return { ...next, x, y }
    },
    [active, paneCount],
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
    if (!active) return
    // Only auto-fit when the reference image changes or the compare layout changes;
    // applying new parameters, resizing the window or toggling the panel keeps the view.
    const fitKey = `${active.naturalWidth}x${active.naturalHeight}|${paneCount}`
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
      tryFit()
    })
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [active, measure, paneCount])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !active) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = container.getBoundingClientRect()
      const paneWidth = rect.width / paneCount
      let cursorX = event.clientX - rect.left
      if (paneCount === 2 && cursorX >= paneWidth) cursorX -= paneWidth
      const cursorY = event.clientY - rect.top
      setView((prev) => {
        const factor = Math.exp(-event.deltaY * 0.0015)
        const nextScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.scale * factor))
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
  }, [active, clampView, paneCount])

  const updateSliderPos = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setSliderPos(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)))
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (mode === "slider" && after && (event.target as HTMLElement).closest("[data-divider]")) {
      dividerDragRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      updateSliderPos(event.clientX)
      return
    }
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dividerDragRef.current) {
      updateSliderPos(event.clientX)
      return
    }
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    setView((prev) => clampView({ ...prev, x: pan.originX + (event.clientX - pan.startX), y: pan.originY + (event.clientY - pan.startY) }))
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dividerDragRef.current = false
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      return
    }
    panStateRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const compareSrc = before ?? preview
  const activeSize = useMemo(() => (active ? { width: active.naturalWidth, height: active.naturalHeight } : null), [active])

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative min-h-0 w-full flex-1 cursor-grab touch-none overflow-hidden rounded-lg border bg-muted/30 active:cursor-grabbing",
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {mode === "side" ? (
        <div className="absolute inset-0 grid grid-cols-2">
          <div className="relative overflow-hidden border-r-2 border-border">
            <CanvasLayer image={compareSrc} view={view} size={size} alignTo={activeSize} />
          </div>
          <div className="relative overflow-hidden">
            <CanvasLayer image={after ?? preview} view={view} size={size} />
          </div>
        </div>
      ) : mode === "slider" && after ? (
        <>
          <CanvasLayer image={compareSrc} view={view} size={size} alignTo={activeSize} />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${sliderPos * 100}%)` }}>
            <CanvasLayer image={after} view={view} size={size} />
          </div>
          <div data-divider className="absolute top-0 bottom-0 z-10 w-px cursor-ew-resize bg-primary" style={{ left: `${sliderPos * 100}%` }}>
            <div className="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background" />
          </div>
        </>
      ) : (
        <CanvasLayer image={active} view={view} size={size} />
      )}
    </div>
  )
}
