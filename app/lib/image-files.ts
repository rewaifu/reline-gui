export const IMAGE_EXT = /\.(jpe?g|png|webp|bmp|gif|tiff?|avif)$/i

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tif", "tiff", "avif"]

export function mimeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "webp":
      return "image/webp"
    case "bmp":
      return "image/bmp"
    case "gif":
      return "image/gif"
    case "tif":
    case "tiff":
      return "image/tiff"
    case "avif":
      return "image/avif"
    default:
      return "application/octet-stream"
  }
}

export function toBlobUrl(bytes: Uint8Array, name: string): string {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeFor(name) })
  return URL.createObjectURL(blob)
}

export function joinPath(dir: string, name: string): string {
  const separator = dir.includes("\\") ? "\\" : "/"
  return `${dir.replace(/[\\/]+$/, "")}${separator}${name}`
}

export function baseName(path: string): string {
  return path.replace(/^.*[\\/]/, "")
}
