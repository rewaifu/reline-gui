import { useTranslation } from "react-i18next"
import { IconDownload, IconRefresh } from "@tabler/icons-react"
import { useUpdater } from "~/components/providers/updater-provider"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Progress } from "~/components/ui/progress"

interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UpdateDialog({ open, onOpenChange }: UpdateDialogProps) {
  const { t } = useTranslation()
  const { status, update, progress, error, downloadAndInstall, restart } = useUpdater()

  const installed = status === "ready"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("backend.updates.title")}</DialogTitle>
          <DialogDescription>
            {installed
              ? t("backend.updates.readyDesc")
              : update
                ? t("backend.updates.availableDesc", { version: update.version, current: update.currentVersion })
                : t("backend.updates.checkDesc")}
          </DialogDescription>
        </DialogHeader>

        {status === "downloading" ? <Progress value={progress ?? 0} indicatorClassName="bg-green-500" /> : null}

        {update?.body && status !== "downloading" && !installed ? (
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">{update.body}</div>
        ) : null}

        {error ? <p className="whitespace-pre-wrap break-words text-xs text-red-500">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("backend.updates.later")}
          </Button>
          {installed ? (
            <Button onClick={() => void restart()}>
              <IconRefresh className="size-4" />
              {t("backend.updates.restart")}
            </Button>
          ) : update ? (
            <Button onClick={() => void downloadAndInstall()} disabled={status === "downloading"}>
              <IconDownload className="size-4" />
              {status === "downloading" ? t("backend.updates.installing") : t("backend.updates.install")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
