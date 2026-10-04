export const WEB_PATH_PREFIX = "/content/drive/MyDrive"

export function normalizeWebPath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("/content/")) return trimmed
  if (trimmed.startsWith("/")) return `${WEB_PATH_PREFIX}${trimmed}`
  return `${WEB_PATH_PREFIX}/${trimmed}`
}
