import {useContext, useEffect, useState, type Dispatch, type ReactNode} from "react"
import type { NodesAction } from "~/types/actions.ts"
import {NodesContext, NodesDispatchContext} from "~/context/contexts.ts"
import {Label} from "../ui/label"
import {Input} from "../ui/input"
import type {FolderReaderNodeOptions, ScreentoneNodeOptions} from "~/types/options"
import {NodesActionType} from "~/types/actions.ts"
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select.tsx"
import {DotType, HalftoneMode, FilterType, NodeType} from "~/types/enums.ts"
import {NumberInput} from "~/components/ui/number-input.tsx"
import {DEFAULT_CANNY_TYPE, DEFAULT_HALFTONE_SSAA_FILTER} from "~/constants";
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "~/components/ui/combobox"
import {Checkbox} from "~/components/ui";
import {useTranslation} from "react-i18next"
import {Separator} from "~/components/ui/separator.tsx";
import {Field, FieldGroup, FieldLabel} from "~/components/ui/field.tsx";
import { Button } from "~/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { IconAlertTriangle, IconLoader2, IconWand } from "@tabler/icons-react"
import { toast } from "sonner"
import { useIsTauri } from "~/hooks/useIsTauri"
import { usePreferences } from "~/components/providers/preferences-provider"
import { computeAutoParams, detectDominantHeight } from "~/lib/screentone-auto"
import { ScreentoneAutoDialog } from "~/components/nodes/screentone-auto-dialog"

function AutoDotHint({ hint, className }: { hint: { text: string; tooltip: string }; className?: string }) {
    return (
        <Tooltip>
            <TooltipTrigger render={<span className={className}>{hint.text}</span>} />
            <TooltipContent>
                <p>{hint.tooltip}</p>
            </TooltipContent>
        </Tooltip>
    )
}

function WarningMessage({ children }: { children: ReactNode }) {
    return (
        <p className="flex items-start gap-1.5 text-sm text-yellow-600 select-none dark:text-yellow-400">
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{children}</span>
        </p>
    )
}

