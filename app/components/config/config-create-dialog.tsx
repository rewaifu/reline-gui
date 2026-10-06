import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useConfigs } from "~/components/providers/configs-provider"
import { Button } from "~/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { CONFIG_PRESETS, getPresetById } from "~/lib/config-presets"
import { isNameTaken } from "~/lib/user-configs"
import { cn } from "~/lib/utils"
import type { CreateDialogMode } from "~/context/contexts"
import type { ConfigBase, UserConfig } from "~/types/config"

const MAX_NAME_LENGTH = 30

export function ConfigCreateDialog({
  open,
  mode,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  mode: CreateDialogMode
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string, base: ConfigBase) => void
}) {
  const { t } = useTranslation()
  const { userConfigs, activeConfig } = useConfigs()
  const [name, setName] = useState("")
  const [baseId, setBaseId] = useState("empty")
  const [namePool, setNamePool] = useState<UserConfig[]>([])
  const userConfigsRef = useRef(userConfigs)

  useEffect(() => {
    userConfigsRef.current = userConfigs
  }, [userConfigs])

  useEffect(() => {
    if (open) {
      setName("")
      setBaseId(activeConfig?.kind === "preset" ? activeConfig.id : "empty")
      setNamePool(userConfigsRef.current)
    }
  }, [open, activeConfig])

  const trimmed = name.trim()
  const duplicate = isNameTaken(trimmed, namePool)
  const valid = trimmed.length > 0 && !duplicate

  const resolveBaseLabel = (value: string) => (value === "empty" ? t("config-presets.empty") : (getPresetById(value)?.name ?? value))

  const handleSubmit = () => {
    if (!valid) return
    const base: ConfigBase = mode === "full" ? (baseId === "empty" ? { kind: "empty" } : { kind: "preset", id: baseId }) : { kind: "current" }
    onSubmit(trimmed, base)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "full" ? t("config-presets.new") : t("config-presets.save-as-title")}</DialogTitle>
          <DialogDescription>{mode === "full" ? t("config-presets.create-desc") : t("config-presets.save-as-desc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="config-name">{t("config-presets.name")}</Label>
              <span className="text-xs text-muted-foreground">
                {name.length}/{MAX_NAME_LENGTH}
              </span>
            </div>
            <Input
              id="config-name"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              placeholder={t("config-presets.name-placeholder")}
              aria-invalid={duplicate || undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSubmit()
              }}
            />
            {duplicate && <p className="text-xs text-destructive">{t("config-presets.duplicate")}</p>}
          </div>
          {mode === "full" && (
            <div className="flex flex-col gap-2">
              <Label>{t("config-presets.base")}</Label>
              <Select value={baseId} onValueChange={(value) => value && setBaseId(value)}>
                <SelectTrigger className={cn("w-full", baseId === "empty" && "text-muted-foreground")}>
                  <SelectValue>{(value) => resolveBaseLabel((value as string) ?? "empty")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empty">{t("config-presets.empty")}</SelectItem>
                  {CONFIG_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("config-presets.cancel")}</DialogClose>
          <Button disabled={!valid} onClick={handleSubmit}>
            {t("config-presets.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
