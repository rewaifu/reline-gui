import {useContext, type Dispatch} from "react"
import type { NodesAction } from "~/types/actions"
import {NodesContext, NodesDispatchContext} from "~/context/contexts"
import {FilterType, ResizeType} from "~/types/enums"
import {Label} from "../ui/label"
import {DEFAULT_RESIZE_HEIGHT, DEFAULT_RESIZE_PERCENT, DEFAULT_RESIZE_WIDTH, DEFAULT_SPREAD_SIZE} from "~/constants"
import {Input} from "../ui/input"
import {Checkbox} from "../ui/checkbox"
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "../ui/select"
import type {ResizeNodeOptions} from "~/types/options"
import {NodesActionType} from "~/types/actions"
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "~/components/ui/combobox"
import {FieldGroup, FieldLabel, Field} from "~/components/ui/field.tsx";
import {useTranslation} from "react-i18next"

const renderSizeInput = (options: ResizeNodeOptions, changeValue: (newOptions: Partial<ResizeNodeOptions>) => void) => {
    const {t} = useTranslation()
    return (
        <div className="flex flex-col gap-2">
            {(options.resize_type === ResizeType.BY_WIDTH || options.resize_type === ResizeType.ABSOLUTE) && (
                <div className="flex flex-col gap-2">
                    <Label>{t('nodes.resize.width')}</Label>
                    <Input
                        type="number"
                        className="w-[180px]"
                        step={1}
                        min={1}
                        value={options.width}
                        onChange={(e) => {
                            changeValue({width: Number.parseInt(e.target.value)})
                        }}
                    />
                </div>
            )}
            {(options.resize_type === ResizeType.BY_HEIGHT || options.resize_type === ResizeType.ABSOLUTE) && (
                <div className="flex flex-col gap-2">
                    <Label>{t('nodes.resize.height')}</Label>
                    <Input
                        type="number"
                        className="w-[180px]"
                        step={1}
                        min={1}
                        value={options.height}
                        onChange={(e) => {
                            changeValue({height: Number.parseInt(e.target.value)})
                        }}
                    />
                </div>
            )}
            {options.resize_type === ResizeType.PERCENT && (
                <div className="flex flex-col gap-2">
                    <Label>{t('nodes.resize.percent')}</Label>
                    <Input
                        type="number"
                        className="w-[180px]"
                        step={0.1}
                        min={0}
                        value={options.percent}
                        onChange={(e) => {
                            changeValue({percent: Number.parseFloat(e.target.value)})
                        }}
                    />
                </div>
            )}
        </div>
    )
}

export function ResizeNodeBody({id, dispatch: dispatchProp, idSuffix}: { id: number; dispatch?: Dispatch<NodesAction>; idSuffix?: string }) {
    const {t} = useTranslation()
    const nodes = useContext(NodesContext)
    const node = nodes.find((item) => item.id === id)
    if (!node) {
        return null
    }
    const options = node.options as ResizeNodeOptions
    const contextDispatch = useContext(NodesDispatchContext)
    const dispatch = dispatchProp ?? contextDispatch
    const sid = (baseId: string) => idSuffix ? `${baseId}-${idSuffix}` : `${baseId}-${id}`
    const filterOptions = Object.values(FilterType)
    const changeValue = (newOptions: Partial<ResizeNodeOptions>) => {
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
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <Label>{t('nodes.resize.filter')}</Label>

                <Combobox
                    items={filterOptions}
                    value={options.filter ?? null}
                    onValueChange={(value) =>
                        changeValue({filter: value as FilterType})
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
            <div className="flex flex-col gap-2">
                <Label>{t('nodes.resize.resize-type')}</Label>
                <Select
                    onValueChange={(value) => {
                        changeValue({
                            width:
                                (value as ResizeType) === ResizeType.BY_WIDTH || (value as ResizeType) === ResizeType.ABSOLUTE
                                    ? options.width
                                        ? options.width
                                        : DEFAULT_RESIZE_WIDTH
                                    : undefined,
                            height:
                                (value as ResizeType) === ResizeType.BY_HEIGHT || (value as ResizeType) === ResizeType.ABSOLUTE
                                    ? options.height
                                        ? options.height
                                        : DEFAULT_RESIZE_HEIGHT
                                    : undefined,
                            percent: (value as ResizeType) === ResizeType.PERCENT ? (options.percent ? options.percent : DEFAULT_RESIZE_PERCENT) : undefined,
                            resize_type: value as ResizeType,
                        })
                    }}
                    value={options.resize_type}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue>{t(`nodes.resize.resize-type-options.${options.resize_type}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {Object.values(ResizeType).map((type) => {
                                return (
                                    <SelectItem key={type} value={type}>
                                        {t(`nodes.resize.resize-type-options.${type}`)}
                                    </SelectItem>
                                )
                            })}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>
            {renderSizeInput(options, changeValue)}
            <FieldGroup className="w-25">
                <Field orientation="horizontal">
                    <Checkbox
                        id={sid("spread-check")}
                        checked={options.spread}
                        onCheckedChange={(value) => {
                            changeValue({
                                spread: !!value,
                                spread_size: value ? DEFAULT_SPREAD_SIZE : undefined,
                            })
                        }}
                    />
                    <FieldLabel htmlFor={sid("spread-check")}>{t('nodes.resize.spread')}</FieldLabel>
                </Field>
            </FieldGroup>
            {options.spread && (
                <div className="flex flex-col gap-2">
                    <Label>{t('nodes.resize.spread-size')}</Label>
                    <Input
                        className="w-[180px]"
                        value={options.spread_size}
                        onChange={(e) => {
                            changeValue({spread_size: Number.parseInt(e.target.value)})
                        }}
                    />
                </div>
            )}
        </div>
    )
}
