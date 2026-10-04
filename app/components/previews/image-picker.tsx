import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { IconFolderSearch, IconLoader2, IconPhoto } from "@tabler/icons-react"
import { cn } from "~/lib/utils"
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area"
import { IMAGE_EXT, IMAGE_EXTENSIONS, baseName, joinPath, toBlobUrl } from "~/lib/image-files"

const MAX_THUMBS = 200
const THUMB_SIZE = 256

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("image load failed"))
    image.src = src
  })
}

async function makeThumbnail(image: HTMLImageElement, size = THUMB_SIZE): Promise<string> {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d")
  if (!context) return ""
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ""), "image/webp", 0.85)
  })
}

export function ImagePicker({
  isTauri,
  folderPath,
  onPickPath,
  onPickFile,
  className,
}: {
  isTauri: boolean
  folderPath: string
  onPickPath: (path: string) => void
  onPickFile?: (file: File) => void
  className?: string
}) {
  const { t } = useTranslation()
  const [folderImages, setFolderImages] = useState<string[]>([])
  const [folderLoading, setFolderLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onPickPathRef = useRef(onPickPath)
  onPickPathRef.current = onPickPath

  const hasFolder = isTauri && !!folderPath.trim()

  useEffect(() => {
    if (!hasFolder) {
      setFolderImages([])
      setFolderLoading(false)
      return
    }
    let cancelled = false
    setFolderLoading(true)
    const scan = async () => {
      try {
        const { readDir } = await import("@tauri-apps/plugin-fs")
        const entries = await readDir(folderPath)
        const files = entries
          .filter((entry) => entry.isFile && entry.name && IMAGE_EXT.test(entry.name))
          .map((entry) => joinPath(folderPath, entry.name))
          .slice(0, MAX_THUMBS)
        if (!cancelled) setFolderImages(files)
      } catch (error) {
        console.error("Failed to read folder:", error)
        if (!cancelled) setFolderImages([])
      } finally {
        if (!cancelled) setFolderLoading(false)
      }
    }
    void scan()
    return () => {
      cancelled = true
    }
  }, [hasFolder, folderPath])

  useEffect(() => {
    if (!isTauri) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    const register = async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview")
        const fn = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return
          const image = event.payload.paths.find((path) => IMAGE_EXT.test(path))
          if (image) onPickPathRef.current(image)
        })
        if (cancelled) fn()
        else unlisten = fn
      } catch (error) {
        console.error("Failed to register drag & drop:", error)
      }
    }
    void register()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [isTauri])

  const handleClick = async () => {
    if (isTauri) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog")
        const selected = await open({
          multiple: false,
          directory: false,
          filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
        })
        if (typeof selected === "string") onPickPathRef.current(selected)
      } catch (error) {
        console.error("Failed to open file dialog:", error)
      }
    } else {
      fileInputRef.current?.click()
    }
  }

  const folderPanel = hasFolder ? (
    <div className="flex w-1/2 min-w-0 shrink-0 flex-col rounded-lg border bg-muted/40">
      {folderLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
          {t("levels-preview.loading-images")}
        </div>
      ) : folderImages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-2 text-center text-xs text-muted-foreground select-none">
          <IconFolderSearch className="size-6" />
          {t("levels-preview.no-images", { node: t("nodes.node-type-options.folder_reader") })}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-3 content-start gap-1.5 p-2">
            {folderImages.map((path) => (
              <FolderThumb key={path} path={path} onSelect={() => onPickPathRef.current(path)} />
            ))}
          </div>
          <ScrollBar className="mr-0.5" />
        </ScrollArea>
      )}
    </div>
  ) : null

  return (
    <div className={cn("flex h-full min-h-0 gap-3 rounded-xl border p-3", className)}>
      {folderPanel}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file && onPickFile) onPickFile(file)
            event.target.value = ""
          }}
        />
        <button
          type="button"
          className={cn(
            "relative flex h-full w-full min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-border bg-muted/40 hover:border-primary/60",
          )}
          onClick={() => void handleClick()}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setDragActive(false)
            const file = event.dataTransfer.files?.[0]
            if (file && onPickFile) onPickFile(file)
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
          <IconPhoto className="size-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("levels-preview.upload-image")}</p>
            <p className="text-xs text-muted-foreground">{t("levels-preview.drop-hint")}</p>
          </div>
        </button>
      </div>
    </div>
  )
}

function FolderThumb({ path, onSelect }: { path: string; onSelect: () => void }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let sourceUrl: string | null = null
    let thumbUrl: string | null = null
    const load = async () => {
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs")
        const bytes = await readFile(path)
        sourceUrl = toBlobUrl(bytes, baseName(path))
        const image = await loadImageElement(sourceUrl)
        thumbUrl = await makeThumbnail(image)
        if (cancelled) {
          if (thumbUrl) URL.revokeObjectURL(thumbUrl)
        } else {
          setUrl(thumbUrl || null)
        }
      } catch (error) {
        console.error("Failed to read thumbnail:", error)
      } finally {
        if (sourceUrl) URL.revokeObjectURL(sourceUrl)
      }
    }
    void load()
    return () => {
      cancelled = true
      if (thumbUrl) URL.revokeObjectURL(thumbUrl)
    }
  }, [path])

  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative aspect-square overflow-hidden rounded-md border bg-muted/40 transition hover:border-primary/60"
      title={baseName(path)}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          <IconPhoto className="size-5" />
        </span>
      )}
    </button>
  )
}
