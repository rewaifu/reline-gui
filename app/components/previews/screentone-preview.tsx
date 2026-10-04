import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  IconArrowsHorizontal,
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconColumns,
  IconLoader2,
  IconPhoto,
  IconPlayerPlay,
} from "@tabler/icons-react"
import { NodesContext } from "~/context/contexts"
import { useBackendContext } from "~/components/providers/backend-provider"
import { useIsTauri } from "~/hooks/useIsTauri"
import { cn } from "~/lib/utils"
import { useLocalModels } from "~/components/providers/local-models-provider"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { NumberInput } from "~/components/ui/number-input"
import { Separator } from "~/components/ui/separator"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "~/components/ui/combobox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { CannyType, DType, DotType, NodeType, TilerType } from "~/types/enums"
import type { FolderReaderNodeOptions } from "~/types/options"
import {
  PREVIEW_DEFAULTS,
  buildEditorConfig,
  buildPreprocessConfig,
  modelBaseName,
  pickDefaultModel,
  sortModelsByPriority,
  suggestDotSize,
  suggestSsaaScale,
  type PreviewPipelineNode,
} from "~/lib/screentone-preview"
import { PreviewCanvas, type CompareMode } from "~/components/previews/preview-canvas"
import { ImagePicker } from "~/components/previews/image-picker"
import { baseName, toBlobUrl } from "~/lib/image-files"

const SMALL_IMAGE_HEIGHT = 3000

const AMBER_STYLE = { borderColor: "#f59e0b", color: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)" }

type Stage = "select" | "editor"

interface SelectedImage {
  path: string
  name: string
  url: string
  height: number
}

