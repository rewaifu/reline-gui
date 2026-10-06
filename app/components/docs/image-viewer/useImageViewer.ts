import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export const MIN_ZOOM = 1
export const MAX_ZOOM = 8
export const MIN_SCREEN_COVERAGE = 0.3

export interface Size {
  w: number
  h: number
}

export interface Pan {
  x: number
  y: number
}

export interface ZoomAppliedContext {
  container: HTMLElement
  naturalSize: Size
  prevScale: number
  nextScale: number
  prevPan: Pan
}

export interface PanAppliedContext {
  container: HTMLElement
  dx: number
}

interface UseImageViewerOptions {
  onOpen?: () => void
  onZoomApplied?: (ctx: ZoomAppliedContext) => void
  onPanApplied?: (ctx: PanAppliedContext) => void
  onTransformApplied?: (transform: string) => void
  onKeyDown?: (event: KeyboardEvent) => void
}

export function computeFitScale(naturalSize: Size | null, minCoverage = MIN_SCREEN_COVERAGE): number {
  if (!naturalSize) return 1

  const vw = window.innerWidth * 0.9
  const vh = window.innerHeight * 0.9

  let scale = Math.min(vw / naturalSize.w, vh / naturalSize.h)
  scale = Math.min(scale, 1)

  const minW = window.innerWidth * minCoverage
  const minH = window.innerHeight * minCoverage
  const minScale = Math.max(minW / naturalSize.w, minH / naturalSize.h)

  return Math.max(scale, minScale)
}

export function clampPanToContainer(container: HTMLElement | null, naturalSize: Size | null, scale: number, x: number, y: number): Pan {
  if (!container || !naturalSize) return { x, y }

  const vw = container.clientWidth
  const vh = container.clientHeight

  const scaledW = naturalSize.w * scale
  const scaledH = naturalSize.h * scale

  const maxX = Math.max(0, (scaledW - vw) / 2)
  const maxY = Math.max(0, (scaledH - vh) / 2)

  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  }
}

