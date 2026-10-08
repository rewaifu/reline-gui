"use client"

import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react"
import { FULL_PEAKS, computePeaks, getPlaybackTime } from "~/lib/audio"

const HEIGHT = 96
const HANDLE_HIT = 12
const MIN_GAP = 0.01

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readPrimaryColor(): string {
  const styles = getComputedStyle(document.documentElement)
  return styles.getPropertyValue("--primary").trim() || "currentColor"
}

function usePrimaryColor(): string {
  const [color, setColor] = useState(readPrimaryColor)
  useEffect(() => {
    const update = () => setColor(readPrimaryColor())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    query.addEventListener("change", update)
    return () => {
      observer.disconnect()
      query.removeEventListener("change", update)
    }
  }, [])
  return color
}

interface WaveformProps {
  buffer: AudioBuffer
  duration: number
  trimStart: number
  trimEnd: number
  viewStart: number
  viewEnd: number
  onViewChange: (start: number, end: number) => void
  onTrimChange: (start: number, end: number) => void
  onTrimCommit?: (kind: "start" | "end") => void
  playing?: boolean
}

interface DragState {
  kind: "start" | "end" | "pan"
  pointerId: number
  startClientX: number
  startViewStart: number
  startViewEnd: number
}

export function Waveform({
  buffer,
  duration,
  trimStart,
  trimEnd,
  viewStart,
  viewEnd,
  onViewChange,
  onTrimChange,
  onTrimCommit,
  playing = false,
}: WaveformProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [width, setWidth] = useState(0)
  const primary = usePrimaryColor()

  const fullPeaks = useMemo(() => computePeaks(buffer, FULL_PEAKS), [buffer])

  const stateRef = useRef({ duration, trimStart, trimEnd, viewStart, viewEnd, width })
  stateRef.current = { duration, trimStart, trimEnd, viewStart, viewEnd, width }

  const callbacksRef = useRef({ onViewChange, onTrimChange, onTrimCommit })
  callbacksRef.current = { onViewChange, onTrimChange, onTrimCommit }

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const update = () => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.round(HEIGHT * dpr)
    canvas.style.height = `${HEIGHT}px`

    const overlay = overlayRef.current
    if (overlay) {
      overlay.width = canvas.width
      overlay.height = canvas.height
      overlay.style.height = `${HEIGHT}px`
    }

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, HEIGHT)

    const span = Math.max(1e-6, viewEnd - viewStart)
    const mid = HEIGHT / 2
    const amplitude = mid * 0.92
    const bucketOf = (time: number) => clamp(Math.floor((time / duration) * FULL_PEAKS), 0, FULL_PEAKS - 1)

    const top = new Float32Array(width)
    const bottom = new Float32Array(width)
    for (let x = 0; x < width; x++) {
      const t0 = viewStart + (x / width) * span
      const t1 = viewStart + ((x + 1) / width) * span
      const b0 = bucketOf(t0)
      const b1 = Math.max(b0 + 1, bucketOf(t1))
      let lo = 0
      let hi = 0
      for (let b = b0; b < b1 && b < FULL_PEAKS; b++) {
        if (fullPeaks.min[b] < lo) lo = fullPeaks.min[b]
        if (fullPeaks.max[b] > hi) hi = fullPeaks.max[b]
      }
      top[x] = mid - hi * amplitude
      bottom[x] = mid - lo * amplitude
    }

    ctx.beginPath()
    for (let x = 0; x < width; x++) {
      if (x === 0) ctx.moveTo(x + 0.5, top[x])
      else ctx.lineTo(x + 0.5, top[x])
    }
    for (let x = width - 1; x >= 0; x--) {
      ctx.lineTo(x + 0.5, bottom[x])
    }
    ctx.closePath()
    ctx.globalAlpha = 0.35
    ctx.fillStyle = primary
    ctx.fill()
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1.5
    ctx.strokeStyle = primary
    ctx.stroke()
    ctx.globalAlpha = 1

    const timeToX = (time: number) => ((time - viewStart) / span) * width
    const startX = timeToX(trimStart)
    const endX = timeToX(trimEnd)

    const dark = document.documentElement.classList.contains("dark")
    ctx.fillStyle = dark ? "rgba(0, 0, 0, 0.38)" : "rgba(255, 255, 255, 0.55)"
    const leftEdge = clamp(startX, 0, width)
    const rightEdge = clamp(endX, 0, width)
    if (leftEdge > 0) ctx.fillRect(0, 0, leftEdge, HEIGHT)
    if (rightEdge < width) ctx.fillRect(rightEdge, 0, width - rightEdge, HEIGHT)

    const drawHandle = (x: number) => {
      if (x < 0 || x > width) return
      ctx.strokeStyle = primary
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, HEIGHT)
      ctx.stroke()
      ctx.fillStyle = primary
      ctx.beginPath()
      ctx.arc(x, mid, 5, 0, Math.PI * 2)
      ctx.fill()
    }
    drawHandle(startX)
    drawHandle(endX)
  }, [fullPeaks, width, duration, viewStart, viewEnd, trimStart, trimEnd, primary])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      const state = stateRef.current
      if (state.width <= 0) return
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const cursorX = clamp(event.clientX - rect.left, 0, state.width)
      const fraction = cursorX / state.width
      const cursorTime = state.viewStart + fraction * (state.viewEnd - state.viewStart)
      const factor = event.deltaY > 0 ? 1.2 : 1 / 1.2
      const minSpan = Math.min(0.05, state.duration)
      const newSpan = clamp((state.viewEnd - state.viewStart) * factor, minSpan, state.duration)
      let newStart = cursorTime - fraction * newSpan
      newStart = clamp(newStart, 0, Math.max(0, state.duration - newSpan))
      callbacksRef.current.onViewChange(newStart, newStart + newSpan)
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext("2d")
    if (!ctx) return

    if (!playing) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, overlay.width, overlay.height)
      return
    }

    let raf = 0
    const drawFrame = () => {
      const state = stateRef.current
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, state.width, HEIGHT)
      const time = getPlaybackTime()
      if (time != null && state.width > 0) {
        const span = Math.max(1e-6, state.viewEnd - state.viewStart)
        const x = ((time - state.viewStart) / span) * state.width
        if (x >= 0 && x <= state.width) {
          ctx.fillStyle = document.documentElement.classList.contains("dark") ? "#ffffff" : "#18181b"
          ctx.fillRect(x - 1, 0, 2, HEIGHT)
          ctx.globalAlpha = 0.3
          ctx.fillRect(x - 4, 0, 8, HEIGHT)
          ctx.globalAlpha = 1
        }
      }
      raf = requestAnimationFrame(drawFrame)
    }
    raf = requestAnimationFrame(drawFrame)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    const canvas = canvasRef.current
    const state = stateRef.current
    if (!canvas || state.width <= 0) return
    const rect = canvas.getBoundingClientRect()
    const x = clamp(event.clientX - rect.left, 0, state.width)
    const span = Math.max(1e-6, state.viewEnd - state.viewStart)
    const startX = ((state.trimStart - state.viewStart) / span) * state.width
    const endX = ((state.trimEnd - state.viewStart) / span) * state.width
    const dStart = Math.abs(x - startX)
    const dEnd = Math.abs(x - endX)
    let kind: DragState["kind"] = "pan"
    if (dStart <= HANDLE_HIT && dStart <= dEnd) kind = "start"
    else if (dEnd <= HANDLE_HIT) kind = "end"

    canvas.setPointerCapture(event.pointerId)
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startViewStart: state.viewStart,
      startViewEnd: state.viewEnd,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const canvas = canvasRef.current
    const state = stateRef.current
    if (!canvas || state.width <= 0) return
    const rect = canvas.getBoundingClientRect()

    if (drag.kind === "pan") {
      const dx = event.clientX - drag.startClientX
      const span = drag.startViewEnd - drag.startViewStart
      const delta = -(dx / state.width) * span
      const maxStart = Math.max(0, state.duration - span)
      const newStart = clamp(drag.startViewStart + delta, 0, maxStart)
      callbacksRef.current.onViewChange(newStart, newStart + span)
      return
    }

    const x = clamp(event.clientX - rect.left, 0, state.width)
    const time = state.viewStart + (x / state.width) * (state.viewEnd - state.viewStart)
    if (drag.kind === "start") {
      const next = clamp(time, 0, state.trimEnd - MIN_GAP)
      callbacksRef.current.onTrimChange(next, state.trimEnd)
    } else {
      const next = clamp(time, state.trimStart + MIN_GAP, state.duration)
      callbacksRef.current.onTrimChange(state.trimStart, next)
    }
  }

  const handlePointerEnd = () => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    try {
      canvasRef.current?.releasePointerCapture(drag.pointerId)
    } catch {
      // pointer already released
    }
    if (drag.kind === "start" || drag.kind === "end") {
      callbacksRef.current.onTrimCommit?.(drag.kind)
    }
  }

  const handleDoubleClick = () => {
    callbacksRef.current.onViewChange(0, stateRef.current.duration)
  }

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-xl border bg-card">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={handleDoubleClick}
      />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 block w-full" />
    </div>
  )
}
