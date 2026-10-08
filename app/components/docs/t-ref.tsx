import { useTranslation } from "react-i18next"

type TProps = {
  /** i18n key to translate */
  k: string
  /** Default value if translation is missing */
  d?: string
}

export function T({ k, d }: TProps) {
  const { t } = useTranslation()
  return <>{t(k, { defaultValue: d })}</>
}