export function useImageViewer(options: UseImageViewerOptions = {}) {
  const [render, setRender] = useState(false)
  const [visible, setVisible] = useState(false)
  const [zoomUI, setZoomUI] = useState(1)
  const [naturalSize, setNaturalSize] = useState<Size | null>(null)
  const [dragging, setDragging] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const transformRef = useRef<HTMLElement | null>(null)
  const probeRef = useRef<HTMLImageElement | null>(null)

  const zoomRef = useRef(1)
  const panRef = useRef<Pan>({ x: 0, y: 0 })
  const dragRef = useRef({ startX: 0, startY: 0, startPanX: 0, startPanY: 0 })
  const panMovedRef = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onOpenRef = useRef(options.onOpen)
  onOpenRef.current = options.onOpen
  const onZoomRef = useRef(options.onZoomApplied)
  onZoomRef.current = options.onZoomApplied
  const onPanRef = useRef(options.onPanApplied)
  onPanRef.current = options.onPanApplied
  const onTransformRef = useRef(options.onTransformApplied)
  onTransformRef.current = options.onTransformApplied
  const onKeyRef = useRef(options.onKeyDown)
  onKeyRef.current = options.onKeyDown

  const isZoomed = zoomUI > 1.001

  const fitScale = useMemo(() => computeFitScale(naturalSize), [naturalSize])

  const clampPan = useCallback(
    (x: number, y: number, scale = zoomRef.current * fitScale) => clampPanToContainer(containerRef.current, naturalSize, scale, x, y),
    [fitScale, naturalSize],
  )

  const updateTransform = useCallback(() => {
    const { x, y } = panRef.current
    const transform = `translate3d(${x}px, ${y}px, 0) scale(${zoomRef.current * fitScale})`

    const el = transformRef.current
    if (el) el.style.transform = transform

    onTransformRef.current?.(transform)
  }, [fitScale])

  useEffect(() => {
    updateTransform()
  }, [updateTransform])

  const openViewer = useCallback(() => {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setZoomUI(1)

    setVisible(false)
    setRender(true)

    requestAnimationFrame(() => setVisible(true))
    onOpenRef.current?.()
  }, [])

  const closeViewer = useCallback(() => {
    setVisible(false)

    closeTimer.current = setTimeout(() => {
      setRender(false)
      zoomRef.current = 1
      panRef.current = { x: 0, y: 0 }
      setZoomUI(1)
    }, 200)
  }, [])

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!render) return
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [render])

  useEffect(() => {
    if (!render) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        closeViewer()
        return
      }
      onKeyRef.current?.(event)
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [render, closeViewer])

  useEffect(() => {
    if (!render) {
      setNaturalSize(null)
      return
    }

    const img = probeRef.current
    if (!img) return

    const update = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
      }
    }

    if (img.complete && img.naturalWidth) update()
    img.addEventListener("load", update)
    return () => img.removeEventListener("load", update)
  }, [render])

  // ── Wheel: мгновенный зум к курсору ─────────────────────────────
  useEffect(() => {
    if (!render) return

    const container = containerRef.current
    if (!container || !naturalSize) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()

      const rect = container.getBoundingClientRect()
      const cx = event.clientX - rect.left
      const cy = event.clientY - rect.top

      const prevZoom = zoomRef.current
      const factor = Math.exp(-event.deltaY * 0.0015)
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor))

      if (nextZoom === prevZoom) return

      const prevScale = prevZoom * fitScale
      const nextScale = nextZoom * fitScale
      const pan = panRef.current
      const prevPan = { x: pan.x, y: pan.y }

      // Точка на изображении под курсором
      const imageX = (cx - container.clientWidth / 2 - pan.x) / prevScale
      const imageY = (cy - container.clientHeight / 2 - pan.y) / prevScale

      // Новый pan, чтобы эта точка осталась под курсором
      const nextPanX = cx - container.clientWidth / 2 - imageX * nextScale
      const nextPanY = cy - container.clientHeight / 2 - imageY * nextScale

      zoomRef.current = nextZoom
      panRef.current = clampPan(nextPanX, nextPanY, nextScale)
      setZoomUI(nextZoom)

      updateTransform()
      onZoomRef.current?.({ container, naturalSize, prevScale, nextScale, prevPan })
    }

    container.addEventListener("wheel", onWheel, { passive: false })
    return () => container.removeEventListener("wheel", onWheel)
  }, [render, fitScale, naturalSize, clampPan, updateTransform])

  // ── Drag (pan) ──────────────────────────────────────────────────
  const startDrag = useCallback((clientX: number, clientY: number) => {
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
    }
    setDragging(true)
  }, [])

  useEffect(() => {
    if (!dragging) return

    const onMove = (event: MouseEvent) => {
      event.preventDefault()

      const dx = event.clientX - dragRef.current.startX
      const dy = event.clientY - dragRef.current.startY
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panMovedRef.current = true

      const prevPanX = panRef.current.x
      const nextX = dragRef.current.startPanX + dx
      const nextY = dragRef.current.startPanY + dy

      panRef.current = clampPan(nextX, nextY)
      updateTransform()

      const container = containerRef.current
      if (container) onPanRef.current?.({ container, dx: panRef.current.x - prevPanX })
    }

    const onUp = () => setDragging(false)

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)

    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [dragging, clampPan, updateTransform])

  // ── Slider: мгновенный зум от центра экрана ─────────────────────
  const handleZoomSliderChange = useCallback(
    (v: number | readonly number[]) => {
      const value = Array.isArray(v) ? v[0] : v
      const container = containerRef.current

      const prevZoom = zoomRef.current
      const nextZoom = value

      // Зумим относительно центра вьюпорта, чтобы не уезжало в сторону
      if (container && naturalSize && prevZoom !== nextZoom) {
        const cx = container.clientWidth / 2
        const cy = container.clientHeight / 2

        const prevScale = prevZoom * fitScale
        const nextScale = nextZoom * fitScale
        const prevPan = { x: panRef.current.x, y: panRef.current.y }

        const imageX = (cx - container.clientWidth / 2 - prevPan.x) / prevScale
        const imageY = (cy - container.clientHeight / 2 - prevPan.y) / prevScale

        const nextPanX = cx - container.clientWidth / 2 - imageX * nextScale
        const nextPanY = cy - container.clientHeight / 2 - imageY * nextScale

        panRef.current = clampPan(nextPanX, nextPanY, nextScale)

        zoomRef.current = nextZoom
        setZoomUI(nextZoom)
        updateTransform()
        onZoomRef.current?.({ container, naturalSize, prevScale, nextScale, prevPan })
        return
      }

      zoomRef.current = nextZoom
      setZoomUI(nextZoom)
      updateTransform()
    },
    [fitScale, naturalSize, clampPan, updateTransform],
  )

  return {
    render,
    visible,
    zoomUI,
    naturalSize,
    dragging,
    isZoomed,
    fitScale,
    containerRef,
    transformRef,
    probeRef,
    zoomRef,
    panRef,
    panMovedRef,
    openViewer,
    closeViewer,
    startDrag,
    handleZoomSliderChange,
  }
}

export type ImageViewer = ReturnType<typeof useImageViewer>
