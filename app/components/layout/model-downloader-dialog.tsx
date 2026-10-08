import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { IconChevronRight, IconDownload, IconFolderOpen, IconLoader2, IconPlayerStop, IconRefresh, IconSearch, IconTrash } from "@tabler/icons-react"
import { useLocalModels } from "~/components/providers/local-models-provider.tsx"
import { useModelDownloads } from "~/components/providers/model-downloads-provider.tsx"
import { Button } from "~/components/ui/button.tsx"
import { Card } from "~/components/ui/card.tsx"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible.tsx"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog.tsx"
import { Input } from "~/components/ui/input.tsx"
import { Progress } from "~/components/ui/progress.tsx"
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area.tsx"
import { RECOMMENDED_MODELS } from "~/constants.ts"
import { groupModels } from "~/lib/model-groups.ts"
import { normalizeModelName } from "~/lib/model-names.ts"
import { remoteModelsQueryOptions } from "~/lib/queries.ts"
import { cn } from "~/lib/utils.ts"
import type { ModelFile } from "~/types/api.ts"

export function ModelDownloaderDialog({
  open,
  onOpenChange,
  initialFilter = "",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialFilter?: string
}) {
  const { t } = useTranslation()
  const { modelsFolder, setModelsFolder, localModels } = useLocalModels()
  const { downloads, startDownload, cancelDownload, deleteModel, clearDownload } = useModelDownloads()
  const { data: remoteModels, isLoading, isError, error, refetch, isFetching } = useQuery({ ...remoteModelsQueryOptions, enabled: open })
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({})
  const notifiedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (open) setFilter(initialFilter)
  }, [open, initialFilter])

  const recommendedLabel = t("backend.models.recommended")
  const setGroupOpen = (value: string, open: boolean) => setGroupOverrides((prev) => ({ ...prev, [value]: open }))

  const installedNames = useMemo(() => new Set(localModels.map(normalizeModelName)), [localModels])

  const filteredModels = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return remoteModels ?? []
    return (remoteModels ?? []).filter((item) => normalizeModelName(item.filename).includes(query))
  }, [remoteModels, filter])

  const groupedModels = useMemo(() => {
    const byName = new Map(filteredModels.map((item) => [normalizeModelName(item.filename), item]))
    const recommended: ModelFile[] = []
    for (const name of RECOMMENDED_MODELS) {
      const item = byName.get(name)
      if (item) {
        recommended.push(item)
        byName.delete(name)
      }
    }
    const rest = groupModels([...byName.keys()]).flatMap((group) => {
      const items = group.items.map((name) => byName.get(name)).filter((item): item is ModelFile => Boolean(item))
      return items.length > 0 ? [{ value: group.value, items }] : []
    })
    return recommended.length > 0 ? [{ value: t("backend.models.recommended"), items: recommended }, ...rest] : rest
  }, [filteredModels, t])

  useEffect(() => {
    for (const [filename, state] of Object.entries(downloads)) {
      if (state.status === "error") {
        const key = `${filename}:error`
        if (!notifiedRef.current.has(key)) {
          notifiedRef.current.add(key)
          if (state.error === "no-folder") {
            toast.error(t("backend.models.noFolderError"))
          } else if (state.error?.startsWith("No internet connection")) {
            toast.error(t("backend.models.noInternetError"))
          } else {
            toast.error(t("backend.models.downloadError"))
          }
        }
      } else {
        notifiedRef.current.delete(`${filename}:error`)
      }
    }
  }, [downloads, t])

  const handleChooseFolder = async () => {
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog")
      const folder = await openDialog({ directory: true, multiple: false, title: t("backend.models.folderTitle") })
      if (folder) setModelsFolder(folder as string)
    } catch (err) {
      console.error("Folder dialog failed:", err)
    }
  }

  const handleDownload = (item: ModelFile) => {
    if (!modelsFolder) {
      toast.error(t("backend.models.noFolderError"))
      return
    }
    clearDownload(item.filename)
    void startDownload(item.filename, item.url)
  }

  const handleDelete = async (item: ModelFile) => {
    const name = normalizeModelName(item.filename)
    setDeleting(name)
    try {
      await deleteModel(name)
      clearDownload(item.filename)
    } catch (err) {
      console.error("Delete error:", err)
      toast.error(t("backend.models.deleteError"))
    } finally {
      setDeleting(null)
    }
  }

  const renderModelCard = (item: ModelFile) => {
    const name = normalizeModelName(item.filename)
    const isInstalled = installedNames.has(name)
    const state = downloads[item.filename]
    const status = state?.status
    const isActive = status === "downloading" || status === "extracting"
    const isDeleting = deleting === name
    const progress = isActive ? (state?.progress ?? 0) : isInstalled || status === "done" ? 100 : 0
    const statusLabel =
      status === "downloading"
        ? `${progress}%`
        : status === "extracting"
          ? t("backend.models.extracting")
          : status === "cancelled"
            ? t("backend.models.cancelled")
            : status === "error"
              ? state?.error === "no-folder"
                ? t("backend.models.noFolderError")
                : state?.error?.startsWith("No internet connection")
                  ? t("backend.models.noInternetError")
                  : t("backend.models.downloadError")
              : isInstalled || status === "done"
                ? t("backend.models.installed")
                : t("backend.models.notInstalled")

    return (
      <Card key={item.filename} size="sm" className={cn("flex-row items-center gap-3 px-4 py-1", isActive && "ring-2 ring-border")}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{statusLabel}</div>
        </div>

        <Progress value={progress} className="w-24 shrink-0 sm:w-40" indicatorClassName={status === "error" ? "bg-red-500" : "bg-green-500"} />

        <div className="flex w-16 shrink-0 justify-end gap-1">
          {isActive ? (
            <Button
              size="icon-lg"
              variant="destructive"
              onClick={() => cancelDownload(item.filename)}
              aria-label={t("backend.models.cancel")}
              title={t("backend.models.cancel")}
            >
              <IconPlayerStop />
            </Button>
          ) : isInstalled ? (
            <Button
              size="icon-lg"
              variant="ghost"
              disabled={isDeleting}
              onClick={() => void handleDelete(item)}
              aria-label={t("backend.models.delete")}
              title={t("backend.models.delete")}
            >
              {isDeleting ? <IconLoader2 className="animate-spin" /> : <IconTrash />}
            </Button>
          ) : (
            <Button
              size="icon-lg"
              variant="ghost"
              onClick={() => handleDownload(item)}
              aria-label={t("backend.models.download")}
              title={t("backend.models.download")}
            >
              {state?.status === "error" || state?.status === "cancelled" ? <IconRefresh /> : <IconDownload />}
            </Button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full flex-col select-none sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{t("backend.models.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("backend.models.title")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Input readOnly value={modelsFolder || t("backend.models.noFolder")} aria-invalid={!modelsFolder || undefined} className="flex-1" />
            <Button variant="outline" size="icon" onClick={handleChooseFolder} aria-label={t("backend.models.folderTitle")}>
              <IconFolderOpen />
            </Button>
          </div>
          {!modelsFolder && <p className="text-sm text-destructive">{t("backend.models.noFolderError")}</p>}
        </div>

        <div className="relative">
          <IconSearch className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("backend.models.filter")} className="pl-8 select-text" />
        </div>

        <ScrollArea
          className="relative h-96 w-full overflow-hidden rounded-xl border bg-background
                     before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-4
                     before:bg-linear-to-b/oklab before:from-background before:to-background/0 before:opacity-0 before:transition-opacity before:content-['']
                     data-[overflow-y-start]:before:opacity-100
                     after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-10 after:h-4
                     after:bg-linear-to-t/oklab after:from-background after:to-background/0 after:opacity-0 after:transition-opacity after:content-['']
                     data-[overflow-y-end]:after:opacity-100"
        >
          <div className="flex flex-col gap-4 p-4">
            {isError ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <span>{String(error).includes("No internet connection") ? t("backend.models.noInternetError") : t("backend.models.loadError")}</span>
                <Button variant="ghost" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                  {isFetching ? <IconLoader2 className="animate-spin" /> : <IconRefresh />}
                  {t("backend.models.retry")}
                </Button>
              </div>
            ) : isLoading || !remoteModels ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("backend.models.loading")}</div>
            ) : groupedModels.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("backend.models.noMatches")}</div>
            ) : (
              groupedModels.map((group) => {
                const isOpen = groupOverrides[group.value] ?? group.value === recommendedLabel
                return (
                  <Collapsible key={group.value} open={isOpen} onOpenChange={(open) => setGroupOpen(group.value, open)}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-1 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase outline-none hover:text-foreground">
                      {group.value}
                      <IconChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex flex-col gap-2 pt-2">{group.items.map((item) => renderModelCard(item))}</CollapsibleContent>
                  </Collapsible>
                )
              })
            )}
          </div>
          <ScrollBar className="z-20 mr-1 mt-4 pb-8" />
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("backend.models.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