export function ScreentonePreview() {
  const { t } = useTranslation()
  const isTauri = useIsTauri()
  const { runPreviewPipeline, busy, depsReady } = useBackendContext()
  const nodes = useContext(NodesContext)
  const { localModels } = useLocalModels()

  const readerNode = nodes.find((node) => node.type === NodeType.FOLDER_READER)
  const readerPath = readerNode ? (readerNode.options as FolderReaderNodeOptions).path : ""

  const [stage, setStage] = useState<Stage>("select")
  const [selected, setSelected] = useState<SelectedImage | null>(null)

  const sortedModels = useMemo(() => sortModelsByPriority(localModels), [localModels])
  const [model, setModel] = useState<string | undefined>(undefined)
  const [tiler, setTiler] = useState<TilerType>(PREVIEW_DEFAULTS.tiler)
  const [tileSize, setTileSize] = useState<number>(PREVIEW_DEFAULTS.exactTilerSize)
  const [dtype, setDtype] = useState<DType>(PREVIEW_DEFAULTS.dtype)

  const [canny, setCanny] = useState(true)
  const [cannyType, setCannyType] = useState<CannyType>(CannyType.UNSHARP)
  const [dotType, setDotType] = useState<DotType>(DotType.CIRCLE)
  const [angle, setAngle] = useState<number>(PREVIEW_DEFAULTS.angle)
  const [dotSize, setDotSize] = useState(7)
  const [ssaaScale, setSsaaScale] = useState<number | undefined>(undefined)
  const [disableAutoDot, setDisableAutoDot] = useState(false)

  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [afterSrc, setAfterSrc] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState<CompareMode>("single")
  const [panelOpen, setPanelOpen] = useState(true)
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false)

  const [editorInput, setEditorInput] = useState<string | null>(null)
  const [preprocessing, setPreprocessing] = useState(false)
  const [applying, setApplying] = useState(false)

  const selectedUrlRef = useRef<string | null>(null)
  const previewOwnedRef = useRef<string | null>(null)
  const afterOwnedRef = useRef<string | null>(null)
  const tempDirRef = useRef<string | null>(null)

  const interfaceBusy = busy || preprocessing || applying
  const controlsDisabled = interfaceBusy || !depsReady
  const autoDot = !disableAutoDot && ssaaScale && ssaaScale > 1 ? Math.floor(dotSize * ssaaScale) : null

  useEffect(() => {
    if (localModels.length === 0) return
    if (!model || !localModels.includes(model)) {
      setModel(pickDefaultModel(localModels))
    }
  }, [localModels, model])

  useEffect(() => {
    return () => {
      if (selectedUrlRef.current) URL.revokeObjectURL(selectedUrlRef.current)
      if (previewOwnedRef.current) URL.revokeObjectURL(previewOwnedRef.current)
      if (afterOwnedRef.current) URL.revokeObjectURL(afterOwnedRef.current)
    }
  }, [])

  const loadImageHeight = (url: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image.naturalHeight)
      image.onerror = () => reject(new Error("image load failed"))
      image.src = url
    })
  }

  const applyPreview = (url: string | null, owned = true) => {
    if (previewOwnedRef.current) {
      URL.revokeObjectURL(previewOwnedRef.current)
      previewOwnedRef.current = null
    }
    if (url && owned) previewOwnedRef.current = url
    setPreviewSrc(url)
  }

  const applyAfter = (url: string | null) => {
    if (afterOwnedRef.current) {
      URL.revokeObjectURL(afterOwnedRef.current)
      afterOwnedRef.current = null
    }
    if (url) afterOwnedRef.current = url
    setAfterSrc(url)
  }

  const selectPath = async (path: string) => {
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs")
      const bytes = await readFile(path)
      const url = toBlobUrl(bytes, baseName(path))
      const height = await loadImageHeight(url)
      if (selectedUrlRef.current) URL.revokeObjectURL(selectedUrlRef.current)
      selectedUrlRef.current = url
      applyPreview(null)
      applyAfter(null)
      setCompareMode("single")
      setSelected({ path, name: baseName(path), url, height })

      const suggested = suggestDotSize(height)
      setDotSize(suggested)
      setSsaaScale(suggestSsaaScale(suggested))
      setCanny(true)
      setCannyType(CannyType.UNSHARP)
      setDotType(DotType.CIRCLE)
      setAngle(PREVIEW_DEFAULTS.angle)
      setDisableAutoDot(false)
    } catch (error) {
      console.error("Failed to read image:", error)
      toast.error(t("screentone-preview.load-error"))
    }
  }

  const returnToSelection = () => {
    if (previewOwnedRef.current) {
      URL.revokeObjectURL(previewOwnedRef.current)
      previewOwnedRef.current = null
    }
    if (afterOwnedRef.current) {
      URL.revokeObjectURL(afterOwnedRef.current)
      afterOwnedRef.current = null
    }
    setPreviewSrc(null)
    setAfterSrc(null)
    setEditorInput(null)
    setCompareMode("single")
    setStage("select")
  }

  const loadOwnedUrl = async (path: string) => {
    const { readFile } = await import("@tauri-apps/plugin-fs")
    const bytes = await readFile(path)
    return toBlobUrl(bytes, baseName(path))
  }

  const previewTempPath = async (name: string) => {
    const { tempDir, join } = await import("@tauri-apps/api/path")
    const baseDir = tempDirRef.current ?? (await tempDir())
    tempDirRef.current = baseDir
    return join(baseDir, name)
  }

  const runPipeline = async (config: PreviewPipelineNode[]) => {
    await runPreviewPipeline(config)
  }

  const runPreprocess = async () => {
    if (!selected || !model || controlsDisabled) return
    setPreprocessing(true)
    try {
      const prePath = await previewTempPath("reline_preview_pre.png")
      await runPipeline(
        buildPreprocessConfig({
          inputPath: selected.path,
          model,
          tiler,
          exactTilerSize: tileSize,
          dtype,
          outputPath: prePath,
        }),
      )
      applyAfter(null)
      applyPreview(await loadOwnedUrl(prePath))
      setEditorInput(prePath)
      setCompareMode("single")
      setStage("editor")
    } catch (error) {
      toast.error(t("screentone-preview.error"), { description: String(error) })
    } finally {
      setPreprocessing(false)
    }
  }

  const performSkip = () => {
    if (!selected) return
    applyAfter(null)
    applyPreview(selected.url, false)
    setEditorInput(selected.path)
    setCompareMode("single")
    setStage("editor")
  }

  const requestSkip = () => {
    if (!selected || interfaceBusy) return
    if (selected.height < SMALL_IMAGE_HEIGHT) {
      setSkipConfirmOpen(true)
      return
    }
    performSkip()
  }

  const apply = async () => {
    if (!editorInput || controlsDisabled) return
    setApplying(true)
    try {
      const outPath = await previewTempPath("reline_preview_out.png")
      await runPipeline(
        buildEditorConfig({
          inputPath: editorInput,
          outputPath: outPath,
          canny,
          cannyType,
          dotType,
          angle,
          dotSize,
          ssaaScale,
          disableAutoDot,
        }),
      )
      applyAfter(await loadOwnedUrl(outPath))
    } catch (error) {
      toast.error(t("screentone-preview.error"), { description: String(error) })
    } finally {
      setApplying(false)
    }
  }

  if (stage === "editor") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 rounded-xl border p-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={returnToSelection} disabled={applying}>
            <IconArrowLeft />
          </Button>
          <span className="truncate text-sm text-muted-foreground">{selected?.name}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {afterSrc && (
              <>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className={cn(compareMode === "single" && "ring-2 ring-primary")}
                  onClick={() => setCompareMode("single")}
                >
                  <IconPhoto />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className={cn(compareMode === "slider" && "ring-2 ring-primary")}
                  onClick={() => setCompareMode("slider")}
                >
                  <IconArrowsHorizontal />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className={cn(compareMode === "side" && "ring-2 ring-primary")}
                  onClick={() => setCompareMode("side")}
                >
                  <IconColumns />
                </Button>
              </>
            )}
          </div>
        </div>

        <PreviewCanvas previewSrc={previewSrc} beforeSrc={selected?.url ?? null} afterSrc={afterSrc} mode={compareMode} />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 select-none">
              <Checkbox id="screentone-preview-canny" checked={canny} onCheckedChange={(value) => setCanny(!!value)} />
              <Label htmlFor="screentone-preview-canny" className="cursor-pointer text-sm whitespace-nowrap">
                {t("screentone-preview.canny")}
              </Label>
            </div>
            <Select value={cannyType} onValueChange={(value) => setCannyType(value as CannyType)} disabled={!canny}>
              <SelectTrigger className="w-[180px] shrink-0">
                <SelectValue>{t(`nodes.sharp.canny-type-options.${cannyType}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.values(CannyType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`nodes.sharp.canny-type-options.${type}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={() => setPanelOpen((value) => !value)}
              title={t("screentone-preview.toggle-panel")}
            >
              {panelOpen ? <IconChevronUp /> : <IconChevronDown />}
            </Button>
          </div>

          {panelOpen && (
            <>
              <Separator />

              <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="flex-1">
                  <div className="flex flex-col gap-2">
                    <Label>{t("screentone-preview.dot-type")}</Label>
                    <Select value={dotType} onValueChange={(value) => setDotType(value as DotType)}>
                      <SelectTrigger className="w-full min-w-[180px]">
                        <SelectValue>{t(`nodes.screentone.dot-type-options.${dotType}`)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {Object.values(DotType).map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`nodes.screentone.dot-type-options.${type}`)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex-1">
                  <NumberInput
                    min={0}
                    max={360}
                    step={1}
                    labelText={t("screentone-preview.angle")}
                    value={angle}
                    onChange={(value) => setAngle(Math.trunc(value))}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex flex-col gap-2">
                    <Label>{t("screentone-preview.dot-size")}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="min-w-[100px]"
                        step="1"
                        min="0"
                        value={dotSize}
                        onChange={(event) => setDotSize(Number.parseInt(event.target.value) || 0)}
                      />
                      {autoDot !== null && <span className="text-sm text-muted-foreground tabular-nums">~{autoDot}</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t("screentone-preview.ssaa-scale")}</Label>
                  <Input
                    type="number"
                    className="w-[180px]"
                    step="0.1"
                    min="1"
                    value={ssaaScale ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value
                      if (raw === "") {
                        setSsaaScale(undefined)
                        return
                      }
                      const numeric = Number.parseFloat(raw)
                      setSsaaScale(Number.isFinite(numeric) && numeric > 1 ? numeric : undefined)
                    }}
                  />
                </div>
                <div className="flex h-8 items-center gap-2 select-none">
                  <Checkbox id="screentone-preview-auto-dot" checked={disableAutoDot} onCheckedChange={(value) => setDisableAutoDot(!!value)} />
                  <Label htmlFor="screentone-preview-auto-dot" className="cursor-pointer text-sm whitespace-nowrap">
                    {t("screentone-preview.auto-dot")}
                  </Label>
                </div>
              </div>

              <Button
                variant={applying ? "outline" : "default"}
                className={cn("w-full", applying && "disabled:opacity-100")}
                style={applying ? AMBER_STYLE : undefined}
                onClick={() => void apply()}
                disabled={!editorInput || controlsDisabled}
              >
                {applying ? <IconLoader2 className="animate-spin" /> : <IconPlayerPlay />}
                {applying ? t("screentone-preview.processing") : t("screentone-preview.apply")}
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (!selected) {
    return <ImagePicker isTauri={isTauri} folderPath={readerPath} onPickPath={(path) => void selectPath(path)} />
  }

  return (
    <div className="flex h-full min-h-0 gap-3 rounded-xl border p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-1 min-h-0 overflow-y-auto">
          <div className="m-auto flex w-full max-w-md flex-col items-center gap-4 py-2">
            <img src={selected.url} alt={selected.name} className="max-h-48 max-w-full rounded-lg border object-contain" />
            <p className="max-w-full truncate text-sm font-medium">{selected.name}</p>

            <div className="flex w-full max-w-md flex-col gap-1.5">
              <Label>{t("screentone-preview.select-model")}</Label>
              <ModelsPicker
                items={sortedModels}
                value={model}
                onChange={setModel}
                disabled={localModels.length === 0}
                placeholder={t("screentone-preview.select-model")}
              />
              {localModels.length === 0 && <p className="text-xs text-destructive">{t("screentone-preview.no-models")}</p>}
            </div>

            <div className="flex w-full max-w-md flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 flex flex-col gap-2">
                <Label>{t("screentone-preview.tiler")}</Label>
                <Select value={tiler} onValueChange={(value) => setTiler(value as TilerType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{t(`nodes.upscale.tiler-options.${tiler}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.values(TilerType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`nodes.upscale.tiler-options.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {tiler === TilerType.EXACT && (
                <div className="flex-1 flex flex-col gap-2">
                  <Label>{t("screentone-preview.tile-size")}</Label>
                  <Input
                    type="number"
                    step={100}
                    min={0}
                    value={tileSize}
                    onChange={(event) => setTileSize(Number.parseInt(event.target.value) || 0)}
                  />
                </div>
              )}
              <div className="flex-1 flex flex-col gap-2">
                <Label>{t("screentone-preview.dtype")}</Label>
                <Select value={dtype} onValueChange={(value) => setDtype(value as DType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.values(DType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex w-full max-w-md flex-col gap-2">
              <Button
                variant={preprocessing ? "outline" : "default"}
                className={cn(preprocessing && "disabled:opacity-100")}
                style={preprocessing ? AMBER_STYLE : undefined}
                onClick={() => void runPreprocess()}
                disabled={!model || controlsDisabled}
              >
                {preprocessing ? <IconLoader2 className="animate-spin" /> : <IconPlayerPlay />}
                {preprocessing ? t("screentone-preview.processing") : t("screentone-preview.run")}
              </Button>
              <Button variant="secondary" onClick={requestSkip} disabled={interfaceBusy}>
                {t("screentone-preview.skip")}
              </Button>
              {!depsReady && <p className="text-center text-xs text-muted-foreground">{t("screentone-preview.no-deps")}</p>}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={skipConfirmOpen} onOpenChange={setSkipConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("screentone-preview.skip-confirm-title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("screentone-preview.skip-confirm-desc", { height: SMALL_IMAGE_HEIGHT })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("screentone-preview.skip-confirm-cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSkipConfirmOpen(false)
                performSkip()
              }}
            >
              {t("screentone-preview.skip-confirm-confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ModelsPicker({
  items,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  items: string[]
  value?: string
  onChange: (value: string | undefined) => void
  disabled?: boolean
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState(value ?? "")

  useEffect(() => {
    setInputValue(value ?? "")
  }, [value])

  return (
    <Combobox
      items={items}
      value={value ?? null}
      inputValue={inputValue}
      onInputValueChange={(next) => setInputValue(next)}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next)
      }}
    >
      <ComboboxInput placeholder={placeholder} showTrigger disabled={disabled} renderValue={modelBaseName} />
      <ComboboxContent>
        <ComboboxEmpty>{t("nodes.upscale.no-models-found")}</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {modelBaseName(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
