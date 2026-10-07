import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { IconFolderOpen, IconRefresh, IconX } from "@tabler/icons-react"
import { Button } from "~/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area"
import { Separator } from "~/components/ui/separator"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { useIsTauri } from "~/hooks/useIsTauri"
import { ensureNotificationPermission } from "~/lib/completion-feedback"
import { normalizeWebPath } from "~/lib/paths"
import { usePreferences } from "~/components/providers/preferences-provider"
import { useLocalModels } from "~/components/providers/local-models-provider"
import type { NotifyMode } from "~/context/contexts"

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

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const [local, setLocal] = useState(String(value))

  useEffect(() => {
    setLocal(String(value))
  }, [value])

  const commit = () => {
    const parsed = Number.parseInt(local)
    const clamped = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value
    if (clamped !== value) onChange(clamped)
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        className="w-[240px]"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
        }}
      />
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
    notifyMode,
    setNotifyMode,
    screentoneUseSsaa,
    setScreentoneUseSsaa,
    screentoneMinProduct,
    setScreentoneMinProduct,
    screentoneFractionalDot,
    setScreentoneFractionalDot,
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
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-4 pr-3 pb-1">
        {isTauri && (
          <Card>
            <CardHeader className="select-none">
              <CardTitle>{t("backend.preferences.completionTitle")}</CardTitle>
              <CardDescription>{t("backend.preferences.completionDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <FieldGroup>
                <Field orientation="horizontal">
                  <Checkbox id="pref-play-sound" checked={playSoundOnComplete} onCheckedChange={(checked) => setPlaySoundOnComplete(checked)} />
                  <FieldLabel htmlFor="pref-play-sound">{t("backend.preferences.playSound")}</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox id="pref-notify" checked={notifyOnComplete} onCheckedChange={(checked) => void handleNotifyChange(checked)} />
                  <FieldLabel htmlFor="pref-notify">{t("backend.preferences.notify")}</FieldLabel>
                </Field>
                {notifyOnComplete && (
                  <Select value={notifyMode} onValueChange={(value) => setNotifyMode(value as NotifyMode)}>
                    <SelectTrigger className="w-[240px]">
                      <SelectValue>{t(`backend.preferences.notify-mode-options.${notifyMode}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(["always", "when-minimized"] as NotifyMode[]).map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {t(`backend.preferences.notify-mode-options.${mode}`)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </FieldGroup>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="select-none">
            <CardTitle>{t("backend.preferences.pathsTitle")}</CardTitle>
            <CardDescription>{t("backend.preferences.pathsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
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
          </CardContent>
        </Card>

        {isTauri && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t("backend.preferences.modelsTitle")}</CardTitle>
                <CardAction>
                  <Button variant="ghost" size="xs" onClick={rescan} disabled={loading}>
                    <IconRefresh className="size-3.5" />
                    {t("backend.preferences.rescan")}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="select-none">
                <CardTitle>{t("backend.preferences.screentoneTitle")}</CardTitle>
                <CardDescription>{t("backend.preferences.screentoneDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <FieldGroup>
                  <Field orientation="horizontal">
                    <Checkbox id="pref-screentone-ssaa" checked={screentoneUseSsaa} onCheckedChange={(checked) => setScreentoneUseSsaa(!!checked)} />
                    <FieldLabel htmlFor="pref-screentone-ssaa">{t("backend.preferences.screentoneUseSsaa")}</FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <Checkbox
                      id="pref-screentone-fractional"
                      checked={screentoneFractionalDot}
                      onCheckedChange={(checked) => setScreentoneFractionalDot(!!checked)}
                    />
                    <FieldLabel htmlFor="pref-screentone-fractional">{t("backend.preferences.screentoneFractionalDot")}</FieldLabel>
                  </Field>
                </FieldGroup>
                <Separator />
                <NumberField
                  id="pref-screentone-min-product"
                  label={t("backend.preferences.screentoneMinProduct")}
                  value={screentoneMinProduct}
                  min={8}
                  max={20}
                  onChange={setScreentoneMinProduct}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <ScrollBar />
    </ScrollArea>
  )
}
