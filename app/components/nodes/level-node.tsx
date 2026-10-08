import {useContext, type Dispatch} from "react"
import type { NodesAction } from "~/types/actions.ts"
import {NodesContext, NodesDispatchContext} from "../../context/contexts"
import {NumberInput} from "../ui/number-input"
import type {LevelNodeOptions} from "~/types/options"
import {NodesActionType} from "~/types/actions.ts"
import { Separator } from "../ui/separator"
import {useTranslation} from "react-i18next"

export function LevelNodeBody({id, dispatch: dispatchProp}: { id: number; dispatch?: Dispatch<NodesAction> }) {
    const {t} = useTranslation()
    const nodes = useContext(NodesContext)
    const node = nodes.find((item) => item.id === id)
    if (!node) {
        return null
    }
    const options = node.options as LevelNodeOptions
    const contextDispatch = useContext(NodesDispatchContext)
    const dispatch = dispatchProp ?? contextDispatch
    const changeValue = (newOptions: Partial<LevelNodeOptions>) => {
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
        <div className="flex flex-col gap-4">

            {/* Low and High input container */}
            <div className="flex flex-col md:flex-row gap-4 w-full">
                <div className="flex-1">
                    <NumberInput
                        min={0}
                        max={255}
                        step={1}
                        labelText={t('nodes.level.low-input')}
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
                        labelText={t('nodes.level.high-input')}
                        value={options.high_input}
                        onChange={(value) => {
                            changeValue({high_input: Math.trunc(value)})
                        }}
                    />
                </div>
            </div>
            <Separator/>

            {/* Gamma */}
            <div className="flex-1">
                <NumberInput
                    min={0}
                    max={10}
                    step={0.1}
                    labelText={t('nodes.level.gamma')}
                    value={options.gamma}
                    onChange={(value) => {
                        changeValue({gamma: value})
                    }}
                />
            </div>
            <Separator/>

            {/* Low and High Output container */}
            <div className="flex flex-col md:flex-row gap-4 w-full">
                <div className="flex-1">
                    <NumberInput
                        min={0}
                        max={255}
                        step={1}
                        labelText={t('nodes.level.low-output')}
                        value={options.low_output}
                        onChange={(value) => {
                            changeValue({low_output: Math.trunc(value)})
                        }}
                    />
                </div>
                <div className="flex-1">
                    <NumberInput
                        min={0}
                        max={255}
                        step={1}
                        labelText={t('nodes.level.high-output')}
                        value={options.high_output}
                        onChange={(value) => {
                            changeValue({high_output: Math.trunc(value)})
                        }}
                    />
                </div>
            </div>
        </div>
    )
}
