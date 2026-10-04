import type { ChangeEvent, DragEvent } from "react"
import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Upload, FileJson, X, ClipboardPaste } from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

type FileUploadDialogContentProps = {
  onImport: (text: string) => void
}

export function FileUploadDialogContent({ onImport }: FileUploadDialogContentProps) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processContent = (content: string, source: string = "From clipboard") => {
    try {
      JSON.parse(content)
      setText(content)
      setFileName(source)
    } catch (err) {
      toast.error(t("toasts.invalid-json"))
    }
  }

  const handleFile = (file?: File) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith(".json")) {
      toast.error(t("toasts.only-json"))
      return
    }

    setFileName(file.name)

    file
      .text()
      .then((content) => processContent(content, file.name))
      .catch(() => {
        toast.error(t("toasts.unable-to-read"))
        clearFile()
      })
  }

  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        toast.error(t("toasts.clipboard-not-supported"))
        return
      }

      const clipboardText = await navigator.clipboard.readText()
      if (!clipboardText.trim()) {
        toast.error(t("toasts.clipboard-empty"))
        return
      }

      processContent(clipboardText)
    } catch (err: any) {
      console.error(err)
      toast.error(t("toasts.clipboard-read-failure"))
    }
  }

  const clearFile = () => {
    setText("")
    setFileName(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const onClickZone = () => {
    inputRef.current?.click()
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t("upload-dialog.upload-config")}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePasteFromClipboard}>
            <ClipboardPaste className="h-4 w-4" />
            {t("upload-dialog.paste")}
          </Button>
        </div>

        <div
          className={cn(
            "relative flex h-52 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 bg-muted/40",
            fileName ? "border-primary/40 bg-primary/5" : "",
          )}
          onClick={onClickZone}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              if (e.target.files?.[0]) {
                handleFile(e.target.files[0])
              }
            }}
          />

          <div className="pointer-events-none flex flex-col items-center gap-3 text-center">
            {fileName ? (
              <>
                <FileJson className="h-10 w-10 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground">{t("upload-dialog.loaded")}</p>
                </div>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {t("upload-dialog.dnd-1")} <br />
                    {t("upload-dialog.dnd-2")}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("upload-dialog.json")}</p>
                </div>
              </>
            )}
          </div>

          {fileName && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-3 top-3 h-7 w-7 rounded-full"
              onClick={(e) => {
                e.stopPropagation()
                clearFile()
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="ghost" onClick={clearFile} disabled={!fileName}>
          {t("upload-dialog.clear")}
        </Button>

        <DialogClose
          render={
            <Button type="button" disabled={text === ""} onClick={() => text && onImport(text)}>
              {t("upload-dialog.import")}
            </Button>
          }
        />
      </DialogFooter>
    </DialogContent>
  )
}
