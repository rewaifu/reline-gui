import { useContext } from "react"
import { DocsNavigationContext } from "~/context/contexts.ts"
import { DOCUMENTATION_ARTICLES } from "~/docs/articles.tsx"
import { useTranslation } from "react-i18next"
import { IconArrowUpRight } from "@tabler/icons-react"

type ArticleRefProps = {
  slug: string
}

export function ArticleRef({ slug }: ArticleRefProps) {
  const { t } = useTranslation()
  const navigate = useContext(DocsNavigationContext)

  const article = DOCUMENTATION_ARTICLES.find((a) => a.slug === slug)
  const Icon = article?.icon

  const content = (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-0.5 align-middle text-sm font-medium text-foreground not-prose">
      {Icon ? <Icon size={16} className="shrink-0 text-primary" /> : null}
      <span>{article ? t(article.title) : slug}</span>
      <IconArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
    </span>
  )

  return (
    <button
      type="button"
      onClick={() => navigate(slug)}
      className="inline rounded-md transition-opacity hover:cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </button>
  )
}
