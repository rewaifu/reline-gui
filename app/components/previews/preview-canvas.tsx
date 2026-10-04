import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "~/lib/utils"
import { type CanvasSize, useCanvasViewport, type ViewState } from "./use-canvas-viewport"

export type CompareMode = "single" | "slider" | "side"

const PIXELATE_ZOOM = 3

// How far past the image edges panning is allowed, as a fraction of the pane.
// 0 = strict (image always covers the pane).
const PAN_OVERSCROLL = 0.25

// Allow zooming out well below 100%, so large images are easier to overview.
const MIN_ZOOM = 0.05

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
  size: CanvasSize
  alignTo?: CanvasSize | null
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

  const [sliderPos, setSliderPos] = useState(0.5)
  const dividerDragRef = useRef(false)

  const paneCount = mode === "side" ? 2 : 1
  const activeSize = useMemo(() => (active ? { width: active.naturalWidth, height: active.naturalHeight } : null), [active])

  const { containerRef, view, size, beginPan, movePan, endPan } = useCanvasViewport({
    contentSize: activeSize,
    paneCount,
    overscroll: PAN_OVERSCROLL,
    minZoom: MIN_ZOOM,
  })

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
    beginPan(event)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dividerDragRef.current) {
      updateSliderPos(event.clientX)
      return
    }
    movePan(event)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dividerDragRef.current = false
    endPan(event)
  }

  const compareSrc = before ?? preview

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
