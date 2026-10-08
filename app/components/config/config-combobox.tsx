import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { IconEdit, IconPlus, IconTrash } from "@tabler/icons-react"
import { useConfigs } from "~/components/providers/configs-provider"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "~/components/ui/combobox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { CONFIG_PRESETS, getPresetById } from "~/lib/config-presets"
import { isNameTaken } from "~/lib/user-configs"
import type { ActiveConfig, UserConfig } from "~/types/config"

const MAX_NAME_LENGTH = 30

interface ConfigGroup {
  value: string
  items: string[]
}

const PRESET_PREFIX = "preset:"
const USER_PREFIX = "user:"

export function ConfigCombobox({ className = "w-44" }: { className?: string }) {
  const { t } = useTranslation()
  const { userConfigs, activeConfig, loadConfig, renameConfig, deleteConfig, openCreateDialog } = useConfigs()
  const [open, setOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<UserConfig | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserConfig | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const activeValue = activeConfig ? `${activeConfig.kind}:${activeConfig.id}` : null

  const groups = useMemo<ConfigGroup[]>(() => {
    const result: ConfigGroup[] = [
      { value: t("config-presets.presets-group"), items: CONFIG_PRESETS.map((preset) => `${PRESET_PREFIX}${preset.id}`) },
    ]
    if (userConfigs.length > 0) {
      result.push({ value: t("config-presets.custom"), items: userConfigs.map((config) => `${USER_PREFIX}${config.id}`) })
    }
    return result
  }, [t, userConfigs])

  const resolveLabel = useCallback(
    (item: string) => {
      if (item.startsWith(PRESET_PREFIX)) return getPresetById(item.slice(PRESET_PREFIX.length))?.name ?? item
      return userConfigs.find((config) => `${USER_PREFIX}${config.id}` === item)?.name ?? item
    },
    [userConfigs],
  )

  const handleChange = (value: string | null) => {
    if (!value) return
    const separatorIndex = value.indexOf(":")
    const target = { kind: value.slice(0, separatorIndex), id: value.slice(separatorIndex + 1) } as ActiveConfig
    loadConfig(target)
  }

  return (
    <>
      <Combobox
        items={groups}
        value={activeValue}
        open={open}
        onOpenChange={setOpen}
        onValueChange={(value) => {
          if (typeof value === "string") handleChange(value)
        }}
        itemToStringLabel={(item) => resolveLabel(item as string)}
      >
        <ComboboxInput className={className} placeholder={t("config-presets.select")} showTrigger />
        <ComboboxContent>
          <ComboboxEmpty>{t("config-presets.no-results")}</ComboboxEmpty>
          <ComboboxList>
            {(group: ConfigGroup, index: number) =>
              group.items.length === 0 ? null : (
                <Fragment key={group.value}>
                  {index > 0 && <ComboboxSeparator />}
                  <ComboboxGroup items={group.items}>
                    <ComboboxLabel>{group.value}</ComboboxLabel>
                    <ComboboxCollection>
                      {(item: string) => (
                        <ComboboxItem
                          key={item}
                          value={item}
                          className="group/config-item gap-1 pl-6 pr-2 hover:bg-accent focus-within:bg-accent [&>span[aria-hidden]]:right-auto [&>span[aria-hidden]]:left-1.5"
                        >
                          <span className="min-w-0 flex-1 truncate">{resolveLabel(item)}</span>
                          {item.startsWith(USER_PREFIX) && (
                            <span className="absolute right-1 top-1/2 z-10 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-accent p-0.5 group-hover/config-item:flex focus-within:flex group-data-[highlighted]/config-item:flex max-md:flex max-md:bg-popover">
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-y-0 -left-8 w-8 bg-linear-to-r from-accent/0 to-accent max-md:from-popover/0 max-md:to-popover"
                              />
                              <button
                                type="button"
                                aria-label={t("config-presets.rename")}
                                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--accent),var(--accent-foreground)_15%)] hover:text-foreground"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setOpen(false)
                                  setRenameTarget(userConfigs.find((config) => `${USER_PREFIX}${config.id}` === item) ?? null)
                                }}
                              >
                                <IconEdit className="size-4" />
                              </button>
                              <button
                                type="button"
                                aria-label={t("config-presets.delete")}
                                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--accent),var(--accent-foreground)_15%)] hover:text-destructive"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setOpen(false)
                                  setDeleteTarget(userConfigs.find((config) => `${USER_PREFIX}${config.id}` === item) ?? null)
                                  setDeleteOpen(true)
                                }}
                              >
                                <IconTrash className="size-4" />
                              </button>
                            </span>
                          )}
                        </ComboboxItem>
                      )}
                    </ComboboxCollection>
                  </ComboboxGroup>
                </Fragment>
              )
            }
          </ComboboxList>
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center"
              onClick={() => {
                setOpen(false)
                openCreateDialog("full")
              }}
            >
              <IconPlus />
              {t("config-presets.new")}
            </Button>
          </div>
        </ComboboxContent>
      </Combobox>
      <RenameConfigDialog
        config={renameTarget}
        onOpenChange={(next) => !next && setRenameTarget(null)}
        onSubmit={(name) => {
          if (renameTarget) renameConfig(renameTarget.id, name)
          setRenameTarget(null)
        }}
      />
      <AlertDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <IconTrash />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("config-presets.delete-confirm-title")}</AlertDialogTitle>
            <AlertDialogDescription className="[overflow-wrap:anywhere]">
              {t("config-presets.delete-confirm-desc", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("config-presets.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) deleteConfig(deleteTarget.id)
                setDeleteOpen(false)
              }}
            >
              {t("config-presets.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function RenameConfigDialog({
  config,
  onOpenChange,
  onSubmit,
}: {
  config: UserConfig | null
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => void
}) {
  const { t } = useTranslation()
  const { userConfigs } = useConfigs()
  const [name, setName] = useState("")

  useEffect(() => {
    if (config) setName(config.name)
  }, [config])

  const open = config !== null
  const trimmed = name.trim()
  const duplicate = config ? isNameTaken(trimmed, userConfigs, config.id) : false
  const valid = trimmed.length > 0 && !duplicate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("config-presets.rename")}</DialogTitle>
          <DialogDescription>{t("config-presets.rename-desc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="config-rename">{t("config-presets.name")}</Label>
            <span className="text-xs text-muted-foreground">
              {name.length}/{MAX_NAME_LENGTH}
            </span>
          </div>
          <Input
            id="config-rename"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder={t("config-presets.name-placeholder")}
            aria-invalid={duplicate || undefined}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && valid) onSubmit(trimmed)
            }}
          />
          {duplicate && <p className="text-xs text-destructive">{t("config-presets.duplicate")}</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("config-presets.cancel")}</DialogClose>
          <Button disabled={!valid} onClick={() => onSubmit(trimmed)}>
            {t("config-presets.rename")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
