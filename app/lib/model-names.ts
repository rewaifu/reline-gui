const MODEL_FILE_EXT = /\.(tar\.xz|tar\.gz|tgz|zip|pt|pth|safetensors)$/i

export function normalizeModelName(value: string): string {
  const base = value.replace(/^.*[\\/]/, "")
  return base.replace(MODEL_FILE_EXT, "").toLowerCase()
}
