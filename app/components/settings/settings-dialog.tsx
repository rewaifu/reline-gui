import { useMemo, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import anser from "anser"
import { IconAlertTriangle, IconCheck, IconLoader2, IconMessageReply, IconTerminal2, IconX } from "@tabler/icons-react"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Progress } from "~/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PreferencesTab } from "~/components/settings/tabs/preferences-tab"
import { NodesTab } from "~/components/settings/tabs/nodes-tab"
import type { SettingsSection } from "~/context/contexts"

export interface DepsStatus {
  uv_installed: boolean
  repo_cloned: boolean
  venv_created: boolean
  deps_installed: boolean
  has_nvidia_gpu: boolean
}

export interface DepsVersions {
  torch_version: string | null
  torch_cuda: boolean
  resselt_version: string | null
  reline_version: string | null
}

export interface LogEntry {
  timestamp: string
  level: string
  message: string
}

export interface UvProgress {
  stage: string
  current: number
  total: number
  raw_message: string
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isTauri: boolean
  section?: SettingsSection
  depsStatus?: DepsStatus | null
  versions?: DepsVersions | null
  installingDeps?: boolean
  statusMessage?: string
  logs?: LogEntry[]
  uvProgress?: UvProgress | null
  onInstall?: (full: boolean) => Promise<void>
}

