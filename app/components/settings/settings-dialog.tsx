import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { IconBrandDiscordFilled, IconBrandGithub } from "@tabler/icons-react"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { PreferencesTab } from "~/components/settings/tabs/preferences-tab"
import { NodesTab } from "~/components/settings/tabs/nodes-tab"
import { DepsTab } from "~/components/settings/tabs/deps-tab"
import { SoundTab } from "~/components/settings/tabs/sound-tab"
import type { SettingsSection } from "~/context/contexts"
import type { DepsStatus, DepsVersions, LogEntry, UvProgress } from "~/types/backend"

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

const APP_VERSION = __APP_VERSION__

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
  const [activeTab, setActiveTab] = useState(() => resolveTab(section, isTauri))

  useEffect(() => {
    if (open) {
      setActiveTab(resolveTab(section, isTauri))
    }
  }, [open, section, isTauri])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-5 p-5 sm:max-w-none w-[min(1000px,calc(100vw-2rem))] h-[min(640px,calc(100vh-2rem))]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 min-h-0">
          <DialogHeader>
            <DialogTitle className="-mt-1 mb-1 select-none">{t("backend.settings")}</DialogTitle>
            <DialogDescription className="sr-only">{t("backend.dependencies")}</DialogDescription>
          </DialogHeader>

          <TabsList className="w-full mb-3 select-none">
            {isTauri && <TabsTrigger value="deps">{t("backend.tabs.dependencies")}</TabsTrigger>}
            <TabsTrigger value="prefs">{t("backend.tabs.preferences")}</TabsTrigger>
            <TabsTrigger value="nodes">{t("backend.tabs.nodes")}</TabsTrigger>
            {isTauri && <TabsTrigger value="sound">{t("backend.tabs.sound")}</TabsTrigger>}
          </TabsList>

          {isTauri && (
            <TabsContent value="deps" className="flex min-h-0 flex-1 flex-col">
              <DepsTab
                depsStatus={depsStatus ?? null}
                versions={versions ?? null}
                installingDeps={installingDeps}
                statusMessage={statusMessage}
                logs={logs ?? []}
                uvProgress={uvProgress ?? null}
                onInstall={onInstall}
              />
            </TabsContent>
          )}

          <TabsContent value="prefs" className="flex min-h-0 flex-1 flex-col">
            <PreferencesTab />
          </TabsContent>
          <TabsContent value="nodes" className="flex min-h-0 flex-1 flex-col">
            <NodesTab />
          </TabsContent>
          {isTauri && (
            <TabsContent value="sound" className="flex min-h-0 flex-1 flex-col">
              <SoundTab />
            </TabsContent>
          )}

          <DialogFooter className="-mx-5 -mb-5 p-5 items-center sm:justify-between">
            <span className="text-xs text-muted-foreground tabular-nums select-none">v{APP_VERSION}</span>
            {isTauri ? (
              <div className="flex flex-row items-center gap-2">
                <a href="https://github.com/rewaifu/reline-web" target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">
                    <IconBrandGithub />
                    Reline GUI
                  </Button>
                </a>
                <a href="https://discord.gg/hEgdaVzTs9" target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">
                    <IconBrandDiscordFilled />
                    RawkumaSR
                  </Button>
                </a>
              </div>
            ) : (
              <Button variant="outline" size="xs" onClick={() => onOpenChange(false)}>
                {t("backend.close")}
              </Button>
            )}
          </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
