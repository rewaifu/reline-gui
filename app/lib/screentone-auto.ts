import { IMAGE_EXT, baseName, joinPath, toBlobUrl } from "~/lib/image-files"

export const AUTO_SCREENTONE_SAMPLE_COUNT = 12
export const AUTO_SCREENTONE_MIN_SHARE = 0.7

// Base dot size function: dot = height / 260, clamped to a minimum of 3.
// The divisor is derived from AniChan's reference tests (1000->4, 1200->5,
// 1600->6, 1920->7, 2048->8), which follow dot = DPI / LPI with DPI ∝ height.
export const DOT_SIZE_MIN = 3
export const DOT_SIZE_DIVISOR = 260

export async function listFolderImages(folderPath: string, limit = AUTO_SCREENTONE_SAMPLE_COUNT): Promise<string[]> {
  const { readDir } = await import("@tauri-apps/plugin-fs")
  const entries = await readDir(folderPath)
  return entries
    .filter((entry) => entry.isFile && entry.name && IMAGE_EXT.test(entry.name))
    .map((entry) => joinPath(folderPath, entry.name))
    .sort()
    .slice(0, limit)
}

function loadImageHeight(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image.naturalHeight)
    image.onerror = () => reject(new Error("image load failed"))
    image.src = url
  })
}

export async function measureImageHeight(path: string): Promise<number> {
  const { readFile } = await import("@tauri-apps/plugin-fs")
  const bytes = await readFile(path)
  const url = toBlobUrl(bytes, baseName(path))
  try {
    return await loadImageHeight(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function mostCommonHeight(heights: number[], minShare = AUTO_SCREENTONE_MIN_SHARE): number | null {
  if (heights.length === 0) return null
  const counts = new Map<number, number>()
  for (const height of heights) {
    counts.set(height, (counts.get(height) ?? 0) + 1)
  }
  let best: number | null = null
  let bestCount = 0
  for (const [height, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && height > best)) {
      best = height
      bestCount = count
    }
  }
  if (best === null) return null
  return bestCount / heights.length >= minShare ? best : null
}

export interface DominantHeight {
  height: number
  sampled: number
}

export async function detectDominantHeight(folderPath: string): Promise<DominantHeight | null> {
  const trimmed = folderPath.trim()
  if (!trimmed) return null

  let images: string[]
  try {
    images = await listFolderImages(trimmed)
  } catch {
    return null
  }
  if (images.length === 0) return null

  const heights = (
    await Promise.all(
      images.map(async (path) => {
        try {
          return await measureImageHeight(path)
        } catch {
          return null
        }
      }),
    )
  ).filter((height): height is number => height != null)

  if (heights.length === 0) return null

  const height = mostCommonHeight(heights)
  if (height === null) return null

  return { height, sampled: heights.length }
}

export function suggestDotSizeFloat(height: number): number {
  return Math.max(DOT_SIZE_MIN, height / DOT_SIZE_DIVISOR)
}

export interface AutoScreentoneSettings {
  useSsaa: boolean
  minProduct: number
  fractionalDot: boolean
}

export interface AutoScreentoneParams {
  dot_size: number
  ssaa_scale?: number
  disable_auto_dot?: boolean
}

function roundUpTo2(value: number): number {
  return Math.ceil(value * 100) / 100
}

export function computeAutoParams(height: number, settings: AutoScreentoneSettings): AutoScreentoneParams {
  const base = suggestDotSizeFloat(height)

  if (!settings.useSsaa) {
    return { dot_size: Math.round(base), ssaa_scale: undefined, disable_auto_dot: undefined }
  }

  const target = settings.fractionalDot ? base : Math.round(base)

  if (target >= 8) {
    return { dot_size: Math.round(target), ssaa_scale: undefined, disable_auto_dot: undefined }
  }

  const ssaaScale = roundUpTo2(Math.max(2, settings.minProduct / target))

  if (settings.fractionalDot) {
    return {
      dot_size: Math.round(target * ssaaScale),
      ssaa_scale: ssaaScale,
      disable_auto_dot: true,
    }
  }

  return {
    dot_size: Math.round(target),
    ssaa_scale: ssaaScale,
    disable_auto_dot: undefined,
  }
}
