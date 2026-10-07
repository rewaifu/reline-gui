import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { IconMusic, IconPencil, IconPlayerPlay, IconPlayerStop, IconTrash, IconUpload, IconVolume } from "@tabler/icons-react"
import { Button } from "~/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area"
import { Slider } from "~/components/ui/slider"
import { useSoundPreferences } from "~/components/providers/preferences-provider"
import { Waveform } from "~/components/settings/sound/waveform"
import { VerticalSlider } from "~/components/settings/sound/vertical-slider"
import { decodeAudio, playBuffer, playSound, renderProcessed, stopSound } from "~/lib/audio"
import {
  PRESET_SOUNDS,
  customSoundId,
  customSoundRef,
  defaultSoundParams,
  deleteCustomSound,
  isCustomSoundRef,
  listCustomSounds,
  putCustomSound,
} from "~/lib/sound-store"
import { cn } from "~/lib/utils"
import type { CustomSound, SoundParams } from "~/types/sound"

interface EditorDraft {
  id: string
  name: string
  params: SoundParams
}

interface ViewWindow {
  start: number
  end: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatTime(seconds: number): string {
  const total = Math.max(0, seconds)
  const minutes = Math.floor(total / 60)
  const rest = total - minutes * 60
  return `${minutes}:${rest.toFixed(2).padStart(5, "0")}`
}

function paramsEqual(a: SoundParams, b: SoundParams): boolean {
  return a.trimStart === b.trimStart && a.trimEnd === b.trimEnd && a.fadeIn === b.fadeIn && a.fadeOut === b.fadeOut && a.volume === b.volume
}

const PREVIEW_WINDOW = 1

export function SoundTab() {
  const { t } = useTranslation()
  const {
    completionSound,
    setCompletionSound,
    maxSoundDuration,
    setMaxSoundDuration,
    maxSoundDurationEnabled,
    setMaxSoundDurationEnabled,
    soundVolume,
  } = useSoundPreferences()

  const [sounds, setSounds] = useState<CustomSound[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditorDraft | null>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [view, setView] = useState<ViewWindow>({ start: 0, end: 1 })
  const [previewing, setPreviewing] = useState(false)
  const [trimPlaying, setTrimPlaying] = useState(false)
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [maxDurationLocal, setMaxDurationLocal] = useState(String(maxSoundDuration))

  const fileInputRef = useRef<HTMLInputElement>(null)
  const playTokenRef = useRef(0)
  const draftRef = useRef<EditorDraft | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const lastCommittedTrimRef = useRef({ start: 0, end: 0 })
  draftRef.current = draft
  bufferRef.current = buffer

  useEffect(() => {
    let cancelled = false
    listCustomSounds()
      .then((list) => {
        if (!cancelled) setSounds(list)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setMaxDurationLocal(String(maxSoundDuration))
  }, [maxSoundDuration])

  useEffect(() => {
    return () => {
      stopSound()
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    if (isCustomSoundRef(completionSound) && !sounds.some((sound) => sound.id === customSoundId(completionSound))) {
      setCompletionSound(PRESET_SOUNDS[0].path)
    }
  }, [loaded, sounds, completionSound, setCompletionSound])

  const capDuration = useCallback(() => (maxSoundDurationEnabled ? maxSoundDuration : 0), [maxSoundDurationEnabled, maxSoundDuration])

  const stopPlayback = useCallback(() => {
    playTokenRef.current += 1
    stopSound()
    setPreviewing(false)
    setTrimPlaying(false)
    setPlayingKey(null)
  }, [])

  const activeSound = draft ? (sounds.find((sound) => sound.id === draft.id) ?? null) : null
  const editorDuration = buffer?.duration ?? activeSound?.duration ?? 1
  const dirty = !!draft && !!activeSound && (draft.name !== activeSound.name || !paramsEqual(draft.params, activeSound.params))
  const trimmedLength = draft ? Math.max(0, draft.params.trimEnd - draft.params.trimStart) : 0

  const runPlay = useCallback(async (key: string, play: () => Promise<void>, editor = false) => {
    const token = ++playTokenRef.current
    setPreviewing(false)
    setTrimPlaying(false)
    setPlayingKey(null)
    if (editor) setPreviewing(true)
    else setPlayingKey(key)
    try {
      await play()
    } catch {
      // ignore playback errors
    }
    if (token !== playTokenRef.current) return
    if (editor) setPreviewing(false)
    else setPlayingKey(null)
  }, [])

  const commitTrimPreview = useCallback(
    (kind: "start" | "end") => {
      const current = draftRef.current
      const audio = bufferRef.current
      if (!current || !audio) return
      const { trimStart, trimEnd, volume, fadeIn, fadeOut } = current.params
      const span = Math.max(0, trimEnd - trimStart)
      const length = Math.min(PREVIEW_WINDOW, span)
      if (length <= 0) return
      const offset = kind === "start" ? trimStart : Math.max(trimStart, trimEnd - PREVIEW_WINDOW)
      const token = ++playTokenRef.current
      setPreviewing(false)
      setPlayingKey(null)
      setTrimPlaying(true)
      void playBuffer(audio, { offset, length, gain: volume * soundVolume, fadeIn, fadeOut, maxDuration: capDuration() })
        .catch(() => {})
        .finally(() => {
          if (token === playTokenRef.current) setTrimPlaying(false)
        })
      lastCommittedTrimRef.current = { start: trimStart, end: trimEnd }
    },
    [capDuration, soundVolume],
  )

  const handleTrimChange = useCallback((start: number, end: number) => {
    const current = draftRef.current
    if (!current) return
    setDraft({ ...current, params: { ...current.params, trimStart: start, trimEnd: end } })
  }, [])

  const handleSliderCommit = useCallback(
    (value: number | readonly number[]) => {
      const range = Array.isArray(value) ? value : [value]
      const previous = lastCommittedTrimRef.current
      const start = range[0]
      const end = range[1] ?? previous.end
      const which = start !== previous.start ? "start" : end !== previous.end ? "end" : null
      if (which) commitTrimPreview(which)
    },
    [commitTrimPreview],
  )

  const handleAddFile = async (file: File) => {
    try {
      const decoded = await decodeAudio(await file.arrayBuffer())
      const params = defaultSoundParams(decoded.duration)
      const processedBlob = await renderProcessed(file, params)
      const id = crypto.randomUUID()
      const record: CustomSound = {
        id,
        name: file.name.replace(/\.[^.]+$/, "") || t("backend.sound.untitled"),
        mime: file.type || "audio/mpeg",
        duration: decoded.duration,
        createdAt: Date.now(),
        params,
        rawBlob: file,
        processedBlob,
      }
      await putCustomSound(record)
      setSounds((prev) => [...prev, record])
      setCompletionSound(customSoundRef(id))
      setEditingId(id)
      setDraft({ id, name: record.name, params })
      setBuffer(decoded)
      setView({ start: 0, end: decoded.duration })
      lastCommittedTrimRef.current = { start: params.trimStart, end: params.trimEnd }
    } catch {
      toast.error(t("backend.sound.uploadFailed"))
    }
  }

  const startEdit = async (sound: CustomSound) => {
    stopPlayback()
    setEditingId(sound.id)
    setDraft({ id: sound.id, name: sound.name, params: { ...sound.params } })
    setBuffer(null)
    setView({ start: 0, end: sound.duration })
    lastCommittedTrimRef.current = { start: sound.params.trimStart, end: sound.params.trimEnd }
    try {
      const decoded = await decodeAudio(await sound.rawBlob.arrayBuffer())
      setBuffer(decoded)
      setView({ start: 0, end: decoded.duration })
    } catch {
      toast.error(t("backend.sound.decodeFailed"))
    }
  }

  const closeEditor = () => {
    stopPlayback()
    setEditingId(null)
    setDraft(null)
    setBuffer(null)
  }

  const handleDelete = async (sound: CustomSound) => {
    await deleteCustomSound(sound.id).catch(() => {})
    setSounds((prev) => prev.filter((item) => item.id !== sound.id))
    if (editingId === sound.id) closeEditor()
    if (completionSound === customSoundRef(sound.id)) setCompletionSound(PRESET_SOUNDS[0].path)
  }

  const handleApply = async () => {
    if (!draft || !activeSound) return
    const clampedEnd = clamp(draft.params.trimEnd, 0, activeSound.duration)
    const clampedStart = clamp(draft.params.trimStart, 0, clampedEnd)
    const params: SoundParams = {
      trimStart: clampedStart,
      trimEnd: clampedEnd,
      fadeIn: clamp(draft.params.fadeIn, 0, Math.max(0, clampedEnd - clampedStart)),
      fadeOut: clamp(draft.params.fadeOut, 0, Math.max(0, clampedEnd - clampedStart)),
      volume: clamp(draft.params.volume, 0, 1),
    }
    try {
      const processedBlob = await renderProcessed(activeSound.rawBlob, params)
      const updated: CustomSound = { ...activeSound, name: draft.name.trim() || activeSound.name, params, processedBlob }
      await putCustomSound(updated)
      setSounds((prev) => prev.map((sound) => (sound.id === updated.id ? updated : sound)))
      setDraft({ id: updated.id, name: updated.name, params })
      lastCommittedTrimRef.current = { start: params.trimStart, end: params.trimEnd }
    } catch {
      toast.error(t("backend.sound.processFailed"))
    }
  }

  const handleEditorPreview = () => {
    if (previewing) {
      stopPlayback()
      return
    }
    if (!draft || !buffer) return
    const { trimStart, trimEnd, volume, fadeIn, fadeOut } = draft.params
    const length = Math.max(0, trimEnd - trimStart)
    if (length <= 0) return
    void runPlay(
      "editor",
      async () => {
        await playBuffer(buffer, {
          offset: trimStart,
          length,
          gain: volume * soundVolume,
          fadeIn,
          fadeOut,
          maxDuration: capDuration(),
        })
      },
      true,
    )
  }

  const previewRef = (ref: string) => {
    if (playingKey === ref) {
      stopPlayback()
      return
    }
    void runPlay(ref, async () => {
      if (isCustomSoundRef(ref)) {
        const sound = sounds.find((item) => item.id === customSoundId(ref))
        if (!sound) return
        await playSound(sound.processedBlob, { gain: soundVolume, maxDuration: capDuration() })
      } else {
        const response = await fetch(ref)
        await playSound(await response.blob(), { gain: soundVolume, maxDuration: capDuration() })
      }
    })
  }

  const commitMaxDuration = () => {
    const parsed = Number.parseInt(maxDurationLocal)
    const clamped = Number.isFinite(parsed) ? clamp(parsed, 1, 30) : maxSoundDuration
    setMaxDurationLocal(String(clamped))
    if (clamped !== maxSoundDuration) setMaxSoundDuration(clamped)
  }

  return (
    <ScrollArea
      className="relative min-h-0 flex-1
                 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-4
                 before:bg-linear-to-b/oklab before:from-background before:to-background/0 before:opacity-0 before:transition-opacity before:content-['']
                 data-[overflow-y-start]:before:opacity-100
                 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-10 after:h-4
                 after:bg-linear-to-t/oklab after:from-background after:to-background/0 after:opacity-0 after:transition-opacity after:content-['']
                 data-[overflow-y-end]:after:opacity-100"
    >
      <div className="flex flex-col gap-5 pb-3">
        <Card>
          <CardHeader className="select-none">
            <CardTitle>{t("backend.sound.playbackTitle")}</CardTitle>
            <CardDescription>{t("backend.sound.maxDurationDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sound-limit-duration"
                checked={maxSoundDurationEnabled}
                onCheckedChange={(checked) => setMaxSoundDurationEnabled(!!checked)}
              />
              <Label htmlFor="sound-limit-duration">{t("backend.sound.limitDuration")}</Label>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sound-max-duration">{t("backend.sound.maxDuration")}</Label>
              <Input
                id="sound-max-duration"
                type="number"
                min={1}
                max={30}
                step={1}
                className="w-[240px]"
                disabled={!maxSoundDurationEnabled}
                value={maxDurationLocal}
                onChange={(event) => setMaxDurationLocal(event.target.value)}
                onBlur={commitMaxDuration}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitMaxDuration()
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="select-none">
            <CardTitle>{t("backend.sound.selectionTitle")}</CardTitle>
            <CardDescription>{t("backend.sound.selectionDesc")}</CardDescription>
            <CardAction>
              <Button variant="outline" size="xs" onClick={() => fileInputRef.current?.click()}>
                <IconUpload className="size-3.5" />
                {t("backend.sound.add")}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {PRESET_SOUNDS.map((preset) => {
              const active = completionSound === preset.path
              return (
                <div
                  key={preset.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                    active ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => setCompletionSound(preset.path)}>
                    <span className={cn("size-3 shrink-0 rounded-full border", active ? "border-primary bg-primary" : "border-muted-foreground")} />
                    <IconMusic className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm">{t(`backend.sound.presets.${preset.id}`)}</span>
                  </button>
                  <Button variant="ghost" size="icon-sm" onClick={() => previewRef(preset.path)} aria-label={t("backend.sound.preview")}>
                    {playingKey === preset.path ? <IconPlayerStop /> : <IconPlayerPlay />}
                  </Button>
                </div>
              )
            })}

            {sounds.map((sound) => {
              const ref = customSoundRef(sound.id)
              const active = completionSound === ref
              return (
                <div
                  key={sound.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                    active ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => setCompletionSound(ref)}>
                    <span className={cn("size-3 shrink-0 rounded-full border", active ? "border-primary bg-primary" : "border-muted-foreground")} />
                    <IconVolume className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{sound.name}</span>
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatTime(Math.max(0, sound.params.trimEnd - sound.params.trimStart))}
                    </span>
                  </button>
                  <Button variant="ghost" size="icon-sm" onClick={() => previewRef(ref)} aria-label={t("backend.sound.preview")}>
                    {playingKey === ref ? <IconPlayerStop /> : <IconPlayerPlay />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => void startEdit(sound)} aria-label={t("backend.sound.edit")}>
                    <IconPencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => void handleDelete(sound)} aria-label={t("backend.sound.delete")}>
                    <IconTrash />
                  </Button>
                </div>
              )
            })}

            {loaded && sounds.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t("backend.sound.empty")}</p>}
          </CardContent>
        </Card>

        {draft && activeSound && (
          <Card>
            <CardHeader className="select-none">
              <CardTitle>{t("backend.sound.editorTitle")}</CardTitle>
              <CardDescription>{t("backend.sound.editorDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="sound-name">{t("backend.sound.name")}</Label>
                <Input
                  id="sound-name"
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                />
              </div>

              <div className="flex items-stretch gap-3">
                <div className="min-w-0 flex-1">
                  {buffer ? (
                    <Waveform
                      buffer={buffer}
                      duration={editorDuration}
                      trimStart={draft.params.trimStart}
                      trimEnd={draft.params.trimEnd}
                      viewStart={view.start}
                      viewEnd={view.end}
                      onViewChange={(start, end) => setView({ start, end })}
                      onTrimChange={handleTrimChange}
                      onTrimCommit={commitTrimPreview}
                      playing={previewing || trimPlaying}
                    />
                  ) : (
                    <div className="h-24 w-full animate-pulse rounded-xl border bg-muted" />
                  )}
                </div>
                <div className="flex h-24 items-center gap-2">
                  <VerticalSlider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[draft.params.volume]}
                    onValueChange={(value) => {
                      const next = Array.isArray(value) ? value[0] : value
                      setDraft((prev) => (prev ? { ...prev, params: { ...prev.params, volume: next } } : prev))
                    }}
                  />
                  <span className="w-10 text-xs tabular-nums text-muted-foreground">{Math.round(draft.params.volume * 100)}%</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t("backend.sound.waveformHint")}</p>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                  <span>{formatTime(draft.params.trimStart)}</span>
                  <span>{formatTime(draft.params.trimEnd)}</span>
                </div>
                <Slider
                  min={0}
                  max={editorDuration}
                  step={0.01}
                  value={[draft.params.trimStart, draft.params.trimEnd]}
                  onValueChange={(value) => {
                    const range = Array.isArray(value) ? value : [value]
                    handleTrimChange(range[0], range[1] ?? draft.params.trimEnd)
                  }}
                  onValueCommitted={handleSliderCommit}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-muted-foreground">
                    {t("backend.sound.fadeIn")}: <span className="tabular-nums">{draft.params.fadeIn.toFixed(2)}s</span>
                  </Label>
                  <Slider
                    min={0}
                    max={Math.max(0.01, trimmedLength)}
                    step={0.01}
                    value={[draft.params.fadeIn]}
                    onValueChange={(value) => {
                      const next = Array.isArray(value) ? value[0] : value
                      setDraft((prev) => (prev ? { ...prev, params: { ...prev.params, fadeIn: next } } : prev))
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-muted-foreground">
                    {t("backend.sound.fadeOut")}: <span className="tabular-nums">{draft.params.fadeOut.toFixed(2)}s</span>
                  </Label>
                  <Slider
                    min={0}
                    max={Math.max(0.01, trimmedLength)}
                    step={0.01}
                    value={[draft.params.fadeOut]}
                    onValueChange={(value) => {
                      const next = Array.isArray(value) ? value[0] : value
                      setDraft((prev) => (prev ? { ...prev, params: { ...prev.params, fadeOut: next } } : prev))
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleEditorPreview}>
                  {previewing ? <IconPlayerStop /> : <IconPlayerPlay />}
                  {t("backend.sound.preview")}
                </Button>
                <Button size="sm" disabled={!dirty} onClick={() => void handleApply()}>
                  {t("backend.sound.apply")}
                </Button>
                <Button variant="ghost" size="sm" onClick={closeEditor}>
                  {t("backend.sound.cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleAddFile(file)
            event.target.value = ""
          }}
        />
      </div>
      <ScrollBar className="-mr-3 z-20" />
    </ScrollArea>
  )
}
