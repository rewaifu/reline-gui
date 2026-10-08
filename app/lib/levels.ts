export type AmplifyMode = "lights" | "darks"

export interface LevelsProcessOptions {
  lowInput: number
  highInput: number
  grayscale: boolean
  amplifyEnabled: boolean
  amplifyMode: AmplifyMode
  strength: number
}

export const AMPLIFY_MIN = 2
export const AMPLIFY_MAX = 253
export const AMPLIFY_DEFAULT = 253
export const MAX_PROCESS_SIDE = 1800

function clamp255(value: number): number {
  if (value < 0) return 0
  if (value > 255) return 255
  return value
}

function levelMap(value: number, low: number, high: number): number {
  if (high <= low) return value <= low ? 0 : 255
  return clamp255(((value - low) / (high - low)) * 255)
}

function amplifyLights(value: number, strength: number): number {
  const span = 255 - strength
  if (span <= 0) return value >= strength ? 255 : 0
  return clamp255(((value - strength) * 255) / span)
}

function amplify(value: number, mode: AmplifyMode, strength: number): number {
  // Full effect is reached at strength = 253 for both modes (min = 2).
  // Dark tones reuse the light-tone curve on inverted values, so 253 = full here too.
  if (mode === "darks") return 255 - amplifyLights(255 - value, strength)
  return amplifyLights(value, strength)
}

/**
 * Applies grayscale, input levels (low/high) and optional tone amplification to raw pixel data.
 * Order: grayscale -> levels -> amplification.
 */
export function processImageData(raw: ImageData, options: LevelsProcessOptions): ImageData {
  const { lowInput, highInput, grayscale, amplifyEnabled, amplifyMode, strength } = options
  const source = raw.data
  const output = new Uint8ClampedArray(source.length)

  for (let i = 0; i < source.length; i += 4) {
    let r = source[i]
    let g = source[i + 1]
    let b = source[i + 2]

    if (grayscale) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      r = luma
      g = luma
      b = luma
    }

    r = levelMap(r, lowInput, highInput)
    g = levelMap(g, lowInput, highInput)
    b = levelMap(b, lowInput, highInput)

    if (amplifyEnabled) {
      r = amplify(r, amplifyMode, strength)
      g = amplify(g, amplifyMode, strength)
      b = amplify(b, amplifyMode, strength)
    }

    output[i] = r
    output[i + 1] = g
    output[i + 2] = b
    output[i + 3] = source[i + 3]
  }

  return new ImageData(output, raw.width, raw.height)
}
