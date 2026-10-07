import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useBackendContext } from "~/components/providers/backend-provider"
import { useLocalModels } from "~/components/providers/local-models-provider"
import { usePreferences } from "~/components/providers/preferences-provider"
import type { CompareMode } from "~/components/previews/preview-canvas"
import { useIsTauri } from "~/hooks/useIsTauri"
import { baseName, toBlobUrl } from "~/lib/image-files"
import {
  PREVIEW_DEFAULTS,
  type PreviewPipelineNode,
  buildEditorConfig,
  buildPreprocessConfig,
  pickDefaultModel,
  sortModelsByPriority,
  suggestDotSize,
  suggestSsaaScale,
} from "~/lib/screentone-preview"
import { NodesContext } from "~/context/contexts"
import { isPipelineCancelled } from "~/hooks/useBackend"
import { CannyType, type DType, DotType, NodeType, type TilerType } from "~/types/enums"
import type { FolderReaderNodeOptions } from "~/types/options"
import { SMALL_IMAGE_HEIGHT, type SelectedImage, type Stage } from "./shared"

export function useScreentonePreview() {
  const { t } = useTranslation()
  const isTauri = useIsTauri()
  const { runPreviewPipeline, cancelPreviewPipeline, handleHardStop, busy, depsReady, canQueue } = useBackendContext()
  const { forceStopBackend } = usePreferences()
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
  const runIdRef = useRef(0)

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

  const backToPicker = () => {
    returnToSelection()
    if (selectedUrlRef.current) {
      URL.revokeObjectURL(selectedUrlRef.current)
      selectedUrlRef.current = null
    }
    setSelected(null)
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
    if (!selected || !model || !depsReady || !canQueue) return
    const runId = ++runIdRef.current
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
      if (runIdRef.current !== runId) return
      applyAfter(null)
      applyPreview(await loadOwnedUrl(prePath))
      setEditorInput(prePath)
      setCompareMode("single")
      setStage("editor")
    } catch (error) {
      if (runIdRef.current !== runId) return
      if (!isPipelineCancelled(error)) {
        toast.error(t("screentone-preview.error"), { description: String(error) })
      }
    } finally {
      if (runIdRef.current === runId) setPreprocessing(false)
    }
  }

  const cancelPreprocess = () => {
    if (!preprocessing) return
    if (forceStopBackend) {
      handleHardStop()
    } else {
      cancelPreviewPipeline()
    }
    setPreprocessing(false)
    toast.info(t("screentone-preview.cancelled"))
  }

  const performSkip = () => {
    if (!selected) return
    const skipped = suggestDotSize(Math.floor(selected.height / 4))
    setDotSize(skipped)
    setSsaaScale(suggestSsaaScale(skipped))
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

  return {
    // context
    isTauri,
    readerPath,
    depsReady,
    canQueue,
    // stage
    stage,
    setStage,
    selected,
    // model / pipeline params
    sortedModels,
    hasModels: localModels.length > 0,
    model,
    setModel,
    tiler,
    setTiler,
    tileSize,
    setTileSize,
    dtype,
    setDtype,
    // editor params
    canny,
    setCanny,
    cannyType,
    setCannyType,
    dotType,
    setDotType,
    angle,
    setAngle,
    dotSize,
    setDotSize,
    ssaaScale,
    setSsaaScale,
    disableAutoDot,
    setDisableAutoDot,
    // preview sources / compare
    previewSrc,
    afterSrc,
    compareMode,
    setCompareMode,
    // ui
    panelOpen,
    setPanelOpen,
    skipConfirmOpen,
    setSkipConfirmOpen,
    editorInput,
    // busy flags
    preprocessing,
    applying,
    interfaceBusy,
    controlsDisabled,
    autoDot,
    // actions
    selectPath,
    returnToSelection,
    backToPicker,
    runPreprocess,
    cancelPreprocess,
    requestSkip,
    performSkip,
    apply,
  }
}

export type ScreentonePreviewController = ReturnType<typeof useScreentonePreview>