function AnsiLine({ text }: { text: string }) {
  const cleanText = useMemo(() => text.replace(/\r/g, ""), [text])
  const html = useMemo(() => anser.ansiToHtml(cleanText), [cleanText])

  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

const APP_VERSION = "2.0.0"

function resolveTab(section: SettingsSection | undefined, isTauri: boolean): string {
  if (section === "sound") return isTauri ? "sound" : "prefs"
  if (section === "prefs") return "prefs"
  if (section === "nodes") return "nodes"
  if (section === "deps" || section === "logs") return isTauri ? "deps" : "prefs"
  return isTauri ? "deps" : "prefs"
}

export function SettingsDialog({
  open,
  onOpenChange,
  isTauri,
  section,
  depsStatus,
  versions,
  installingDeps = false,
  statusMessage = "",
  logs,
  uvProgress,
  onInstall,
}: SettingsDialogProps) {
  const { t } = useTranslation()
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState(() => resolveTab(section, isTauri))

  useEffect(() => {
    if (open) {
      setActiveTab(resolveTab(section, isTauri))
    }
  }, [open, section, isTauri])

  const logEntries = logs ?? []

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [logEntries])

  const depsInstalled = depsStatus?.deps_installed === true && depsStatus.repo_cloned && depsStatus.venv_created && depsStatus.uv_installed

  const hasAnyDeps = depsStatus != null

  const uvPercentage = uvProgress && uvProgress.total > 0 ? Math.round((uvProgress.current / uvProgress.total) * 100) : 0

  const statusItems = [
    { key: "uv", label: t("backend.depsStatus.uv"), ok: depsStatus?.uv_installed ?? false },
    { key: "repo", label: t("backend.depsStatus.repo"), ok: depsStatus?.repo_cloned ?? false },
    { key: "venv", label: t("backend.depsStatus.venv"), ok: depsStatus?.venv_created ?? false },
    { key: "deps", label: t("backend.depsStatus.deps"), ok: depsStatus?.deps_installed ?? false },
  ] as const

  const handleInstall = () => {
    void onInstall?.(!depsInstalled)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col sm:max-w-none w-[min(1000px,calc(100vw-2rem))] h-[min(640px,calc(100vh-2rem))]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 min-h-0">
          <DialogHeader>
            <DialogTitle>{t("backend.settings")}</DialogTitle>
            <DialogDescription className="sr-only">{t("backend.dependencies")}</DialogDescription>
          </DialogHeader>

          <TabsList className="w-full">
            {isTauri && <TabsTrigger value="deps">{t("backend.tabs.dependencies")}</TabsTrigger>}
            <TabsTrigger value="prefs">{t("backend.tabs.preferences")}</TabsTrigger>
            <TabsTrigger value="nodes">{t("backend.tabs.nodes")}</TabsTrigger>
            {isTauri && <TabsTrigger value="sound">{t("backend.tabs.sound")}</TabsTrigger>}
          </TabsList>

          {isTauri && (
            <TabsContent value="deps" className="flex min-h-0 flex-1 flex-col">
              <div className="grid grid-cols-2 grid-rows-1 gap-5 flex-1 min-h-0">
                {/* Left column: deps, versions, install */}
                <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
                  {/* Status Items */}
                  <div className="space-y-1.5">
                    {statusItems.map((item) => (
                      <div key={item.key} className="flex items-center gap-2 text-sm">
                        {item.ok ? <IconCheck className="size-4 text-green-500 shrink-0" /> : <IconX className="size-4 text-red-500 shrink-0" />}
                        <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Warning */}
                  {hasAnyDeps && !depsStatus.has_nvidia_gpu && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
                      <IconAlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                      <span>{t("backend.noNvidiaGpu")}</span>
                    </div>
                  )}

                  <div className="mt-auto flex flex-col gap-3">
                    {/* Versions */}
                    {versions && (versions.torch_version || versions.resselt_version || versions.reline_version) && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">{t("backend.versions")}</span>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                          {versions.torch_version && (
                            <>
                              <span className="text-muted-foreground">Torch:</span>
                              <span className="font-mono">
                                {versions.torch_version}
                                {versions.torch_cuda ? (
                                  <span className="ml-1 text-green-500">{t("backend.torchCuda")}</span>
                                ) : (
                                  <span className="ml-1 text-red-500">{t("backend.torchCudaFail")}</span>
                                )}
                              </span>
                            </>
                          )}
                          {versions.resselt_version && (
                            <>
                              <span className="text-muted-foreground">resselt:</span>
                              <span className="font-mono">{versions.resselt_version}</span>
                            </>
                          )}
                          {versions.reline_version && (
                            <>
                              <span className="text-muted-foreground">reline:</span>
                              <span className="font-mono">{versions.reline_version}</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Button */}
                    <div className="space-y-1.5">
                      <Button variant={depsInstalled ? "outline" : "default"} className="w-full" disabled={installingDeps} onClick={handleInstall}>
                        {installingDeps ? (
                          <IconLoader2 className="animate-spin" />
                        ) : depsInstalled ? (
                          t("backend.updateLibs")
                        ) : (
                          t("backend.installDeps")
                        )}
                      </Button>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        {depsInstalled ? t("backend.updateLibsDesc") : t("backend.installDepsDesc")}
                      </p>
                    </div>

                    {/* Progress message */}
                    {installingDeps && uvProgress && uvProgress.total > 0 ? (
                      <div className="space-y-1.5 rounded-lg border p-2.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="capitalize">{t(`backend.progress.${uvProgress.stage}`, { defaultValue: uvProgress.stage })}</span>
                          <span className="tabular-nums">
                            {uvProgress.current} / {uvProgress.total} ({uvPercentage}%)
                          </span>
                        </div>
                        <Progress value={uvPercentage} className="w-full" />
                        <p className="text-[10px] font-mono text-muted-foreground truncate">{uvProgress.raw_message}</p>
                      </div>
                    ) : installingDeps ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <IconLoader2 className="size-3.5 animate-spin shrink-0" />
                        <span className="truncate">{statusMessage || t("backend.installing")}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Right column: Logs */}
                <div className="flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <IconTerminal2 className="size-3.5" />
                      {t("backend.viewLogs")}
                    </span>
                  </div>
                  <div ref={logsContainerRef} className="flex-1 min-h-0 overflow-y-auto rounded-md border bg-black/90 p-2">
                    {logEntries.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t("backend.noLogs")}</p>
                    ) : (
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                        {logEntries.map((entry, i) => (
                          <div key={i}>
                            <span className="text-muted-foreground select-none">[{entry.timestamp}]</span> <AnsiLine text={entry.message} />
                          </div>
                        ))}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          )}

          <TabsContent value="prefs" className="flex min-h-0 flex-1 flex-col">
            <PreferencesTab />
          </TabsContent>
          <TabsContent value="nodes" className="flex min-h-0 flex-1 flex-col">
            <NodesTab />
          </TabsContent>
          {isTauri && (
            <TabsContent value="sound" className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
              <IconMessageReply />
            </TabsContent>
          )}

          <DialogFooter className="items-center sm:justify-between">
            <span className="text-xs text-muted-foreground tabular-nums">v{APP_VERSION}</span>
            <Button variant="outline" size="xs" onClick={() => onOpenChange(false)}>
              {t("backend.close")}
            </Button>
          </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
