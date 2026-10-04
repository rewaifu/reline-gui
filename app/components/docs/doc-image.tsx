import { type MouseEvent as ReactMouseEvent, useCallback } from "react"

import { createPortal } from "react-dom"
import { IconX } from "@tabler/icons-react"

import { Button } from "~/components/ui/button.tsx"
import { Slider } from "~/components/ui/slider.tsx"
import { MAX_ZOOM, MIN_ZOOM, useImageViewer } from "./image-viewer/useImageViewer"

type DocImageProps = {
  src: string
  alt: string
  caption?: string
}

export function DocImage({ src, alt, caption }: DocImageProps) {
  const {
    render,
    visible,
    zoomUI,
    naturalSize,
    dragging,
    isZoomed,
    containerRef,
    transformRef,
    probeRef,
    zoomRef,
    openViewer,
    closeViewer,
    startDrag,
    handleZoomSliderChange,
  } = useImageViewer()

  // В одиночном просмотрщике сам <img> служит и целью трансформации, и пробником размера.
  const setImgRef = useCallback(
    (el: HTMLImageElement | null) => {
      probeRef.current = el
      transformRef.current = el
    },
    [probeRef, transformRef],
  )

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (!isZoomed) return
      e.preventDefault()
      startDrag(e.clientX, e.clientY)
    },
    [isZoomed, startDrag],
  )

  return (
    <>
      <figure className="my-5 w-full">
        <img src={src} alt={alt} className="w-full rounded-lg border cursor-zoom-in" onClick={openViewer} draggable={false} />
        {caption ? <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption> : null}
      </figure>

      {render
        ? createPortal(
            <div
              className={`
                fixed inset-0 z-50
                bg-black/70 backdrop-blur-sm
                transition-opacity duration-200
                ${visible ? "opacity-100" : "opacity-0"}
              `}
              onClick={closeViewer}
            >
              <Button
                variant="outline"
                size="icon-sm"
                className="absolute top-4 right-4 z-20 shadow-lg !bg-background"
                onClick={(e) => {
                  e.stopPropagation()
                  closeViewer()
                }}
              >
                <IconX />
              </Button>

              <div ref={containerRef} className="absolute inset-0 overflow-hidden touch-none">
                <div className="w-full h-full flex items-center justify-center">
                  <img
                    ref={setImgRef}
                    src={src}
                    alt={alt}
                    draggable={false}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={handleMouseDown}
                    className={`
                      select-none will-change-transform
                      max-w-none max-h-none shrink-0
                      ${isZoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"}
                    `}
                    style={{
                      width: naturalSize?.w,
                      height: naturalSize?.h,
                      transformOrigin: "center center",
                      backfaceVisibility: "hidden",
                      imageRendering: zoomRef.current > 1 ? "pixelated" : "auto",
                    }}
                  />
                </div>
              </div>

              {caption ? (
                <div
                  className={`
                    absolute bottom-0 left-0 right-0
                    pb-5 text-center text-sm text-white/70
                    transition-opacity duration-200
                    ${isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"}
                  `}
                >
                  {caption}
                </div>
              ) : null}

              <div
                className="
                  absolute right-4 bottom-4 z-20
                  flex items-center gap-2
                  rounded-lg border bg-background
                  px-3 py-2 shadow-lg
                "
                onClick={(e) => e.stopPropagation()}
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
