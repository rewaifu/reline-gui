import {useContext, type Dispatch} from "react"
import type { NodesAction } from "~/types/actions"
import {NodesContext, NodesDispatchContext} from "~/context/contexts"
import {NumberInput} from "../ui/number-input"
import {Checkbox} from "../ui/checkbox"
import {Label} from "../ui/label"
import {NodesActionType} from "~/types/actions"
import type {SharpNodeOptions} from "~/types/options"
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select"
import {CannyType} from "~/types/enums"
import {DEFAULT_CANNY_TYPE} from "~/constants"
import {FieldGroup, FieldLabel, Field} from "~/components/ui/field.tsx";
import {Separator} from "~/components/ui/separator.tsx";
import {useTranslation} from "react-i18next"

export function SharpNodeBody({id, dispatch: dispatchProp, idSuffix}: { id: number; dispatch?: Dispatch<NodesAction>; idSuffix?: string }) {
    const {t} = useTranslation()
    const nodes = useContext(NodesContext)
    const node = nodes.find((item) => item.id === id)
    if (!node) {
        return null
    }
    const options = node.options as SharpNodeOptions
    const contextDispatch = useContext(NodesDispatchContext)
    const dispatch = dispatchProp ?? contextDispatch
    const sid = (baseId: string) => idSuffix ? `${baseId}-${idSuffix}` : `${baseId}-${id}`
    const changeValue = (newOptions: Partial<SharpNodeOptions>) => {
        dispatch({
            type: NodesActionType.CHANGE,
            payload: {
                ...node,
                options: {
                    ...options,
                    ...newOptions,
                },
            },
        })
    }
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-4">

                {/* Low and High input container */}
                <div className="flex flex-col md:flex-row gap-4 w-full">
                    <div className="flex-1">
                        <NumberInput
                            min={0}
                            max={255}
                            step={1}
                            labelText={t('nodes.sharp.low-input')}
                            value={options.low_input}
                            onChange={(value) => {
                                changeValue({low_input: Math.trunc(value)})
                            }}
                        />
                    </div>
                    <div className="flex-1">
                        <NumberInput
                            min={0}
                            max={255}
                            step={1}
                            labelText={t('nodes.sharp.high-input')}
                            value={options.high_input}
                            onChange={(value) => {
                                changeValue({high_input: Math.trunc(value)})
                            }}
                        />
                    </div>
                </div>
                <Separator />

                {/* Gamma */}
                <div className="flex-1">
                    <NumberInput
                        min={0}
                        max={10}
                        step={0.1}
                        labelText={t('nodes.sharp.gamma')}
                        value={options.gamma}
                        onChange={(value) => {
                            changeValue({gamma: value})
                        }}
                    />
                </div>
                <Separator/>

                {/* Diapason White and Black container */}
                <div className="flex flex-col md:flex-row gap-4 w-full">
                    <div className="flex-1">
                        <NumberInput
                            min={-1}
                            max={255}
                            step={1}
                            labelText={t('nodes.sharp.diapason-white')}
                            value={options.diapason_white}
                            onChange={(value) => {
                                changeValue({diapason_white: Math.trunc(value)})
                            }}
                        />
                    </div>
                    <div className="flex-1">
                        <NumberInput
                            min={-1}
                            max={255}
                            step={1}
                            labelText={t('nodes.sharp.diapason-black')}
                            value={options.diapason_black}
                            onChange={(value) => {
                                changeValue({diapason_black: Math.trunc(value)})
                            }}
                        />
                    </div>
                </div>

            </div>
            <Separator/>

            {/* Canny */}
            <FieldGroup className="w-25">
                <Field orientation="horizontal">
                    <Checkbox
                        id={sid("canny-check")}
                        checked={options.canny}
                        onCheckedChange={(value) => {
                            changeValue({canny: !!value, canny_type: value ? DEFAULT_CANNY_TYPE : undefined})
                        }}
                    />
                    <FieldLabel htmlFor={sid("canny-check")}>{t('nodes.sharp.canny')}</FieldLabel>
                </Field>
            </FieldGroup>
            {options.canny && (
                <div className="flex flex-col gap-2">
                    <Label>{t('nodes.sharp.canny-type')}</Label>
                    <Select
                        onValueChange={(value) => {
                            changeValue({
                                canny_type: value as CannyType,
                            })
                        }}
                        value={options.canny_type}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue>{t(`nodes.sharp.canny-type-options.${options.canny_type}`)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                {Object.values(CannyType).map((type) => {
                                    return (
                                        <SelectItem key={type} value={type}>
                                            {t(`nodes.sharp.canny-type-options.${type}`)}
                                        </SelectItem>
                                    )
                                })}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>
            )}
        </div>
    )
}
