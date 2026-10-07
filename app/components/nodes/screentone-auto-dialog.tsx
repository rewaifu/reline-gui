import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { IconLoader2, IconPhoto } from "@tabler/icons-react"
import { toast } from "sonner"
import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Separator } from "~/components/ui/separator"
import { IMAGE_EXT } from "~/lib/image-files"
import { measureImageFileHeight } from "~/lib/screentone-auto"

export function ScreentoneAutoDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (height: number) => void
}) {
  const { t } = useTranslation()
  const [height, setHeight] = useState("")
  const [scanning, setScanning] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setHeight("")
      setScanning(false)
      setDragActive(false)
    }
  }, [open])

  const handleFile = async (file?: File) => {
    if (!file || scanning) return
    if (!file.type.startsWith("image/") && !IMAGE_EXT.test(file.name)) {
      toast.error(t("nodes.screentone.auto-not-image"))
      return
    }
    setScanning(true)
    try {
      const detected = await measureImageFileHeight(file)
      if (!detected) {
        toast.error(t("nodes.screentone.auto-failed"))
        return
      }
      onApply(detected)
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to read image height:", error)
      toast.error(t("nodes.screentone.auto-read-error"))
    } finally {
      setScanning(false)
    }
  }

  const parsedHeight = Number.parseInt(height, 10)
  const valid = Number.isFinite(parsedHeight) && parsedHeight > 0

  const applyManual = () => {
    if (!valid) return
    onApply(parsedHeight)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("nodes.screentone.auto-dialog-title")}</DialogTitle>
          <DialogDescription>{t("nodes.screentone.auto-dialog-description")}</DialogDescription>
        </DialogHeader>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
            event.target.value = ""
          }}
        />
        <button
          type="button"
          disabled={scanning}
          className={cn(
            "flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            dragActive ? "border-primary bg-primary/5" : "border-border bg-muted/40 hover:border-primary/60",
          )}
          onClick={() => fileInputRef.current?.click()}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setDragActive(false)
            void handleFile(event.dataTransfer.files?.[0])
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setDragActive(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setDragActive(false)
          }}
        >
          {scanning ? <IconLoader2 className="size-8 animate-spin text-muted-foreground" /> : <IconPhoto className="size-8 text-muted-foreground" />}
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("nodes.screentone.auto-upload")}</p>
            <p className="text-xs text-muted-foreground">{t("nodes.screentone.auto-drop-hint")}</p>
          </div>
        </button>
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">{t("nodes.screentone.auto-or")}</span>
          <Separator className="flex-1" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="screentone-auto-height">{t("nodes.screentone.auto-height-label")}</Label>
          <Input
            id="screentone-auto-height"
            type="number"
            min={1}
            step={1}
            value={height}
            placeholder={t("nodes.screentone.auto-height-placeholder")}
            onChange={(event) => setHeight(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyManual()
            }}
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t("nodes.screentone.auto-cancel")}</DialogClose>
          <Button disabled={!valid} onClick={applyManual}>
            {t("nodes.screentone.auto-apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
