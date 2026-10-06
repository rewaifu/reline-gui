import { type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent, useCallback, useMemo, useRef, useState } from "react"

import { useTranslation } from "react-i18next"
import { createPortal } from "react-dom"
import { IconArrowsMoveHorizontal, IconX, IconZoomIn } from "@tabler/icons-react"

import { Button } from "~/components/ui/button.tsx"
import { Slider } from "~/components/ui/slider.tsx"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs.tsx"
import { Select, SelectItem, SelectTrigger } from "~/components/ui/select.tsx"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { MAX_ZOOM, MIN_ZOOM, useImageViewer } from "./image-viewer/useImageViewer"

type CompareImage = {
  src: string
  label: string
}

type DocImageCompareProps = {
  images?: CompareImage[]
  previewMode?: "slider" | "switch"
  // backward compat
  srcA?: string
  srcB?: string
  labelA?: string
  labelB?: string
  alt?: string
  caption?: string
  pixelated?: boolean
}

function SliderKnob({ iconSize = 18 }: { iconSize?: number }) {
  return (
    <>
      <div
        className="absolute inset-y-0 bg-white shadow-[0_0_10px_rgba(0,0,0,0.7)]"
        style={{
          width: 3,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />
      <div
        className={`
          absolute top-1/2 left-1/2
          -translate-x-1/2 -translate-y-1/2
          rounded-full
          bg-card border-3 border-primary
          flex items-center justify-center
          cursor-ew-resize
          hover:scale-110 transition-transform
          shadow-[0_4px_16px_rgba(0,0,0,0.5)]
        `}
        style={{ width: 40, height: 40 }}
      >
        <IconArrowsMoveHorizontal size={iconSize} />
      </div>
    </>
  )
}

export function DocImageCompare(props: DocImageCompareProps) {
  // ── normalise images ──────────────────────────────────────────────
  const { t } = useTranslation()
  const previewMode = props.previewMode ?? "slider"
  const forcePixelated = props.pixelated ?? false
  const images: CompareImage[] = useMemo(() => {
    if (props.images && props.images.length >= 2) return props.images
    return [
      { src: props.srcA ?? "", label: props.labelA ?? "A" },
      { src: props.srcB ?? "", label: props.labelB ?? "B" },
    ]
  }, [props.images, props.srcA, props.srcB, props.labelA, props.labelB])

  const [selA, setSelA] = useState(0)
  const [selB, setSelB] = useState(Math.min(1, images.length - 1))

  const imgA = images[selA] ?? images[0]
  const imgB = images[selB] ?? images[0]
  const alt = props.alt ?? `${imgA.label} vs ${imgB.label}`

  // ── compare-specific state ────────────────────────────────────────

  const [position, setPosition] = useState(50)
  const [viewerMode, setViewerMode] = useState<"slider" | "switch">(previewMode)
  const [switchIdx, setSwitchIdx] = useState(0)

  const positionRef = useRef(50)
  positionRef.current = position

  const inlineRef = useRef<HTMLDivElement>(null)

  const imgARef = useRef<HTMLImageElement | null>(null)
  const imgBRef = useRef<HTMLImageElement | null>(null)
  const transformStrRef = useRef("")

  const applyTransform = useCallback((transform: string) => {
    transformStrRef.current = transform
    if (imgARef.current) imgARef.current.style.transform = transform
    if (imgBRef.current) imgBRef.current.style.transform = transform
  }, [])

  const setImgARef = useCallback((el: HTMLImageElement | null) => {
    imgARef.current = el
    if (el && transformStrRef.current) el.style.transform = transformStrRef.current
  }, [])

  const setImgBRef = useCallback((el: HTMLImageElement | null) => {
    imgBRef.current = el
    if (el && transformStrRef.current) el.style.transform = transformStrRef.current
  }, [])

  const sliderDragRef = useRef(false)
  const wasSliderDraggedRef = useRef(false)
  const sliderJustEndedRef = useRef(false)

  // ── shared zoom / pan viewer ──────────────────────────────────────

  const {
    render,
    visible,
    zoomUI,
    naturalSize,
    isZoomed,
    fitScale,
    containerRef,
    probeRef,
    zoomRef,
    panRef,
    panMovedRef,
    openViewer,
    closeViewer,
    startDrag,
    handleZoomSliderChange,
  } = useImageViewer({
    onOpen: () => {
      transformStrRef.current = ""
      setPosition(50)
      setSwitchIdx(0)
    },
    onTransformApplied: applyTransform,
    onZoomApplied: (ctx) => {
      const Nw = ctx.naturalSize.w
      const cw = ctx.container.clientWidth
      const visCx = (positionRef.current / 100) * cw
      const imageX = (visCx - cw / 2 - ctx.prevPan.x) / ctx.prevScale + Nw / 2
      const newVisCx = (imageX - Nw / 2) * ctx.nextScale + cw / 2 + panRef.current.x
      setPosition((newVisCx / cw) * 100)
    },
    onPanApplied: ({ container, dx }) => {
      const cw = container.clientWidth
      if (cw) setPosition((p) => p + (dx / cw) * 100)
    },
    onKeyDown: (event) => {
      if (viewerMode === "switch" && /^[1-9]$/.test(event.key)) {
        const idx = Number.parseInt(event.key) - 1
        if (idx < images.length) setSwitchIdx(idx)
      }
    },
  })

  // ── shared slider drag (inline) ───────────────────────────────────

  const beginDrag = useCallback(
    (container: HTMLDivElement | null) => {
      sliderDragRef.current = true
      wasSliderDraggedRef.current = false

      const onMove = (e: MouseEvent) => {
        if (!sliderDragRef.current) return
        e.preventDefault()
        if (!container) return
        const rect = container.getBoundingClientRect()
        const x = e.clientX - rect.left
        const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
        if (Math.abs(pct - position) > 1) wasSliderDraggedRef.current = true
        setPosition(pct)
      }

      const onTouchMove = (e: TouchEvent) => {
        if (!sliderDragRef.current) return
        e.preventDefault()
        if (!container) return
        const rect = container.getBoundingClientRect()
        const x = e.touches[0].clientX - rect.left
        const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
        if (Math.abs(pct - position) > 1) wasSliderDraggedRef.current = true
        setPosition(pct)
      }

      const onUp = () => {
        sliderDragRef.current = false
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        window.removeEventListener("touchmove", onTouchMove)
        window.removeEventListener("touchend", onUp)
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
      window.addEventListener("touchmove", onTouchMove, { passive: false })
      window.addEventListener("touchend", onUp)
    },
    [position],
  )

  const handleInlineSliderDown = useCallback(
    (e: ReactMouseEvent | ReactTouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      beginDrag(inlineRef.current)
    },
    [beginDrag],
  )

  // ── viewer slider drag ───────────────────────────────────────────

  const handleViewerSliderDown = useCallback(
    (e: ReactMouseEvent | ReactTouchEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const container = containerRef.current
      if (!container) return

      sliderDragRef.current = true
      wasSliderDraggedRef.current = false

      const clampToImage = (visualPct: number, cw: number) => {
        if (!naturalSize) return Math.max(0, Math.min(100, visualPct))
        const Nw = naturalSize.w
        const scale = zoomRef.current * fitScale
        const pan = panRef.current
        const imgLeft = cw / 2 + pan.x - (Nw * scale) / 2
        const imgRight = cw / 2 + pan.x + (Nw * scale) / 2
        const clampedX = Math.max(imgLeft, Math.min(imgRight, (visualPct / 100) * cw))
        return Math.max(0, Math.min(100, (clampedX / cw) * 100))
      }

      const onMove = (ev: MouseEvent) => {
        if (!sliderDragRef.current) return
        ev.preventDefault()
        const rect = container.getBoundingClientRect()
        const rawPct = ((ev.clientX - rect.left) / rect.width) * 100
        const pct = clampToImage(rawPct, rect.width)
        if (Math.abs(pct - position) > 1) wasSliderDraggedRef.current = true
        setPosition(pct)
      }

      const onTouchMove = (ev: TouchEvent) => {
        if (!sliderDragRef.current) return
        ev.preventDefault()
        const rect = container.getBoundingClientRect()
        const rawPct = ((ev.touches[0].clientX - rect.left) / rect.width) * 100
        const pct = clampToImage(rawPct, rect.width)
        if (Math.abs(pct - position) > 1) wasSliderDraggedRef.current = true
        setPosition(pct)
      }

      const onUp = () => {
        sliderDragRef.current = false
        sliderJustEndedRef.current = true
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        window.removeEventListener("touchmove", onTouchMove)
        window.removeEventListener("touchend", onUp)
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
      window.addEventListener("touchmove", onTouchMove, { passive: false })
      window.addEventListener("touchend", onUp)
    },
    [position, naturalSize, fitScale, containerRef, zoomRef, panRef],
  )

  // ── open viewer (skip if inline slider was just dragged) ─────────

  const handleOpenViewer = useCallback(() => {
    if (wasSliderDraggedRef.current) {
      wasSliderDraggedRef.current = false
      return
    }
    openViewer()
  }, [openViewer])

  // ── switch mode: click canvas → next image ───────────────────────

  const switchModeRef = useRef({ clickInit: false, clientX: 0, clientY: 0 })

  const handleSwitchMouseDown = useCallback((e: ReactMouseEvent) => {
    switchModeRef.current = { clickInit: true, clientX: e.clientX, clientY: e.clientY }
  }, [])

  const handleSwitchClick = useCallback(
    (e: ReactMouseEvent) => {
      if (!switchModeRef.current.clickInit) return
      const dx = e.clientX - switchModeRef.current.clientX
      const dy = e.clientY - switchModeRef.current.clientY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) return
      setSwitchIdx((i) => (i + 1) % images.length)
    },
    [images.length],
  )

  // ── hit-test: is the pointer over the (transformed) image? ──────
  // Clicks outside the image must reach the portal root so it can close.
  const isPointInsideImage = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current
      if (!container || !naturalSize) return false
      const rect = container.getBoundingClientRect()
      const scale = zoomRef.current * fitScale
      const pan = panRef.current
      const x = clientX - rect.left
      const y = clientY - rect.top
      const halfW = (naturalSize.w * scale) / 2
      const halfH = (naturalSize.h * scale) / 2
      const cx = rect.width / 2 + pan.x
      const cy = rect.height / 2 + pan.y
      return x >= cx - halfW && x <= cx + halfW && y >= cy - halfH && y <= cy + halfH
    },
    [containerRef, naturalSize, fitScale, zoomRef, panRef],
  )

  // ── switch mode: current image src ──────────────────────────────

  const switchSrc = images[switchIdx]?.src ?? images[0]?.src ?? ""

  // ── select dropdown component ─────────────────────────────────────

  const ImageSelect = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger size="sm" className="!bg-background text-foreground border shadow-lg max-w-[140px]">
        <span className="flex flex-1 text-left truncate">{images[value]?.label ?? value}</span>
      </SelectTrigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner side="bottom" sideOffset={4} className="z-[60]">
          <SelectPrimitive.Popup className="bg-popover text-popover-foreground min-w-36 rounded-lg shadow-md ring-1 ring-foreground/10 origin-(--transform-origin) overflow-x-hidden overflow-y-auto max-h-(--available-height) w-(--anchor-width) data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95">
            <SelectPrimitive.List>
              {images.map((img, i) => (
                <SelectItem key={img.src} value={String(i)}>
                  {img.label}
                </SelectItem>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </Select>
  )

  // ── switch mode thumbnails ───────────────────────────────────────

  const ThumbnailStrip = () => (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={() => {}}>
      {images.map((img, i) => (
        <button
          key={img.src}
          type="button"
          className={`
            relative flex flex-col items-center gap-0.5 rounded overflow-hidden
            border-2 transition-colors cursor-pointer
            ${i === switchIdx ? "border-primary" : "border-white/20 hover:border-white/50"}
          `}
          style={{ width: 40, height: 36 }}
          onClick={(e) => {
            e.stopPropagation()
            setSwitchIdx(i)
          }}
        >
          <img src={img.src} alt={img.label} draggable={false} className="w-full h-full object-cover" />
          <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center text-white bg-black/60 leading-tight">{i + 1}</span>
        </button>
      ))}
    </div>
  )

  // ── render ───────────────────────────────────────────────────────

  return (
    <>
      <figure className="my-5 w-full">
        <div
          ref={inlineRef}
          className="relative cursor-zoom-in overflow-hidden rounded-lg border aspect-video"
          onClick={handleOpenViewer}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              handleOpenViewer()
            }
          }}
        >
          <img
            ref={probeRef}
            src={previewMode === "switch" ? images[0]?.src : imgA.src}
            alt={alt}
            draggable={false}
            className={previewMode === "switch" ? "w-full h-full object-cover" : "w-full h-auto invisible block absolute"}
            style={{ imageRendering: forcePixelated ? "pixelated" : "auto" }}
          />

          {previewMode === "switch" ? (
            <div className="absolute top-2 right-2 bg-black/50 rounded-md p-1">
              <IconZoomIn className="size-4 text-white" />
            </div>
          ) : (
            <>
              <img
                src={imgA.src}
                alt={alt}
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover select-none"
                style={{ imageRendering: forcePixelated ? "pixelated" : "auto" }}
              />

              <div className="absolute inset-0 overflow-hidden select-none" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
                <img
                  src={imgB.src}
                  alt={alt}
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ imageRendering: forcePixelated ? "pixelated" : "auto" }}
                />
              </div>

              <div
                className="absolute inset-y-0 z-10 cursor-ew-resize"
                style={{ left: `${position}%`, width: 20, transform: "translateX(-50%)" }}
                onMouseDown={handleInlineSliderDown}
                onTouchStart={handleInlineSliderDown}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={() => {}}
              >
                <SliderKnob iconSize={14} />
              </div>
            </>
          )}
        </div>
        {props.caption ? <figcaption className="mt-2 text-center text-sm text-muted-foreground">{props.caption}</figcaption> : null}
      </figure>

      {render
        ? createPortal(
            <div
              className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
              onClick={() => {
                if (sliderJustEndedRef.current) {
                  sliderJustEndedRef.current = false
                  return
                }
                closeViewer()
              }}
              onKeyDown={() => {}}
            >
              <Button
                variant="outline"
                size="icon-sm"
                className="absolute top-4 right-4 z-30 shadow-lg !bg-background"
                onClick={(e) => {
                  e.stopPropagation()
                  closeViewer()
                }}
              >
                <IconX />
              </Button>

              {/* ── switch mode UI bar (top-left) ──────────────────── */}
              {viewerMode === "switch" ? (
                <div className="absolute top-3 left-3 z-20 flex items-center gap-3">
                  <span className="text-sm font-medium text-white/80 bg-black/40 px-2 py-1 rounded select-none">
                    {images[switchIdx]?.label} {switchIdx + 1}/{images.length}
                  </span>
                  <ThumbnailStrip />
                </div>
              ) : null}

              {/* ── image selects (left / right edges, vertical center) ── */}
              {viewerMode === "slider" ? (
                <>
                  <div className="absolute left-6 inset-y-0 flex items-center z-20" onClick={(e) => e.stopPropagation()} onKeyDown={() => {}}>
                    <ImageSelect
                      value={selA}
                      onChange={(v) => {
                        if (v === selB) setSelB(selA)
                        setSelA(v)
                      }}
                    />
                  </div>
                  <div className="absolute right-6 inset-y-0 flex items-center z-20" onClick={(e) => e.stopPropagation()} onKeyDown={() => {}}>
                    <ImageSelect
                      value={selB}
                      onChange={(v) => {
                        if (v === selA) setSelA(selB)
                        setSelB(v)
                      }}
                    />
                  </div>
                </>
              ) : null}

              <div ref={containerRef} className="absolute inset-0 overflow-hidden touch-none">
                {/* image A — carries its own pan/zoom transform */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <img
                    ref={setImgARef}
                    src={viewerMode === "switch" ? switchSrc : imgA.src}
                    alt={alt}
                    draggable={false}
                    className="max-w-none max-h-none shrink-0 block select-none"
                    style={{
                      width: naturalSize?.w,
                      height: naturalSize?.h,
                      transformOrigin: "center center",
                      backfaceVisibility: "hidden",
                      imageRendering: zoomRef.current > 1 || forcePixelated ? "pixelated" : "auto",
                    }}
                  />
                </div>

                {/* image B — clipped in screen space in slider mode */}
                {viewerMode === "slider" ? (
                  <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <img
                        ref={setImgBRef}
                        src={imgB.src}
                        alt={alt}
                        draggable={false}
                        className="max-w-none max-h-none shrink-0 block select-none"
                        style={{
                          width: naturalSize?.w,
                          height: naturalSize?.h,
                          transformOrigin: "center center",
                          backfaceVisibility: "hidden",
                          imageRendering: zoomRef.current > 1 || forcePixelated ? "pixelated" : "auto",
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {/* interaction overlay — pan / click to move slider */}
                <div
                  className="absolute inset-0"
                  onMouseDown={(e) => {
                    if (!isPointInsideImage(e.clientX, e.clientY)) return
                    if (viewerMode === "switch") {
                      handleSwitchMouseDown(e)
                      if (isZoomed) {
                        e.preventDefault()
                        e.stopPropagation()
                        startDrag(e.clientX, e.clientY)
                      }
                      return
                    }
                    if (!isZoomed) return
                    e.preventDefault()
                    e.stopPropagation()
                    startDrag(e.clientX, e.clientY)
                  }}
                  onClick={(e) => {
                    if (!isPointInsideImage(e.clientX, e.clientY)) return
                    e.stopPropagation()
                    if (viewerMode === "switch") {
                      handleSwitchClick(e)
                      return
                    }
                    if (panMovedRef.current) {
                      panMovedRef.current = false
                      return
                    }
                    const container = containerRef.current
                    if (!container) return
                    const rect = container.getBoundingClientRect()
                    const cw = rect.width
                    const rawPct = ((e.clientX - rect.left) / cw) * 100
                    if (naturalSize) {
                      const Nw = naturalSize.w
                      const scale = zoomRef.current * fitScale
                      const pan = panRef.current
                      const imgLeft = cw / 2 + pan.x - (Nw * scale) / 2
                      const imgRight = cw / 2 + pan.x + (Nw * scale) / 2
                      const cx = (rawPct / 100) * cw
                      const clampedX = Math.max(imgLeft, Math.min(imgRight, cx))
                      setPosition((clampedX / cw) * 100)
                    } else {
                      setPosition(Math.max(0, Math.min(100, rawPct)))
                    }
                  }}
                  onKeyDown={() => {}}
                />

                {/* slider handle — only in slider mode */}
                {viewerMode === "slider" ? (
                  <div
                    className="absolute inset-y-0 z-10 cursor-ew-resize"
                    style={{ left: `${position}%`, width: 24, transform: "translateX(-50%)" }}
                    onMouseDown={handleViewerSliderDown}
                    onTouchStart={handleViewerSliderDown}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={() => {}}
                  >
                    <SliderKnob iconSize={18} />
                  </div>
                ) : null}
              </div>

              {/* caption */}
              {props.caption ? (
                <div
                  className={`absolute bottom-0 left-0 right-0 pb-5 text-center text-sm text-white/70 transition-opacity duration-200 ${
                    isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
                  }`}
                >
                  {props.caption}
                </div>
              ) : null}

              {/* ── mode tabs (bottom-left) ────────────────────────── */}
              <div
                className="absolute left-4 bottom-4 z-20 flex flex-col gap-1 items-center"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={() => {}}
              >
                <p className="bg-background border shadow-lg rounded-lg text-center text-sm w-full p-1">{t("docs.image-viewer.mode")}</p>
                <Tabs value={viewerMode} onValueChange={(v) => setViewerMode(v as "slider" | "switch")}>
                  <TabsList className="bg-background shadow-lg border rounded-lg p-[3px]">
                    <TabsTrigger value="slider">{t("docs.image-viewer.slider")}</TabsTrigger>
                    <TabsTrigger value="switch">{t("docs.image-viewer.switch")}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* zoom UI */}
              <div
                className="absolute right-4 bottom-4 z-20 flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-lg"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={() => {}}
              >
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground select-none">{Math.round(zoomUI * 100)}%</span>
                <Slider value={[zoomUI]} min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} onValueChange={handleZoomSliderChange} className="w-32" />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
