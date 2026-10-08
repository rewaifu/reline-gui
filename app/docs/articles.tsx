import { IconInfoCircle, IconPointOff, IconSparkles } from "@tabler/icons-react"
import type { ComponentType, ElementType } from "react"
import { NODE_ICONS } from "~/constants"
import { NodeType } from "~/types/enums"

export type DocumentationLocale = "en" | "ru"

type MDXComponent = ComponentType<{ components?: Record<string, ElementType> }>

// Articles are imported lazily: each MDX file becomes its own chunk and is only
// evaluated when the docs dialog actually opens, keeping them out of the initial
// bundle (both for the web build and the Tauri app).
export type MDXLoader = () => Promise<{ default: MDXComponent }>

export type DocumentationArticle = {
  slug: string
  title: string
  sectionId: string
  components: Partial<Record<DocumentationLocale, MDXLoader>> & {
    en: MDXLoader
  }
  icon?: ElementType
  nodeType?: NodeType
}

export type DocumentationSection = {
  id: string
  title: string
  articles: DocumentationArticle[]
}

const withNodeIcon = (a: DocumentationArticle): DocumentationArticle => ({
  ...a,
  icon: a.icon ?? (a.nodeType ? NODE_ICONS[a.nodeType] : undefined),
})

export const DOCUMENTATION_UI = {
  openLabel: "docs.ui.open_label",
  title: "docs.ui.title",
}

export const DOCUMENTATION_SECTIONS: DocumentationSection[] = [
  {
    id: "basics",
    title: "docs.sections.basics",
    articles: [
      {
        slug: "getting-started",
        title: "docs.articles.getting_started",
        sectionId: "basics",
        components: {
          en: () => import("~/docs/getting-started-en.mdx"),
          ru: () => import("~/docs/getting-started.mdx"),
        },
      },
    ],
  },
  {
    id: "bwscale",
    title: "docs.sections.bw-scale",
    articles: [
      {
        slug: "bw-base",
        title: "docs.articles.common",
        sectionId: "bwscale",
        icon: IconInfoCircle,
        components: {
          en: () => import("~/docs/gray/en/base.mdx"),
          ru: () => import("~/docs/gray/ru/base.mdx"),
        },
      },
      {
        slug: "mangascale",
        title: "MangaScale",
        sectionId: "bwscale",
        icon: IconSparkles,
        components: {
          en: () => import("~/docs/gray/en/mangascale.mdx"),
          ru: () => import("~/docs/gray/ru/mangascale.mdx"),
        },
      },
      {
        slug: "rescreentone",
        title: "docs.articles.ds",
        sectionId: "bwscale",
        icon: IconPointOff,
        components: {
          en: () => import("~/docs/gray/en/ds.mdx"),
          ru: () => import("~/docs/gray/ru/ds.mdx"),
        },
      },
    ],
  },
  {
    id: "colorscale",
    title: "docs.sections.color-scale",
    articles: [
      {
        slug: "color-base",
        title: "docs.articles.common",
        sectionId: "colorscale",
        icon: IconInfoCircle,
        components: {
          en: () => import("~/docs/color/en/base.mdx"),
          ru: () => import("~/docs/color/ru/base.mdx"),
        },
      },
    ],
  },
  {
    id: "nodes",
    title: "docs.sections.nodes",
    articles: [
      withNodeIcon({
        slug: "node-folder-reader",
        title: "nodes.node-type-options.folder_reader",
        sectionId: "nodes",
        nodeType: NodeType.FOLDER_READER,
        components: {
          en: () => import("~/docs/nodes/en/folder-reader.mdx"),
          ru: () => import("~/docs/nodes/ru/folder-reader.mdx"),
        },
      }),
      withNodeIcon({
        slug: "node-folder-writer",
        title: "nodes.node-type-options.folder_writer",
        sectionId: "nodes",
        nodeType: NodeType.FOLDER_WRITER,
        components: {
          en: () => import("~/docs/nodes/en/folder-writer.mdx"),
          ru: () => import("~/docs/nodes/ru/folder-writer.mdx"),
        },
      }),
      withNodeIcon({
        slug: "node-upscale",
        title: "nodes.node-type-options.upscale",
        sectionId: "nodes",
        nodeType: NodeType.UPSCALE,
        components: {
          en: () => import("~/docs/nodes/en/upscale.mdx"),
          ru: () => import("~/docs/nodes/ru/upscale.mdx"),
        },
      }),
      withNodeIcon({
        slug: "node-sharp",
        title: "nodes.node-type-options.sharp",
        sectionId: "nodes",
        nodeType: NodeType.SHARP,
        components: {
          en: () => import("~/docs/nodes/en/sharp.mdx"),
          ru: () => import("~/docs/nodes/ru/sharp.mdx"),
        },
      }),
      withNodeIcon({
        slug: "node-screentone",
        title: "nodes.node-type-options.screentone",
        sectionId: "nodes",
        nodeType: NodeType.SCREENTONE,
        components: {
          en: () => import("~/docs/nodes/en/screentone.mdx"),
          ru: () => import("~/docs/nodes/ru/screentone.mdx"),
        },
      }),
      withNodeIcon({
        slug: "node-resize",
        title: "nodes.node-type-options.resize",
        sectionId: "nodes",
        nodeType: NodeType.RESIZE,
        components: {
          en: () => import("~/docs/nodes/en/resize.mdx"),
          ru: () => import("~/docs/nodes/ru/resize.mdx"),
        },
      }),
      withNodeIcon({
        slug: "node-level",
        title: "nodes.node-type-options.level",
        sectionId: "nodes",
        nodeType: NodeType.LEVEL,
        components: {
          en: () => import("~/docs/nodes/en/level.mdx"),
          ru: () => import("~/docs/nodes/ru/level.mdx"),
        },
      }),
      withNodeIcon({
        slug: "node-cvt-color",
        title: "nodes.node-type-options.cvt_color",
        sectionId: "nodes",
        nodeType: NodeType.CVT_COLOR,
        components: {
          en: () => import("~/docs/nodes/en/cvt-color.mdx"),
          ru: () => import("~/docs/nodes/ru/cvt-color.mdx"),
        },
      }),
    ],
  },
]

export const DOCUMENTATION_ARTICLES = DOCUMENTATION_SECTIONS.flatMap((section) => section.articles)

export const NODE_ARTICLE_SLUGS: Partial<Record<NodeType, string>> = {}
for (const a of DOCUMENTATION_ARTICLES) {
  if (a.nodeType) {
    NODE_ARTICLE_SLUGS[a.nodeType] = a.slug
  }
}
