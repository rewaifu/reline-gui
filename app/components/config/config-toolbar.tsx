import { useContext, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { IconCheck, IconCopy, IconDownload, IconFileUpload } from "@tabler/icons-react"
import { FileUploadDialogContent } from "~/components/config/file-upload-dialog-content"
import { Button } from "~/components/ui/button"
import { Dialog, DialogTrigger } from "~/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Separator } from "~/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { NodesContext, NodesDispatchContext } from "~/context/contexts"
import { CONFIG_PRESETS, getPresetById } from "~/lib/config-presets.ts"
import { nodesToString, stringToNodes } from "~/lib/utils.ts"
import { usePrepareNodes } from "~/hooks/usePrepareNodes"
import { NodesActionType } from "~/types/actions.ts"

export function ConfigToolbar() {
  const { t } = useTranslation()
  const nodes = useContext(NodesContext)
  const dispatch = useContext(NodesDispatchContext)
  const prepareNodes = usePrepareNodes()

  const [isCopied, setIsCopied] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string>("default")

  const handlePresetChange = (value: string | null) => {
    if (!value) return
    setSelectedPreset(value)
    const preset = getPresetById(value)
    if (preset) {
      const preparedNodes = prepareNodes(preset.nodes)
      dispatch({
        type: NodesActionType.IMPORT,
        payload: preparedNodes,
      })
      toast.success(t("toasts.preset-loaded", { name: preset.name }))
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(nodesToString(nodes)).then(() => {
      setIsCopied(true)
      toast.success(t("toasts.copied"))
      setTimeout(() => {
        setIsCopied(false)
      }, 5000)
    })
  }

  const handleDownload = async () => {
    const data = nodesToString(nodes)
    if ("showSaveFilePicker" in window) {
      try {
        // @ts-ignore
        const handle = await window.showSaveFilePicker({
          suggestedName: "config.json",
          types: [
            {
              description: "JSON File",
              accept: { "application/json": [".json"] },
            },
          ],
        })

        const writable = await handle.createWritable()
        await writable.write(data)
        await writable.close()

        toast.success(t("toasts.saved"))
      } catch (err) {
        console.error(err)
      }
    } else {
      const blob = new Blob([data], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "config.json"
      link.click()
      URL.revokeObjectURL(url)
      toast.success(t("toasts.dl-started"))
    }
  }

  return (
    <div className="h-10 md:hidden bg-card rounded-xl ring-1 ring-foreground/10 p-1 mx-3">
      <div className="flex flex-row gap-1 items-center justify-center">
        <div className="flex flex-row gap-4 items-center">
          <Select value={selectedPreset} onValueChange={handlePresetChange}>
            <SelectTrigger size="sm" className="min-w-40 text-s self-center">
              <SelectValue placeholder={t("config-presets.select")} />
            </SelectTrigger>
            <SelectContent align="start">
              {CONFIG_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Separator orientation="vertical" className="mr-0.5" />
        </div>
        <Dialog>
          <Tooltip>
            <TooltipTrigger>
              <DialogTrigger
                render={
                  <Button size="icon" variant="ghost">
                    <IconFileUpload />
                  </Button>
                }
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("tooltips.import")}</p>
            </TooltipContent>
          </Tooltip>
          <FileUploadDialogContent
            onImport={(text) => {
              const parsedNodes = stringToNodes(text)
              const preparedNodes = prepareNodes(parsedNodes)
              dispatch({
                type: NodesActionType.IMPORT,
                payload: preparedNodes,
              })
            }}
          />
        </Dialog>
        <Tooltip>
          <TooltipTrigger>
            <Button size="icon" variant="ghost" onClick={handleCopy}>
              {isCopied ? <IconCheck /> : <IconCopy />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("tooltips.copy")}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <Button size="icon" variant="ghost" onClick={handleDownload}>
              <IconDownload />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("tooltips.download")}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
