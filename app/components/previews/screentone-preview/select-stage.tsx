import { useTranslation } from "react-i18next"
import { IconLoader2, IconPlayerPlay } from "@tabler/icons-react"
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
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { cn } from "~/lib/utils"
import { DType, TilerType } from "~/types/enums"
import { ModelsPicker } from "./models-picker"
import { AMBER_STYLE, SMALL_IMAGE_HEIGHT } from "./shared"
import type { ScreentonePreviewController } from "./useScreentonePreview"

export function ScreentoneSelectStage({ preview }: { preview: ScreentonePreviewController }) {
  const { t } = useTranslation()
  const {
    selected,
    sortedModels,
    model,
    setModel,
    hasModels,
    tiler,
    setTiler,
    tileSize,
    setTileSize,
    dtype,
    setDtype,
    preprocessing,
    runPreprocess,
    requestSkip,
    interfaceBusy,
    controlsDisabled,
    depsReady,
    skipConfirmOpen,
    setSkipConfirmOpen,
    performSkip,
  } = preview

  if (!selected) return null

  return (
    <div className="flex h-full min-h-0 gap-3 rounded-xl border p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-1 min-h-0 overflow-y-auto">
          <div className="m-auto flex w-full max-w-md flex-col items-center gap-4 py-2">
            <img src={selected.url} alt={selected.name} className="max-h-48 max-w-full rounded-lg border object-contain" />
            <p className="max-w-full truncate text-sm font-medium">{selected.name}</p>

            <div className="flex w-full max-w-md flex-col gap-1.5">
              <Label>{t("screentone-preview.select-model")}</Label>
              <ModelsPicker
                items={sortedModels}
                value={model}
                onChange={setModel}
                disabled={!hasModels}
                placeholder={t("screentone-preview.select-model")}
              />
              {!hasModels && <p className="text-xs text-destructive">{t("screentone-preview.no-models")}</p>}
            </div>

            <div className="flex w-full max-w-md flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 flex flex-col gap-2">
                <Label>{t("screentone-preview.tiler")}</Label>
                <Select value={tiler} onValueChange={(value) => setTiler(value as TilerType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{t(`nodes.upscale.tiler-options.${tiler}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.values(TilerType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`nodes.upscale.tiler-options.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {tiler === TilerType.EXACT && (
                <div className="flex-1 flex flex-col gap-2">
                  <Label>{t("screentone-preview.tile-size")}</Label>
                  <Input
                    type="number"
                    step={100}
                    min={0}
                    value={tileSize}
                    onChange={(event) => setTileSize(Number.parseInt(event.target.value) || 0)}
                  />
                </div>
              )}
              <div className="flex-1 flex flex-col gap-2">
                <Label>{t("screentone-preview.dtype")}</Label>
                <Select value={dtype} onValueChange={(value) => setDtype(value as DType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.values(DType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex w-full max-w-md flex-col gap-2">
              <Button
                variant={preprocessing ? "outline" : "default"}
                className={cn(preprocessing && "disabled:opacity-100")}
                style={preprocessing ? AMBER_STYLE : undefined}
                onClick={() => void runPreprocess()}
                disabled={!model || controlsDisabled}
              >
                {preprocessing ? <IconLoader2 className="animate-spin" /> : <IconPlayerPlay />}
                {preprocessing ? t("screentone-preview.processing") : t("screentone-preview.run")}
              </Button>
              <Button variant="secondary" onClick={requestSkip} disabled={interfaceBusy}>
                {t("screentone-preview.skip")}
              </Button>
              {!depsReady && <p className="text-center text-xs text-muted-foreground">{t("screentone-preview.no-deps")}</p>}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={skipConfirmOpen} onOpenChange={setSkipConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("screentone-preview.skip-confirm-title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("screentone-preview.skip-confirm-desc", { height: SMALL_IMAGE_HEIGHT })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("screentone-preview.skip-confirm-cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSkipConfirmOpen(false)
                performSkip()
              }}
            >
              {t("screentone-preview.skip-confirm-confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
