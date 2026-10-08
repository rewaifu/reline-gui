import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { StackNode } from "~/types/node.ts"
import { convertToPure, convertToStack } from "~/lib/convert"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  const digits = i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[i]}`
}

export const nodesToString: (nodes: StackNode[]) => string = (nodes) => {
  return JSON.stringify(convertToPure(nodes), null, 2)
}

export const stringToNodes: (text: string) => StackNode[] = (text) => {
  const nodes = JSON.parse(text)
  return convertToStack(nodes)
}

export function scrollIntoViewWithOffset(element: HTMLElement, offset = 48) {
  const scroller = element.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null
  if (!scroller) {
    element.scrollIntoView({ block: "nearest", behavior: "smooth" })
    return
  }
  const elRect = element.getBoundingClientRect()
  const scRect = scroller.getBoundingClientRect()
  const visibleTop = scRect.top + offset
  const visibleBottom = scRect.bottom - offset
  if (elRect.top >= visibleTop && elRect.bottom <= visibleBottom) return
  let delta = elRect.top < visibleTop ? elRect.top - visibleTop : elRect.bottom - visibleBottom
  // When scrolling down, stop the top (header) at a small offset from the top edge
  // instead of letting it slide above the viewport (and under the top gradient).
  if (delta > 0) {
    const maxDelta = elRect.top - visibleTop
    if (delta > maxDelta) delta = maxDelta
  }
  scroller.scrollBy({ top: delta, behavior: "smooth" })
}
