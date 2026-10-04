import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { IconMessageReply } from "@tabler/icons-react"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { PreferencesTab } from "~/components/settings/tabs/preferences-tab"
import { NodesTab } from "~/components/settings/tabs/nodes-tab"
import { DepsTab } from "~/components/settings/tabs/deps-tab"
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

const APP_VERSION = "3.0.0"

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
