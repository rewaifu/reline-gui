import { useContext, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { IconCheck, IconCopy, IconDownload, IconFileUpload } from "@tabler/icons-react"
import { ConfigCombobox } from "~/components/config/config-combobox"
import { FileUploadDialogContent } from "~/components/config/file-upload-dialog-content"
import { Button } from "~/components/ui/button"
import { Dialog, DialogTrigger } from "~/components/ui/dialog"
import { Separator } from "~/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { NodesContext, NodesDispatchContext } from "~/context/contexts"
import { nodesToString, stringToNodes } from "~/lib/utils.ts"
import { usePrepareNodes } from "~/hooks/usePrepareNodes"
import { NodesActionType } from "~/types/actions.ts"

export function ConfigToolbar() {
  const { t } = useTranslation()
  const nodes = useContext(NodesContext)
  const dispatch = useContext(NodesDispatchContext)
  const prepareNodes = usePrepareNodes()

  const [isCopied, setIsCopied] = useState(false)

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
          <ConfigCombobox />
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
