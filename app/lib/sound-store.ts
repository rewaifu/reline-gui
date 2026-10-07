import type { CustomSound, PresetSound, SoundParams } from "~/types/sound"

const DB_NAME = "reline-sounds"
const DB_VERSION = 1
const STORE_NAME = "sounds"
const CUSTOM_SOUND_PREFIX = "custom:"

export const PRESET_SOUNDS: PresetSound[] = [
  { id: "fart", path: "/fart.mp3" },
  { id: "boop", path: "/boop.mp3" },
]

export const DEFAULT_COMPLETION_SOUND = PRESET_SOUNDS[0].path

export function customSoundRef(id: string): string {
  return `${CUSTOM_SOUND_PREFIX}${id}`
}

export function isCustomSoundRef(ref: string): boolean {
  return ref.startsWith(CUSTOM_SOUND_PREFIX)
}

export function customSoundId(ref: string): string {
  return ref.slice(CUSTOM_SOUND_PREFIX.length)
}

export function defaultSoundParams(duration: number): SoundParams {
  return { trimStart: 0, trimEnd: duration, fadeIn: 0, fadeOut: 0, volume: 1 }
}

function normalizeSound(record: CustomSound): CustomSound {
  return { ...record, params: { ...defaultSoundParams(record.duration), ...record.params } }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const request = run(tx.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listCustomSounds(): Promise<CustomSound[]> {
  const all = await withStore<CustomSound[]>("readonly", (store) => store.getAll())
  return all.map(normalizeSound).sort((a, b) => a.createdAt - b.createdAt)
}

export async function getCustomSound(id: string): Promise<CustomSound | null> {
  const record = await withStore<CustomSound | undefined>("readonly", (store) => store.get(id))
  return record ? normalizeSound(record) : null
}

export async function putCustomSound(record: CustomSound): Promise<void> {
  await withStore("readwrite", (store) => store.put(record))
}

export async function deleteCustomSound(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id))
}

export async function resolveSoundBlob(ref: string): Promise<Blob | null> {
  if (!isCustomSoundRef(ref)) return null
  const record = await getCustomSound(customSoundId(ref))
  if (!record) return null
  return record.processedBlob ?? record.rawBlob
}
