import { ImagePicker } from "~/components/previews/image-picker"
import { ScreentoneEditorStage } from "./editor-stage"
import { ScreentoneSelectStage } from "./select-stage"
import { useScreentonePreview } from "./useScreentonePreview"

export function ScreentonePreview() {
  const preview = useScreentonePreview()

  if (preview.stage === "editor") {
    return <ScreentoneEditorStage preview={preview} />
  }

  if (!preview.selected) {
    return <ImagePicker isTauri={preview.isTauri} folderPath={preview.readerPath} onPickPath={(path) => void preview.selectPath(path)} />
  }

  return <ScreentoneSelectStage preview={preview} />
}
