import { useContext } from "react"
import { NODE_ICONS } from "~/constants.ts"
import { DocsNavigationContext } from "~/context/contexts.ts"
import { NODE_ARTICLE_SLUGS } from "~/docs/articles.tsx"
import { NodeType } from "~/types/enums.ts"
import { useTranslation } from "react-i18next"
import {IconArrowUpRight} from "@tabler/icons-react";

type NodeRefProps = {
  type: string
  slug?: string
}

export function NodeRef({ type, slug }: NodeRefProps) {
  const { t } = useTranslation()
  const navigate = useContext(DocsNavigationContext)
  const key = type as NodeType
  const Icon = NODE_ICONS[key]

  const resolvedSlug = slug ?? NODE_ARTICLE_SLUGS[key]

  const content = (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-0.5 align-middle text-sm font-medium text-foreground not-prose">
      {Icon ? <Icon size={16} className="shrink-0 text-primary" /> : null}
      <span>{t(`nodes.node-type-options.${key}`, { defaultValue: key.replace("_", " ") })}</span>
      <IconArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
    </span>
  )

  if (resolvedSlug) {
    return (
      <button
        type="button"
        onClick={() => navigate(resolvedSlug)}
        className="inline rounded-md transition-opacity hover:cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </button>
    )
  }

  return content
}
