export interface SoundParams {
  trimStart: number
  trimEnd: number
  fadeIn: number
  fadeOut: number
  volume: number
}

export interface CustomSound {
  id: string
  name: string
  mime: string
  duration: number
  createdAt: number
  params: SoundParams
  rawBlob: Blob
  processedBlob: Blob
}

export interface PresetSound {
  id: string
  path: string
}
