import { flagUrls } from "~/i18n/flags"

export function FlagIcon({ code, className }: { code: string; className?: string }) {
  const url = flagUrls[code]
  if (!url) return null
  return <img src={url} alt="" className={className} />
}
