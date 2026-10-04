import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { IconFolderOpen, IconRefresh, IconX } from "@tabler/icons-react"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Separator } from "~/components/ui/separator"
import { useIsTauri } from "~/hooks/useIsTauri"
import { ensureNotificationPermission } from "~/lib/completion-feedback"
import { normalizeWebPath } from "~/lib/paths"
import { usePreferences } from "~/components/preferences-provider"
import { useLocalModels } from "~/components/local-models-provider"

function PathField({
  id,
  label,
  placeholder,
  value,
  onChange,
  webPrefix = false,
}: {
  id: string
  label: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  webPrefix?: boolean
}) {
  const isTauri = useIsTauri()
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  const commit = () => {
    const next = webPrefix && !isTauri ? normalizeWebPath(local) : local
    if (next !== local) setLocal(next)
    if (next !== value) onChange(next)
  }

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const folder = await open({ directory: true, multiple: false, title: label })
      if (folder) onChange(folder as string)
    } catch (err) {
      console.error("Folder dialog failed:", err)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          className="flex-1"
          value={local}
          placeholder={placeholder}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
          }}
        />
        {isTauri && (
          <Button variant="outline" size="icon" onClick={handleBrowse} aria-label={placeholder}>
            <IconFolderOpen className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={!local}
          onClick={() => {
            setLocal("")
            onChange("")
          }}
          aria-label="clear"
        >
          <IconX className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export function PreferencesTab() {
  const { t } = useTranslation()
  const isTauri = useIsTauri()
  const {
    playSoundOnComplete,
    setPlaySoundOnComplete,
    notifyOnComplete,
    setNotifyOnComplete,
    defaultReaderPath,
    setDefaultReaderPath,
    defaultWriterPath,
    setDefaultWriterPath,
    modelsFolder,
    setModelsFolder,
  } = usePreferences()
  const { localModels, loading, rescan } = useLocalModels()

  const handleNotifyChange = async (checked: boolean) => {
    if (checked) {
      const granted = await ensureNotificationPermission()
      if (!granted) {
        toast.error(t("backend.preferences.notificationDenied"))
        return
      }
    }
    setNotifyOnComplete(checked)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
      {isTauri && (
        <>
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">{t("backend.preferences.completionTitle")}</span>
            <FieldGroup>
              <Field orientation="horizontal">
                <Checkbox id="pref-play-sound" checked={playSoundOnComplete} onCheckedChange={(checked) => setPlaySoundOnComplete(!!checked)} />
                <FieldLabel htmlFor="pref-play-sound">{t("backend.preferences.playSound")}</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox id="pref-notify" checked={notifyOnComplete} onCheckedChange={(checked) => void handleNotifyChange(!!checked)} />
                <FieldLabel htmlFor="pref-notify">{t("backend.preferences.notify")}</FieldLabel>
              </Field>
            </FieldGroup>
          </div>

          <Separator />
        </>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("backend.preferences.pathsTitle")}</span>
          <span className="text-xs text-muted-foreground">{t("backend.preferences.pathsDesc")}</span>
        </div>
        <PathField
          id="pref-reader-path"
          label={t("backend.preferences.readerPath")}
          placeholder={t("nodes.folder-reader.placeholder")}
          value={defaultReaderPath}
          onChange={setDefaultReaderPath}
          webPrefix
        />
        <PathField
          id="pref-writer-path"
          label={t("backend.preferences.writerPath")}
          placeholder={t("nodes.folder-writer.placeholder")}
          value={defaultWriterPath}
          onChange={setDefaultWriterPath}
          webPrefix
        />
      </div>

      {isTauri && (
        <>
          <Separator />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("backend.preferences.modelsTitle")}</span>
              <Button variant="ghost" size="xs" onClick={rescan} disabled={loading}>
                <IconRefresh className="size-3.5" />
                {t("backend.preferences.rescan")}
              </Button>
            </div>
            <PathField
              id="pref-models-folder"
              label={t("backend.preferences.modelsFolder")}
              placeholder={t("nodes.upscale.browse-models-folder")}
              value={modelsFolder}
              onChange={setModelsFolder}
            />
            <span className="text-xs text-muted-foreground">
              {loading ? t("backend.preferences.modelsLoading") : t("backend.preferences.modelsCount", { count: localModels.length })}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
