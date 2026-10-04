import {
  IconBrandDiscordFilled,
  IconBrandGithub,
  IconDownload,
  IconExternalLink,
  IconFolder,
  IconLoader2,
  IconPlayerPlay,
  IconPlayerStop,
  IconSettings,
} from "@tabler/icons-react"
import { useContext, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useBackendContext } from "~/components/providers/backend-provider"
import { ServerPopover } from "~/components/layout/server-popover"
import { useModelDownloads } from "~/components/providers/model-downloads-provider"
import { useSettings } from "~/components/providers/settings-provider"
import { ModelDownloaderDialog } from "~/components/models/model-downloader-dialog"
import { DocumentationDialog } from "~/components/docs/documentation-dialog.tsx"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Progress } from "~/components/ui/progress"
import { NodesContext } from "~/context/contexts"
import { useMediaQuery } from "~/hooks/useMediaQuery"
import { CollabLogo } from "~/svg/collab"
import { NodeType } from "~/types/enums"
import type { FolderWriterNodeOptions } from "~/types/options"

const GRAY = "#6b7280"

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—"
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem.toString().padStart(2, "0")}s`
}

export function FooterBar() {
  const { t } = useTranslation()
  const { openSettings } = useSettings()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const colab = isDesktop ? t("home-page.collab") : t("home-page.collab").split(" (")[0]

  return (
    <footer className="flex h-10 bg-card rounded-xl ring-1 ring-foreground/10 p-2 md:px-5 mb-3 md:mb-5 mx-3 md:mx-5 justify-around md:justify-between mt-1 md:mt-0">
      <div className="flex flex-row gap-2 items-center">
        <h1 className="hidden md:flex text-sm font-semibold tracking-tight select-none">{t("home-page.use-in")}</h1>
        <a href="https://colab.research.google.com/drive/1-ijaR4Ld_CUkEMb-l2Cbf918TCQOp8D9" target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm">
            <CollabLogo />
            <div />
            {colab}
          </Button>
        </a>
        <a href="https://github.com/rewaifu/reline_local" target="_blank" className="hidden md:flex" rel="noreferrer">
          <Button variant="outline" size="sm">
            <IconBrandGithub />
            Reline Local
          </Button>
        </a>
        <a href="https://github.com/breadyk/reline-local-GUI" target="_blank" className="hidden md:flex" rel="noreferrer">
          <Button variant="outline" size="sm">
            <IconBrandGithub />
            Reline Local GUI
          </Button>
        </a>
      </div>
      <div className="flex flex-row gap-2 items-center">
        <h1 className="hidden md:flex scroll-m-20 text-sm font-semibold tracking-tight select-none">{t("home-page.need-help")}</h1>
        <DocumentationDialog />
        <a href="https://discord.gg/hEgdaVzTs9" target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm">
            <IconBrandDiscordFilled />
            RawkumaSR
          </Button>
        </a>
        <Button variant="outline" size="icon-sm" onClick={() => openSettings("prefs")}>
          <IconSettings />
        </Button>
      </div>
    </footer>
  )
}

export function TauriFooter() {
  const { t } = useTranslation()
  const {
    stage,
    installingDeps,
    busy,
    pipelineActive,
    pipelineCompleted,
    progress,
    depsStatus,
    depsReady,
    errorInfo,
    metrics,
    handleStart,
    handleStop,
    handleOpenFolder,
  } = useBackendContext()
  const { openSettings } = useSettings()
  const { activeCount } = useModelDownloads()
  const nodes = useContext(NodesContext)
  const [errorOpen, setErrorOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [showPercent, setShowPercent] = useState(false)
  const [pendingStart, setPendingStart] = useState(false)
  const lastStageRef = useRef(stage)

  useEffect(() => {
    if (pendingStart) {
      if (pipelineActive || stage === "error" || (stage === "idle" && lastStageRef.current !== "idle")) {
        setPendingStart(false)
      }
    }
    lastStageRef.current = stage
  }, [pendingStart, pipelineActive, stage])

  const depsUnavailable = !depsReady || installingDeps
  const startDisabled = depsUnavailable || busy
  const playBusy = pendingStart || pipelineActive || stage === "starting"
  const playGreen = { borderColor: "#22c55e", color: "#22c55e", backgroundColor: "rgba(34,197,94,0.1)" }
  const playAmber = { borderColor: "#f59e0b", color: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)" }
  const grayStyle = { borderColor: GRAY, color: GRAY, backgroundColor: "rgba(107,114,128,0.1)" }
  const stopRed = { borderColor: "#ef4444", color: "#ef4444", backgroundColor: "rgba(239,68,68,0.1)" }
  const stopDisabled = depsUnavailable || !pipelineActive

  const isError = stage === "error"

  const writer = [...nodes].reverse().find((node) => node.type === NodeType.FOLDER_WRITER)
  const outputPath = (writer?.options as FolderWriterNodeOptions | undefined)?.path

  const metricItems = [
    { label: t("backend.processed"), value: metrics ? `${metrics.processed}/${metrics.total}` : "—" },
    { label: t("backend.lastFileTime"), value: formatDuration(metrics?.lastFileSeconds ?? null) },
    { label: t("backend.eta"), value: formatDuration(metrics?.etaSeconds ?? null) },
  ]

  return (
    <footer className="flex h-14 bg-card rounded-xl ring-1 ring-foreground/10 p-2 px-3 mb-3 md:mb-5 mx-3 md:mx-5 items-center gap-2">
      {playBusy ? (
        <Button size="icon-lg" variant="outline" disabled style={playAmber} className="disabled:opacity-100">
          <IconLoader2 className="animate-spin" />
        </Button>
      ) : (
        <Button
          size="icon-lg"
          variant="outline"
          style={depsUnavailable ? grayStyle : playGreen}
          onClick={
            startDisabled
              ? undefined
              : () => {
                  setPendingStart(true)
                  void handleStart()
                }
          }
          disabled={startDisabled}
        >
          <IconPlayerPlay />
        </Button>
      )}

      <Button
        size="icon-lg"
        variant="outline"
        style={pipelineActive ? stopRed : grayStyle}
        onClick={pipelineActive ? handleStop : undefined}
        disabled={stopDisabled}
      >
        <IconPlayerStop />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
        <Progress value={progress} className="w-[200px] shrink-0" indicatorClassName={isError ? "bg-red-500" : "bg-green-500"} />
        {depsStatus != null && !depsReady && !installingDeps ? (
          <Button variant="link" size="xs" className="shrink-0 whitespace-nowrap text-white hover:text-white/80" onClick={() => openSettings("deps")}>
            {t("backend.installDepsHint")}
            <IconExternalLink className="size-3.5" />
          </Button>
        ) : null}
        {pipelineActive && metrics != null ? (
          showPercent ? (
            <button
              type="button"
              onClick={() => setShowPercent(false)}
              className="shrink-0 text-xs text-muted-foreground tabular-nums transition-colors hover:text-foreground"
            >
              {Math.round(progress)}%
            </button>
          ) : (
            <button type="button" onClick={() => setShowPercent(true)} className="flex shrink-0 items-center gap-3 text-xs">
              {metricItems.map((item) => (
                <span key={item.label} className="flex flex-col items-center leading-tight">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="tabular-nums">{item.value}</span>
                </span>
              ))}
            </button>
          )
        ) : null}
        {errorInfo ? (
          <Button variant="link" size="xs" className="shrink-0 text-red-500" onClick={() => setErrorOpen(true)}>
            {t("backend.error")}
          </Button>
        ) : null}
        {pipelineCompleted && outputPath ? (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => handleOpenFolder(outputPath)}>
            <IconFolder />
            {t("backend.openInExplorer")}
          </Button>
        ) : null}
      </div>

      <DocumentationDialog iconOnly />

      <ServerPopover />

      <Button
        size="icon-lg"
        variant="outline"
        className="relative shrink-0"
        onClick={() => setModelsOpen(true)}
        aria-label={t("backend.models.title")}
        title={t("backend.models.title")}
      >
        {activeCount > 0 ? <IconLoader2 className="animate-spin" /> : <IconDownload />}
        {activeCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            {activeCount}
          </span>
        ) : null}
      </Button>

      <Button size="icon-lg" variant="outline" className="shrink-0" onClick={() => openSettings("deps")}>
        <IconSettings />
      </Button>

      <ModelDownloaderDialog open={modelsOpen} onOpenChange={setModelsOpen} />

      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("backend.errorDetails")}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{errorInfo?.detail}</p>
        </DialogContent>
      </Dialog>
    </footer>
  )
}
