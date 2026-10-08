import { useTranslation } from "react-i18next"
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
import { Button } from "~/components/ui/button"

export function UnsavedChangesDialog({
  open,
  name,
  onSave,
  onDiscard,
  onCancel,
  onClosed,
}: {
  open: boolean
  name: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
  onClosed: () => void
}) {
  const { t } = useTranslation()

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()} onOpenChangeComplete={(next) => !next && onClosed()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("config-presets.unsaved-title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("config-presets.unsaved-desc", { name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t("config-presets.unsaved-cancel")}</AlertDialogCancel>
          <Button variant="outline" onClick={onDiscard}>
            {t("config-presets.unsaved-discard")}
          </Button>
          <AlertDialogAction onClick={onSave}>{t("config-presets.unsaved-save")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
