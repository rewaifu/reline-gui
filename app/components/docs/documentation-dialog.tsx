import { lazy, Suspense, useMemo, useRef, useState, useEffect } from "react"
import {
  IconChevronDown,
  IconChevronRight,
  IconBook2,
  IconLayoutSidebarLeftCollapseFilled,
  IconLayoutSidebarLeftExpandFilled,
  IconLoader2,
} from "@tabler/icons-react"
import { Button } from "~/components/ui/button.tsx"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible.tsx"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog.tsx"
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area.tsx"
import { DOCUMENTATION_ARTICLES, DOCUMENTATION_SECTIONS, DOCUMENTATION_UI, type DocumentationLocale } from "~/docs/articles.tsx"
import { cn } from "~/lib/utils.ts"
import { useTranslation } from "react-i18next"
import { LanguageSelect } from "~/components/layout/language-select.tsx"
import { NodeRef } from "~/components/docs/node-ref.tsx"
import { ArticleRef } from "~/components/docs/article-ref.tsx"
import { T } from "~/components/docs/t-ref.tsx"
import { DocImage } from "~/components/docs/doc-image.tsx"
import { DocImageCompare } from "~/components/docs/doc-image-compare.tsx"
import { PlatformOnly } from "~/components/docs/platform-only.tsx"
import { DemoNode } from "~/components/docs/demo-node.tsx"
import { DocsNavigationContext } from "~/context/contexts.ts"

type DocumentationDialogProps = {
  triggerClassName?: string
  iconOnly?: boolean
}

