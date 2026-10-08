import { useContext, type Dispatch } from "react"
import type { NodesAction } from "~/types/actions.ts"
import { NodesContext, NodesDispatchContext } from "~/context/contexts.ts"
import { WriterNodeFormat } from "~/types/enums.ts"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import type { FolderWriterNodeOptions } from "~/types/options"
import { NodesActionType } from "~/types/actions.ts"
import {useTranslation} from "react-i18next"
import {useIsTauri} from "~/hooks/useIsTauri"
import {IconFolderOpen} from "@tabler/icons-react"
import {Button} from "~/components/ui/button"

export function FolderWriterNodeBody({ id, dispatch: dispatchProp }: { id: number; dispatch?: Dispatch<NodesAction> }) {
  const {t} = useTranslation()
  const isTauri = useIsTauri()
  const nodes = useContext(NodesContext)
  const node = nodes.find((item) => item.id === id)
  if (!node) {
    return null
  }
  const options = node.options as FolderWriterNodeOptions
  const contextDispatch = useContext(NodesDispatchContext)
  const dispatch = dispatchProp ?? contextDispatch
  const changeValue = (newOptions: Partial<FolderWriterNodeOptions>) => {
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

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const folder = await open({ directory: true, multiple: false, title: t('nodes.folder-writer.path') })
      if (folder) {
        changeValue({ path: folder as string })
      }
    } catch (err) {
      console.error("Folder dialog failed:", err)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col space-y-2">
        <Label>{t('nodes.folder-writer.path')}</Label>
        <div className="flex items-center gap-2">
          <Input
            className="flex-1"
            placeholder={t('nodes.folder-writer.placeholder')}
            value={options.path}
            onChange={(e) => {
              changeValue({ path: e.target.value })
            }}
          />
          {isTauri && (
            <Button variant="outline" size="icon" onClick={handleBrowse}>
              <IconFolderOpen className="size-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col space-y-2">
        <Label>{t('nodes.folder-writer.format')}</Label>
        <Select
          onValueChange={(value) => {
            changeValue({
              format: value as WriterNodeFormat,
            })
          }}
          value={options.format}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {Object.values(WriterNodeFormat).map((type) => {
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
    </div>
  )
}
