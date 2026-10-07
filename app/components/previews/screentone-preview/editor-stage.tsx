import { useTranslation } from "react-i18next"
import {
  IconArrowLeft,
  IconArrowsHorizontal,
  IconChevronDown,
  IconChevronUp,
  IconColumns,
  IconLoader2,
  IconPhoto,
  IconPlayerPlay,
} from "@tabler/icons-react"
import { PreviewCanvas } from "~/components/previews/preview-canvas"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { NumberInput } from "~/components/ui/number-input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Separator } from "~/components/ui/separator"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "~/components/ui/combobox"
import { cn } from "~/lib/utils"
import { CannyType, DotType, FilterType, ResizeType } from "~/types/enums"
import { AMBER_STYLE } from "./shared"
import type { ScreentonePreviewController } from "./useScreentonePreview"

const CANVAS_BUTTON_STYLE = { backgroundColor: "var(--secondary)", color: "var(--secondary-foreground)" }

export function ScreentoneEditorStage({ preview }: { preview: ScreentonePreviewController }) {
  const { t } = useTranslation()
  const {
    selected,
    previewSrc,
    afterSrc,
    compareMode,
    setCompareMode,
    returnToSelection,
    applying,
    canny,
    setCanny,
    cannyType,
    setCannyType,
    panelOpen,
    setPanelOpen,
    dotType,
    setDotType,
    angle,
    setAngle,
    dotSize,
    setDotSize,
    autoDot,
    ssaaScale,
    setSsaaScale,
    disableAutoDot,
    setDisableAutoDot,
    resizeEnabled,
    setResizeEnabled,
    resizeFilter,
    setResizeFilter,
    resizeType,
    setResizeType,
    resizeWidth,
    setResizeWidth,
    resizeHeight,
    setResizeHeight,
    resizePercent,
    setResizePercent,
    apply,
    applyToScreentoneNode,
    hasScreentoneNode,
    editorInput,
    controlsDisabled,
  } = preview

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={returnToSelection} disabled={applying}>
          <IconArrowLeft />
        </Button>
        <span className="truncate text-sm text-muted-foreground">{selected?.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {afterSrc && (
            <>
              <Button
                variant="outline"
                size="icon-sm"
                className={cn(compareMode === "single" && "ring-2 ring-primary")}
                onClick={() => setCompareMode("single")}
              >
                <IconPhoto />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                className={cn(compareMode === "slider" && "ring-2 ring-primary")}
                onClick={() => setCompareMode("slider")}
              >
                <IconArrowsHorizontal />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                className={cn(compareMode === "side" && "ring-2 ring-primary")}
                onClick={() => setCompareMode("side")}
              >
                <IconColumns />
              </Button>
            </>
          )}
        </div>
      </div>

      <PreviewCanvas previewSrc={previewSrc} beforeSrc={selected?.url ?? null} afterSrc={afterSrc} mode={compareMode}>
        {hasScreentoneNode && (
          <Button variant="outline" size="sm" style={CANVAS_BUTTON_STYLE} className="absolute bottom-2 right-2 z-10" onClick={applyToScreentoneNode}>
            {t("screentone-preview.apply-to-node", { node: t("nodes.node-type-options.screentone") })}
          </Button>
        )}
      </PreviewCanvas>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 select-none">
            <Checkbox id="screentone-preview-canny" checked={canny} onCheckedChange={(value) => setCanny(!!value)} />
            <Label htmlFor="screentone-preview-canny" className="cursor-pointer text-sm whitespace-nowrap">
              {t("screentone-preview.canny")}
            </Label>
          </div>
          <Select value={cannyType} onValueChange={(value) => setCannyType(value as CannyType)} disabled={!canny}>
            <SelectTrigger className="w-[180px] shrink-0">
              <SelectValue>{t(`nodes.sharp.canny-type-options.${cannyType}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.values(CannyType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`nodes.sharp.canny-type-options.${type}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            onClick={() => setPanelOpen((value) => !value)}
            title={t("screentone-preview.toggle-panel")}
          >
            {panelOpen ? <IconChevronUp /> : <IconChevronDown />}
          </Button>
        </div>

        {panelOpen && (
          <>
            <Separator />

            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1">
                <div className="flex flex-col gap-2">
                  <Label>{t("screentone-preview.dot-type")}</Label>
                  <Select value={dotType} onValueChange={(value) => setDotType(value as DotType)}>
                    <SelectTrigger className="w-full min-w-[180px]">
                      <SelectValue>{t(`nodes.screentone.dot-type-options.${dotType}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.values(DotType).map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`nodes.screentone.dot-type-options.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex-1">
                <NumberInput
                  min={0}
                  max={360}
                  step={1}
                  labelText={t("screentone-preview.angle")}
                  value={angle}
                  onChange={(value) => setAngle(Math.trunc(value))}
                />
              </div>
              <div className="flex-1">
                <div className="flex flex-col gap-2">
                  <Label>{t("screentone-preview.dot-size")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="min-w-[100px]"
                      step="1"
                      min="0"
                      value={dotSize}
                      onChange={(event) => setDotSize(Number.parseInt(event.target.value) || 0)}
                    />
                    {autoDot !== null && <span className="text-sm text-muted-foreground tabular-nums">~{autoDot}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-2">
                <Label>{t("screentone-preview.ssaa-scale")}</Label>
                <Input
                  type="number"
                  className="w-[180px]"
                  step="0.1"
                  min="1"
                  value={ssaaScale ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value
                    if (raw === "") {
                      setSsaaScale(undefined)
                      return
                    }
                    const numeric = Number.parseFloat(raw)
                    setSsaaScale(Number.isFinite(numeric) && numeric > 1 ? numeric : undefined)
                  }}
                />
              </div>
              <div className="flex h-8 items-center gap-2 select-none">
                <Checkbox id="screentone-preview-auto-dot" checked={disableAutoDot} onCheckedChange={(value) => setDisableAutoDot(!!value)} />
                <Label htmlFor="screentone-preview-auto-dot" className="cursor-pointer text-sm whitespace-nowrap">
                  {t("screentone-preview.auto-dot")}
                </Label>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 select-none">
                <Checkbox id="screentone-preview-resize" checked={resizeEnabled} onCheckedChange={(value) => setResizeEnabled(!!value)} />
                <Label htmlFor="screentone-preview-resize" className="cursor-pointer text-sm whitespace-nowrap">
                  {t("nodes.node-type-options.resize")}
                </Label>
              </div>

              {resizeEnabled && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex w-[180px] flex-col gap-2">
                    <Label>{t("nodes.resize.filter")}</Label>
                    <Combobox items={Object.values(FilterType)} value={resizeFilter} onValueChange={(value) => setResizeFilter(value as FilterType)}>
                      <ComboboxInput placeholder={t("nodes.resize.select-filter")} showTrigger />
                      <ComboboxContent>
                        <ComboboxEmpty>{t("nodes.resize.no-items-found")}</ComboboxEmpty>
                        <ComboboxList>
                          {(opt) => (
                            <ComboboxItem key={opt} value={opt}>
                              {opt}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>{t("nodes.resize.resize-type")}</Label>
                    <Select value={resizeType} onValueChange={(value) => setResizeType(value as ResizeType)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue>{t(`nodes.resize.resize-type-options.${resizeType}`)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {Object.values(ResizeType).map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`nodes.resize.resize-type-options.${type}`)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {(resizeType === ResizeType.BY_WIDTH || resizeType === ResizeType.ABSOLUTE) && (
                    <div className="flex flex-col gap-2">
                      <Label>{t("nodes.resize.width")}</Label>
                      <Input
                        type="number"
                        className="w-[180px]"
                        step="1"
                        min="1"
                        value={resizeWidth}
                        onChange={(event) => setResizeWidth(Number.parseInt(event.target.value))}
                      />
                    </div>
                  )}

                  {(resizeType === ResizeType.BY_HEIGHT || resizeType === ResizeType.ABSOLUTE) && (
                    <div className="flex flex-col gap-2">
                      <Label>{t("nodes.resize.height")}</Label>
                      <Input
                        type="number"
                        className="w-[180px]"
                        step="1"
                        min="1"
                        value={resizeHeight}
                        onChange={(event) => setResizeHeight(Number.parseInt(event.target.value))}
                      />
                    </div>
                  )}

                  {resizeType === ResizeType.PERCENT && (
                    <div className="flex flex-col gap-2">
                      <Label>{t("nodes.resize.percent")}</Label>
                      <Input
                        type="number"
                        className="w-[180px]"
                        step="0.1"
                        min="0"
                        value={resizePercent}
                        onChange={(event) => setResizePercent(Number.parseFloat(event.target.value))}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button
              variant={applying ? "outline" : "default"}
              className={cn("w-full", applying && "disabled:opacity-100")}
              style={applying ? AMBER_STYLE : undefined}
              onClick={() => void apply()}
              disabled={!editorInput || controlsDisabled}
            >
              {applying ? <IconLoader2 className="animate-spin" /> : <IconPlayerPlay />}
              {applying ? t("screentone-preview.processing") : t("screentone-preview.apply")}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
