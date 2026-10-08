import type { SoundParams } from "~/types/sound"

let audioContext: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let playback: { ctxTime: number; offset: number; length: number } | null = null

const playbackListeners = new Set<() => void>()

function emitPlaybackChange(): void {
  for (const listener of playbackListeners) listener()
}

export function subscribePlayback(listener: () => void): () => void {
  playbackListeners.add(listener)
  return () => {
    playbackListeners.delete(listener)
  }
}

export function isPlaying(): boolean {
  return playback != null
}

function getAudioContext(): AudioContext {
  if (!audioContext) audioContext = new AudioContext()
  return audioContext
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getAudioContext()
  return await ctx.decodeAudioData(data.slice(0))
}

export interface PlayOptions {
  offset?: number
  length?: number
  gain?: number
  fadeIn?: number
  fadeOut?: number
  maxDuration?: number
}

export function getPlaybackTime(): number | null {
  if (!playback || !audioContext) return null
  const elapsed = audioContext.currentTime - playback.ctxTime
  if (elapsed < 0) return playback.offset
  if (elapsed > playback.length) return null
  return playback.offset + elapsed
}

export async function playBuffer(buffer: AudioBuffer, options: PlayOptions = {}): Promise<void> {
  const ctx = getAudioContext()
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => {})
  }
  stopSound()

  const offset = clamp(options.offset ?? 0, 0, buffer.duration)
  const remaining = Math.max(0, buffer.duration - offset)
  let length = clamp(options.length ?? remaining, 0, remaining)
  if (options.maxDuration && options.maxDuration > 0) {
    length = Math.min(length, options.maxDuration)
  }
  length = Math.max(0.001, length)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gain = ctx.createGain()
  source.connect(gain).connect(ctx.destination)

  const level = clamp(options.gain ?? 1, 0, 4)
  const startAt = ctx.currentTime
  const fadeIn = clamp(options.fadeIn ?? 0, 0, length)
  const fadeOut = clamp(options.fadeOut ?? 0, 0, length)
  if (fadeIn > 0) {
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(level, startAt + fadeIn)
  } else {
    gain.gain.setValueAtTime(level, startAt)
  }
  if (fadeOut > 0) {
    gain.gain.setValueAtTime(level, startAt + Math.max(fadeIn, length - fadeOut))
    gain.gain.linearRampToValueAtTime(0, startAt + length)
  }

  playback = { ctxTime: startAt, offset, length }
  emitPlaybackChange()
  await new Promise<void>((resolve) => {
    source.onended = () => {
      if (currentSource === source) currentSource = null
      if (playback?.ctxTime === startAt) {
        playback = null
        emitPlaybackChange()
      }
      resolve()
    }
    currentSource = source
    source.start(0, offset, length)
  })
}

export function stopSound(): void {
  const hadPlayback = playback != null
  playback = null
  if (currentSource) {
    const source = currentSource
    currentSource = null
    try {
      source.stop()
    } catch {
      // already stopped
    }
  }
  if (hadPlayback) emitPlaybackChange()
}

export async function playSound(blob: Blob, options: PlayOptions = {}): Promise<void> {
  const buffer = await decodeAudio(await blob.arrayBuffer())
  await playBuffer(buffer, options)
}

export async function renderProcessed(rawBlob: Blob, params: SoundParams): Promise<Blob> {
  const decoded = await decodeAudio(await rawBlob.arrayBuffer())
  const sampleRate = decoded.sampleRate
  const start = clamp(params.trimStart, 0, decoded.duration)
  const end = clamp(params.trimEnd, start, decoded.duration)
  const duration = Math.max(0, end - start)
  const length = Math.max(1, Math.round(duration * sampleRate))
  const offline = new OfflineAudioContext(Math.max(1, decoded.numberOfChannels), length, sampleRate)

  const source = offline.createBufferSource()
  source.buffer = decoded
  const gain = offline.createGain()
  const volume = clamp(params.volume, 0, 1)
  const fadeIn = clamp(params.fadeIn, 0, duration)
  const fadeOut = clamp(params.fadeOut, 0, duration)

  if (fadeIn > 0) {
    gain.gain.setValueAtTime(0, 0)
    gain.gain.linearRampToValueAtTime(volume, fadeIn)
  } else {
    gain.gain.setValueAtTime(volume, 0)
  }
  if (fadeOut > 0) {
    const fadeOutStart = Math.max(fadeIn, duration - fadeOut)
    gain.gain.setValueAtTime(volume, fadeOutStart)
    gain.gain.linearRampToValueAtTime(0, duration)
  }

  source.connect(gain).connect(offline.destination)
  source.start(0, start, duration)
  const rendered = await offline.startRendering()
  return encodeWav(rendered)
}

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const bufferArray = new ArrayBuffer(44 + dataSize)
  const view = new DataView(bufferArray)

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 8 * bytesPerSample, true)
  writeString(36, "data")
  view.setUint32(40, dataSize, true)

  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))

  let offset = 44
  for (let frame = 0; frame < numFrames; frame++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = clamp(channels[c][frame], -1, 1)
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([bufferArray], { type: "audio/wav" })
}

export interface Peaks {
  min: Float32Array
  max: Float32Array
}

export const FULL_PEAKS = 4096

export function computePeaks(buffer: AudioBuffer, buckets: number): Peaks {
  const count = Math.max(1, Math.floor(buckets))
  const min = new Float32Array(count)
  const max = new Float32Array(count)
  const channels = buffer.numberOfChannels
  const length = buffer.length
  const data: Float32Array[] = []
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c))

  const perBucket = length / count
  for (let i = 0; i < count; i++) {
    const startIdx = Math.floor(i * perBucket)
    const endIdx = Math.min(length, Math.floor((i + 1) * perBucket))
    if (startIdx >= endIdx) continue
    let lo = 0
    let hi = 0
    for (let s = startIdx; s < endIdx; s++) {
      let sample = 0
      for (let c = 0; c < channels; c++) sample += data[c][s]
      sample /= channels
      if (sample < lo) lo = sample
      if (sample > hi) hi = sample
    }
    min[i] = lo
    max[i] = hi
  }
  return { min, max }
}