export function DocumentationDialog({ triggerClassName, iconOnly }: DocumentationDialogProps) {
  const { t, i18n } = useTranslation()
  const [selectedSlug, setSelectedSlug] = useState(DOCUMENTATION_ARTICLES[0]?.slug ?? "")
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DOCUMENTATION_SECTIONS.map((section) => [section.id, true])),
  )

  const locale: DocumentationLocale = i18n.resolvedLanguage?.startsWith("ru") ? "ru" : "en"

  const scrollPositions = useRef<Record<string, number>>({})
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = scrollAreaRef.current
    if (!root) return
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null
    if (!viewport) return

    const handleScroll = () => {
      scrollPositions.current[selectedSlug] = viewport.scrollTop
    }

    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [selectedSlug])

  useEffect(() => {
    const root = scrollAreaRef.current
    if (!root) return
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null
    if (!viewport) return

    viewport.scrollTop = scrollPositions.current[selectedSlug] ?? 0
  }, [selectedSlug])

  const activeArticle =
    useMemo(() => DOCUMENTATION_ARTICLES.find((article) => article.slug === selectedSlug) ?? DOCUMENTATION_ARTICLES[0], [selectedSlug]) ??
    DOCUMENTATION_ARTICLES[0]
  const activeSection = DOCUMENTATION_SECTIONS.find((section) => section.id === activeArticle?.sectionId)

  if (!activeArticle) {
    return null
  }

  const ActiveArticleLoader = activeArticle.components[locale] ?? activeArticle.components.en
  const ActiveArticleComponent = useMemo(() => lazy(ActiveArticleLoader), [ActiveArticleLoader])

  return (
    <Dialog>
      <DialogTrigger>
        <Button size={iconOnly ? "icon-lg" : "sm"} variant="outline" className={triggerClassName} aria-label={t(DOCUMENTATION_UI.openLabel)}>
          <IconBook2 />
          {iconOnly ? null : t("docs.ui.title")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(90vh,900px)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:!max-w-[min(1120px,calc(100vw-2rem))]">
        <DialogHeader className="flex-row items-stretch gap-0 border-b bg-muted/20 p-0">
          <div
            className={cn(
              "flex shrink-0 items-center border-r py-4 transition-[width] duration-200",
              isSidebarOpen ? "w-[300px] px-5" : "w-[300px] px-5 md:w-12 md:justify-center md:px-0",
            )}
          >
            <DialogTitle className={cn("select-none", !isSidebarOpen && "md:hidden")}>{t(DOCUMENTATION_UI.title)}</DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("hidden md:inline-flex", isSidebarOpen && "ml-auto")}
              onClick={() => setIsSidebarOpen((open) => !open)}
            >
              {isSidebarOpen ? <IconLayoutSidebarLeftCollapseFilled /> : <IconLayoutSidebarLeftExpandFilled />}
            </Button>
          </div>
          <div className="hidden min-w-0 flex-1 items-center px-5 md:flex">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground select-none">
              <span className="truncate">{activeSection ? t(activeSection.title) : activeArticle.sectionId}</span>
              <span aria-hidden="true">/</span>
              <span className="truncate font-medium text-foreground">{t(activeArticle.title)}</span>
            </div>
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <aside
            className={cn(
              "hidden min-h-0 shrink-0 flex-col border-r bg-muted/20 transition-[width] duration-200 md:flex",
              isSidebarOpen ? "w-[300px]" : "md:w-12",
            )}
          >
            {isSidebarOpen ? (
              <ScrollArea className="min-h-0 flex-1">
                <nav className="space-y-3 px-3 pr-5 py-4">
                  {DOCUMENTATION_SECTIONS.map((section) => {
                    const isOpen = openSections[section.id]

                    return (
                      <Collapsible
                        key={section.id}
                        open={isOpen}
                        onOpenChange={(nextOpen) =>
                          setOpenSections((current) => ({
                            ...current,
                            [section.id]: nextOpen,
                          }))
                        }
                      >
                        <div>
                          <CollapsibleTrigger
                            render={
                              <button type="button" className="flex w-full items-center rounded-lg px-3 py-2.5 text-left hover:bg-background mb-1" />
                            }
                            className="w-full"
                          >
                            {isOpen ? (
                              <IconChevronDown className="size-4 text-muted-foreground" />
                            ) : (
                              <IconChevronRight className="size-4 text-muted-foreground" />
                            )}
                            <span className="ml-2 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{t(section.title)}</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="space-y-1">
                              {section.articles.map((article) => {
                                const ArticleIcon = article.icon

                                return (
                                  <button
                                    key={article.slug}
                                    type="button"
                                    onClick={() => {
                                      setSelectedSlug(article.slug)
                                      setOpenSections((current) => ({ ...current, [section.id]: true }))
                                    }}
                                    className={cn(
                                      "flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors",
                                      article.slug === activeArticle.slug
                                        ? "bg-muted-foreground/10 text-foreground"
                                        : "text-muted-foreground hover:bg-background hover:text-foreground",
                                    )}
                                  >
                                    <span className="text-sm font-medium leading-5 ml-6 flex items-center gap-2">
                                      {ArticleIcon ? <ArticleIcon size={18} className="shrink-0" /> : null}
                                      <span className="truncate">{t(article.title)}</span>
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    )
                  })}
                </nav>
                <ScrollBar className="mr-1 my-2 pb-4" />
              </ScrollArea>
            ) : null}
          </aside>
          <section className="min-h-0 flex-1 bg-background">
            <DocsNavigationContext.Provider value={setSelectedSlug}>
              <ScrollArea className="h-full" ref={scrollAreaRef}>
                <div className="mx-auto w-full max-w-3xl px-5 py-5 md:px-8 md:py-7">
                  <article className="docs-article">
                    <Suspense
                      fallback={
                        <div className="flex justify-center py-10">
                          <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                      }
                    >
                      <ActiveArticleComponent components={{ NodeRef, ArticleRef, T, DocImage, DocImageCompare, PlatformOnly, DemoNode }} />
                    </Suspense>
                  </article>
                </div>
                <ScrollBar className="mr-1 my-2 pb-4" />
              </ScrollArea>
            </DocsNavigationContext.Provider>
          </section>
        </div>
        <DialogFooter className="mx-0 mb-0 h-13">
          <div className="flex w-full items-center justify-between">
            <LanguageSelect />
            <DialogClose render={<Button variant="outline">{t("docs.ui.close")}</Button>} />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
