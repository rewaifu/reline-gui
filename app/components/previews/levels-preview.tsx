import { type PointerEvent as ReactPointerEvent, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { IconArrowsExchange } from "@tabler/icons-react"
import { NodesContext, NodesDispatchContext } from "~/context/contexts"
import { useIsTauri } from "~/hooks/useIsTauri"
import { cn } from "~/lib/utils"
import { NumberInput } from "~/components/ui/number-input"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Slider } from "~/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Label } from "~/components/ui/label"
import { ImagePicker } from "~/components/previews/image-picker"
import { NodesActionType } from "~/types/actions"
import { NodeType } from "~/types/enums"
import type { FolderReaderNodeOptions, LevelNodeOptions } from "~/types/options"
import { AMPLIFY_DEFAULT, AMPLIFY_MAX, AMPLIFY_MIN, MAX_PROCESS_SIDE, type AmplifyMode, processImageData } from "~/lib/levels"
import { baseName, toBlobUrl } from "~/lib/image-files"
import { useCanvasViewport } from "./use-canvas-viewport"

const CANVAS_BUTTON_STYLE = { backgroundColor: "var(--secondary)", color: "var(--secondary-foreground)" }

export function LevelsPreview() {
  const { t } = useTranslation()
  const isTauri = useIsTauri()
  const nodes = useContext(NodesContext)
  const dispatch = useContext(NodesDispatchContext)

  const readerNode = nodes.find((node) => node.type === NodeType.FOLDER_READER)
  const readerPath = readerNode ? (readerNode.options as FolderReaderNodeOptions).path : ""
  const levelNode = nodes.find((node) => node.type === NodeType.LEVEL)

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageName, setImageName] = useState<string | null>(null)
  const [rawData, setRawData] = useState<ImageData | null>(null)

  const [grayscale, setGrayscale] = useState(false)
  const [amplifyEnabled, setAmplifyEnabled] = useState(false)
  const [amplifyMode, setAmplifyMode] = useState<AmplifyMode>("darks")
  const [strength, setStrength] = useState(AMPLIFY_DEFAULT)

  const [lowInput, setLowInput] = useState(0)
  const [highInput, setHighInput] = useState(255)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const selectedUrlRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)

  const contentSize = useMemo(() => (rawData ? { width: rawData.width, height: rawData.height } : null), [rawData])
  const { containerRef, view, beginPan, movePan, endPan } = useCanvasViewport({ contentSize, refitOnResize: true })

  const selectImage = useCallback((url: string, name: string) => {
    if (selectedUrlRef.current) URL.revokeObjectURL(selectedUrlRef.current)
    selectedUrlRef.current = url
    setImageSrc(url)
    setImageName(name)
  }, [])

  const returnToSelection = useCallback(() => {
    if (selectedUrlRef.current) URL.revokeObjectURL(selectedUrlRef.current)
    selectedUrlRef.current = null
    setImageSrc(null)
    setImageName(null)
  }, [])

  const loadFromFile = useCallback(
    (file?: File) => {
      if (!file) return
      if (!file.type.startsWith("image/")) {
        toast.error(t("levels-preview.not-image"))
        return
      }
      selectImage(URL.createObjectURL(file), file.name)
    },
    [selectImage, t],
  )

  const loadFromPath = useCallback(
    async (path: string) => {
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs")
        const bytes = await readFile(path)
        selectImage(toBlobUrl(bytes, baseName(path)), baseName(path))
      } catch (error) {
        console.error("Failed to read image:", error)
        toast.error(t("levels-preview.read-error"))
      }
    },
    [selectImage, t],
  )

  useEffect(() => {
    return () => {
      if (selectedUrlRef.current) URL.revokeObjectURL(selectedUrlRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    if (!imageSrc) {
      setRawData(null)
      return
    }

    let cancelled = false
    const image = new Image()

    image.onload = () => {
      if (cancelled) return
      const maxSide = Math.max(image.naturalWidth, image.naturalHeight)
      const scale = maxSide > MAX_PROCESS_SIDE ? MAX_PROCESS_SIDE / maxSide : 1
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const offscreen = document.createElement("canvas")
      offscreen.width = width
      offscreen.height = height
      const context = offscreen.getContext("2d", { willReadFrequently: true })
      if (!context) return
      context.drawImage(image, 0, 0, width, height)
      setRawData(context.getImageData(0, 0, width, height))
    }

    image.onerror = () => {
      if (!cancelled) setRawData(null)
    }

    image.src = imageSrc

    return () => {
      cancelled = true
    }
  }, [imageSrc])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!rawData || !canvas) return

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      canvas.width = rawData.width
      canvas.height = rawData.height
      const context = canvas.getContext("2d")
      if (!context) return
      const processed = processImageData(rawData, {
        lowInput,
        highInput,
        grayscale,
        amplifyEnabled,
        amplifyMode,
        strength,
      })
      context.putImageData(processed, 0, 0)
    })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [rawData, lowInput, highInput, grayscale, amplifyEnabled, amplifyMode, strength])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest("button")) return
    beginPan(event)
  }

  const applyToLevelNode = () => {
    if (!levelNode) return
    dispatch({
      type: NodesActionType.CHANGE,
      payload: {
        ...levelNode,
        options: {
          ...(levelNode.options as LevelNodeOptions),
          low_input: Math.trunc(lowInput),
          high_input: Math.trunc(highInput),
        },
      },
    })
    toast.success(t("levels-preview.applied"))
  }

  if (!imageSrc) {
    return <ImagePicker isTauri={isTauri} folderPath={readerPath} onPickPath={(path) => void loadFromPath(path)} onPickFile={loadFromFile} />
  }

  return (
    <div className="flex h-full min-h-0 gap-3 rounded-xl border p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
            <div className="flex items-center gap-2 select-none">
              <Checkbox id="levels-preview-amplify" checked={amplifyEnabled} onCheckedChange={(value) => setAmplifyEnabled(!!value)} />
              <Label htmlFor="levels-preview-amplify" className="cursor-pointer text-sm">
                {t("levels-preview.amplify")}
              </Label>
            </div>

            <Select value={amplifyMode} onValueChange={(value) => setAmplifyMode(value as AmplifyMode)} disabled={!amplifyEnabled}>
              <SelectTrigger size="sm" className="min-w-36">
                <SelectValue>{t(`levels-preview.mode-${amplifyMode}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="darks">{t("levels-preview.mode-darks")}</SelectItem>
                <SelectItem value="lights">{t("levels-preview.mode-lights")}</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex min-w-32 flex-1 items-center gap-2">
              <span className="text-xs whitespace-nowrap text-muted-foreground">{t("levels-preview.strength")}</span>
              <Slider
                min={AMPLIFY_MIN}
                max={AMPLIFY_MAX}
                step={1}
                value={[strength]}
                disabled={!amplifyEnabled}
                onValueChange={(value) => setStrength(Array.isArray(value) ? value[0] : value)}
              />
              <span className="w-9 text-right text-xs tabular-nums">{strength}</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" onClick={returnToSelection}>
                <IconArrowsExchange />
              </Button>
            </div>
          </div>

          <div
            ref={containerRef}
            className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden rounded-lg border bg-muted/30 active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
            <canvas
              ref={canvasRef}
              className="absolute left-0 top-0 origin-top-left"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                imageRendering: view.scale > 2 ? "pixelated" : "auto",
              }}
            />
            <Button
              variant="outline"
              size="sm"
              style={CANVAS_BUTTON_STYLE}
              className={cn("absolute left-2 top-2 z-10", grayscale && "ring-2 ring-primary")}
              onClick={() => setGrayscale((value) => !value)}
            >
              {t("levels-preview.grayscale")}
            </Button>
            {levelNode && (
              <Button variant="outline" size="sm" style={CANVAS_BUTTON_STYLE} className="absolute bottom-2 right-2 z-10" onClick={applyToLevelNode}>
                {t("levels-preview.apply-to-node", { node: t("nodes.node-type-options.level") })}
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-3 pl-1 md:flex-row">
            <div className="flex-1">
              <NumberInput
                min={0}
                max={255}
                step={1}
                labelText={t("nodes.level.low-input")}
                value={lowInput}
                onChange={(value) => setLowInput(Math.trunc(value))}
              />
            </div>
            <div className="flex-1">
              <NumberInput
                min={0}
                max={255}
                step={1}
                labelText={t("nodes.level.high-input")}
                value={highInput}
                onChange={(value) => setHighInput(Math.trunc(value))}
              />
            </div>
          </div>
        </>
      </div>
    </div>
  )
}
