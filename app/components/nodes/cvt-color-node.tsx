import { useContext, type Dispatch } from "react"
import type { NodesAction } from "~/types/actions.ts"
import { NodesContext, NodesDispatchContext } from "~/context/contexts.ts"
import { CvtType } from "~/types/enums"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Label } from "../ui/label"
import { NodesActionType } from "~/types/actions.ts"
import type { CvtColorNodeOptions } from "~/types/options"
import {useTranslation} from "react-i18next"

export function CvtColorNodeBody({ id, dispatch: dispatchProp }: { id: number; dispatch?: Dispatch<NodesAction> }) {
  const {t} = useTranslation()
  const nodes = useContext(NodesContext)
  const node = nodes.find((item) => item.id === id)
  if (!node) {
    return null
  }
  const options = node.options as CvtColorNodeOptions
  const contextDispatch = useContext(NodesDispatchContext)
  const dispatch = dispatchProp ?? contextDispatch
  const changeValue = (newOptions: Partial<CvtColorNodeOptions>) => {
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
    <div className="flex flex-col gap-2">
      <Label>{t('nodes.cvt.cvt-type')}</Label>
      <Select
        onValueChange={(value) => {
          changeValue({
            cvt_type: value as CvtType,
          })
        }}
        value={options.cvt_type}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {Object.values(CvtType).map((type) => {
              return (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              )
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