export function ScreentoneNodeBody({id, dispatch: dispatchProp, idSuffix}: { id: number; dispatch?: Dispatch<NodesAction>; idSuffix?: string }) {
    const {t} = useTranslation()
    const nodes = useContext(NodesContext)
    const isTauri = useIsTauri()
    const { screentoneUseSsaa, screentoneMinProduct, screentoneFractionalDot } = usePreferences()
    const [scanning, setScanning] = useState(false)
    const [autoDialogOpen, setAutoDialogOpen] = useState(false)
    const node = nodes.find((item) => item.id === id)
    if (!node) {
        return null
    }
    const options = node.options as ScreentoneNodeOptions
    useEffect(() => {
        const needsPatch =
            options.ssaa_filter === undefined

        if (needsPatch) {
            changeValue({
                ssaa_filter: options.ssaa_filter ?? DEFAULT_HALFTONE_SSAA_FILTER,
            })
        }
    }, [])
    const contextDispatch = useContext(NodesDispatchContext)
    const dispatch = dispatchProp ?? contextDispatch
    const sid = (baseId: string) => idSuffix ? `${baseId}-${idSuffix}` : `${baseId}-${id}`
    const changeValue = (newOptions: Partial<ScreentoneNodeOptions>) => {
        dispatch({
            type: NodesActionType.CHANGE,
            payload: {
                ...node,
                options: {
                    ...node.options,
                    ...newOptions,
                },
            },
        })
    }

    const showAutoParams = !idSuffix && dispatchProp === undefined

    const applyAutoParams = (height: number) => {
        const params = computeAutoParams(height, {
            useSsaa: screentoneUseSsaa,
            minProduct: screentoneMinProduct,
            fractionalDot: screentoneFractionalDot,
        })
        const currentDot = options.dot_size
        changeValue({
            dot_size: Array.isArray(currentDot) ? currentDot.map(() => params.dot_size) : params.dot_size,
            ssaa_scale: params.ssaa_scale,
            disable_auto_dot: params.disable_auto_dot,
        })
        toast.success(t('nodes.screentone.auto-applied', { height, dot: params.dot_size }))
    }

    const handleAutoParams = async () => {
        if (scanning) return
        if (!isTauri) {
            setAutoDialogOpen(true)
            return
        }
        const reader = nodes.find((item) => item.type === NodeType.FOLDER_READER)
        const readerPath = reader ? (reader.options as FolderReaderNodeOptions).path : ""
        if (!readerPath.trim()) {
            toast.error(t('nodes.screentone.auto-no-path'))
            return
        }
        setScanning(true)
        try {
            const detected = await detectDominantHeight(readerPath)
            if (detected.status === "not-found") {
                toast.error(t('nodes.screentone.auto-folder-not-found'))
                return
            }
            if (detected.status === "empty") {
                toast.error(t('nodes.screentone.auto-no-images'))
                return
            }
            if (detected.status !== "ok") {
                toast.error(t('nodes.screentone.auto-failed'))
                return
            }
            applyAutoParams(detected.height)
        } catch (error) {
            console.error("Failed to auto-detect screentone params:", error)
            toast.error(t('nodes.screentone.auto-failed'))
        } finally {
            setScanning(false)
        }
    }

    const mode = options.halftone_mode
    const channelCount = mode === "cmyk" ? 4 : mode === "rgb" ? 3 : 1

    const ensureArray = <T, >(value: T | T[], length: number, fallback: T): T[] => {
        if (Array.isArray(value)) return value.length === length ? value : Array(length).fill(fallback)
        return Array(length).fill(value)
    }

    const getEffectiveDot = (dot: number): number => {
        const ssaa = options.ssaa_scale
        if (!ssaa || ssaa <= 1) return dot
        if (options.disable_auto_dot === true) return dot / ssaa
        return Math.floor(dot * ssaa)
    }

    const getAutoDotHint = (dot: number): { text: string; tooltip: string } | null => {
        const ssaa = options.ssaa_scale
        if (!ssaa || ssaa <= 1) return null
        if (options.disable_auto_dot === true) {
            return {
                text: `~${(dot / ssaa).toFixed(1)}`,
                tooltip: t('nodes.screentone.auto-dot-effective-tooltip')
            }
        }
        return {
            text: `~${Math.floor(dot * ssaa)}`,
            tooltip: t('nodes.screentone.auto-dot-multiplied-tooltip')
        }
    }

    const dotSizes = ensureArray(options.dot_size, channelCount, 6)
    const angles = ensureArray(options.angle, channelCount, 45)
    const dotTypes = ensureArray(options.dot_type, channelCount, DotType.CIRCLE)

    const isSmallDot = (dot: number) => {
        if (!Number.isFinite(dot)) return false
        if (options.disable_auto_dot === true) return dot < 7
        return getEffectiveDot(dot) < 7
    }
    const smallDotWarning = dotSizes.some(isSmallDot)
    const ssaaEnabled = options.ssaa_scale != null && options.ssaa_scale > 1
    const dotWarningText = ssaaEnabled ? t('nodes.screentone.dot-size-ssaa-warning') : t('nodes.screentone.dot-size-no-ssaa-warning')
    const largeSsaaWarning = options.ssaa_scale != null && options.ssaa_scale > 4

    const updateArrayField = <T, >(
        key: keyof ScreentoneNodeOptions,
        index: number,
        value: T
    ) => {
        const current = ensureArray(options[key] as T | T[], channelCount, value)
        const updated = [...current]
        updated[index] = value
        changeValue({[key]: updated} as any)
    }

    const channelLabels = mode === "cmyk" ? ["C", "M", "Y", "K"] : mode === "rgb" ? ["R", "G", "B"] : []

    const renderDotOptionsArray = () => {
        return (
            <div className="flex flex-wrap gap-4">
                {[...Array(channelCount)].map((_, i) => (
                    <div key={i} className="grow shrink basis-[11rem] min-w-[11rem] border rounded-xl p-4 flex flex-col gap-4">
                        <Label className="self-center font-medium">
                            {channelLabels[i] ?? `${t('nodes.screentone.channel')} ${i + 1}`}
                        </Label>
                        <Separator />
                        <div className="flex flex-col gap-4 min-w-0">
                            <div className="flex flex-col gap-2">
                                <Label>{t('nodes.screentone.dot-size')}</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        className="min-w-0"
                                        step={1}
                                        min={0}
                                        aria-invalid={isSmallDot(dotSizes[i]) || undefined}
                                        value={dotSizes[i]}
                                        onChange={(e) => updateArrayField("dot_size", i, Number.parseInt(e.target.value))}
                                    />
                                    {(() => {
                                        const hint = getAutoDotHint(dotSizes[i])
                                        return hint ? <AutoDotHint hint={hint} className="text-sm text-muted-foreground shrink-0" /> : null
                                    })()}
                                </div>
                            </div>
                            <NumberInput
                                min={0}
                                max={360}
                                step={1}
                                labelText={t('nodes.screentone.angle')}
                                value={angles[i]}
                                onChange={(value) => updateArrayField("angle", i, Math.trunc(value))}
                            />
                            <div className="flex flex-col gap-2 min-w-0">
                                <Label>{t('nodes.screentone.dot-type')}</Label>
                                <Select
                                    onValueChange={(value) => updateArrayField("dot_type", i, value as DotType)}
                                    value={dotTypes[i]}
                                >
                                    <SelectTrigger className="w-full min-w-0">
                                        <SelectValue>{t(`nodes.screentone.dot-type-options.${dotTypes[i]}`)}</SelectValue>
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
                    </div>
                ))}
            </div>
        )
    }
    const filterOptions = Object.values(FilterType)

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-2">
                <Label>{t('nodes.screentone.halftone-mode')}</Label>
                <Select
                    onValueChange={(value) => {
                        const newMode = value as HalftoneMode
                        let newOptions: Partial<ScreentoneNodeOptions>

                        if (newMode === "rgb" || newMode === "cmyk") {
                            const channels = newMode === "cmyk" ? 4 : 3
                            const prevDotTypes = Array.isArray(options.dot_type)
                                ? options.dot_type
                                : [options.dot_type]

                            newOptions = {
                                halftone_mode: newMode,
                                dot_size: Array(channels).fill(7),
                                angle: Array(channels).fill(0),
                                dot_type: Array.from({ length: channels }, (_, i) =>
                                    prevDotTypes[i] ?? DotType.CIRCLE
                                ),
                            }
                        } else {
                            newOptions = {
                                halftone_mode: newMode,
                                dot_size: 7,
                                angle: 0,
                                dot_type: DotType.CIRCLE,
                            }
                        }

                        changeValue(newOptions)
                    }}
                    value={options.halftone_mode}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue>{t(`nodes.screentone.halftone-mode-options.${options.halftone_mode}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {Object.values(HalftoneMode).map((type) => (
                                <SelectItem key={type} value={type}>
                                    {t(`nodes.screentone.halftone-mode-options.${type}`)}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
                </div>
                {showAutoParams && (
                    <Button variant="outline" onClick={() => void handleAutoParams()} disabled={scanning}>
                        {scanning ? <IconLoader2 className="animate-spin" /> : <IconWand />}
                        {t('nodes.screentone.auto-params')}
                    </Button>
                )}
            </div>
            <Separator/>

            {(mode === "rgb" || mode === "cmyk") ? (
                <>
                    {renderDotOptionsArray()}
                    {smallDotWarning && (
                        <WarningMessage>{dotWarningText}</WarningMessage>
                    )}
                </>
            ) : (
                <>
                    <div className="flex flex-col md:flex-row gap-4 w-full md:items-center">
                    <div className="flex-1">
                        <div className="flex flex-col gap-2">
                            <Label>{t('nodes.screentone.dot-type')}</Label>
                            <Select
                                onValueChange={(value) => {
                                    changeValue({
                                        dot_type: value as DotType,
                                    })
                                }}
                                value={options.dot_type as DotType}
                            >
                                <SelectTrigger className="min-w-[100px] w-full">
                                    <SelectValue>{t(`nodes.screentone.dot-type-options.${options.dot_type as DotType}`)}</SelectValue>
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
                        <div className="-mb-2">
                            <NumberInput
                                min={0}
                                max={360}
                                step={1}
                                labelText={t('nodes.screentone.angle')}
                                value={options.angle as number}
                                onChange={(value) => {
                                    changeValue({angle: Math.trunc(value)})
                                }}
                            />
                        </div>
                    </div>
                    <div className="flex-1">
                        <div className="flex flex-col gap-2">
                            <Label>{t('nodes.screentone.dot-size')}</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    className="min-w-[100px]"
                                    step="1"
                                    min="0"
                                    aria-invalid={isSmallDot(options.dot_size as number) || undefined}
                                    value={options.dot_size as number}
                                    onChange={(e) => {
                                        changeValue({
                                            dot_size: Number.parseInt(e.target.value),
                                        })
                                    }}
                                />
                                {(() => {
                                    const hint = getAutoDotHint(options.dot_size as number)
                                    return hint ? <AutoDotHint hint={hint} className="text-sm text-muted-foreground text-right tabular-nums" /> : null
                                })()}
                            </div>
                        </div>
                    </div>
                    </div>
                    {smallDotWarning && (
                        <WarningMessage>{dotWarningText}</WarningMessage>
                    )}
                </>
            )}
            <Separator/>
            <div className="flex flex-col md:flex-row gap-4">
                <div className="w-[180px]">
                    <div className="flex flex-col gap-2">
                        <Label>{t('nodes.screentone.ssaa-scale')}</Label>
                        <Input
                            type="number"
                            className="min-w-[180px]"
                            step="0.1"
                            min="1"
                            aria-invalid={largeSsaaWarning || undefined}
                            decrementDisabled={options.ssaa_scale == null}
                            placeholder={t('nodes.screentone.ssaa-scale-placeholder')}
                            value={options.ssaa_scale ?? ""}
                            onBlur={() => {
                                const value = options.ssaa_scale
                                if (value != null && value < 1.1) {
                                    changeValue({ssaa_scale: undefined})
                                }
                            }}
                            onChange={(e) => {
                                const raw = e.target.value

                                if (raw === "") {
                                    changeValue({ssaa_scale: undefined})
                                    return
                                }

                                const num = Number.parseFloat(raw)
                                if (num === 1 && !options.ssaa_scale) {
                                    changeValue({ssaa_scale: 1.1})
                                    return
                                }
                                if (num <= 1) {
                                    changeValue({ssaa_scale: undefined})
                                    return
                                }

                                changeValue({ssaa_scale: Number(num.toFixed(2))})
                            }}
                        />
                    </div>
                </div>
                <div className="flex-1">
                    <div className="flex flex-col gap-2">
                        <Label>{t('nodes.screentone.ssaa-filter')}</Label>
                        <Combobox
                            items={filterOptions}
                            value={options.ssaa_filter ?? null}
                            onValueChange={(value) =>
                                changeValue({ssaa_filter: value as FilterType})
                            }
                        >
                            <ComboboxInput placeholder={t('nodes.resize.select-filter')} showTrigger />
                            <ComboboxContent>
                                <ComboboxEmpty>{t('nodes.resize.no-items-found')}</ComboboxEmpty>
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
                </div>
            </div>
            {largeSsaaWarning && (
                <WarningMessage>{t('nodes.screentone.ssaa-scale-large-warning')}</WarningMessage>
            )}
            <FieldGroup>
                <Field orientation="horizontal">
                    <Checkbox
                        id = {sid("auto-dot-check")}
                        checked={options.disable_auto_dot === true}
                        onCheckedChange={(value) => {
                            changeValue({disable_auto_dot: value === true ? true : undefined})
                        }}
                    />
                    <FieldLabel htmlFor={sid("auto-dot-check")}>{t('nodes.screentone.disable-auto-dot')}</FieldLabel>
                </Field>
            </FieldGroup>
            {showAutoParams && !isTauri && (
                <ScreentoneAutoDialog open={autoDialogOpen} onOpenChange={setAutoDialogOpen} onApply={applyAutoParams} />
            )}
        </div>
    )
}
