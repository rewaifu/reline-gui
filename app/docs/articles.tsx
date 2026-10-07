import type {ComponentType, ElementType} from "react"

type MDXComponent = ComponentType<{ components?: Record<string, ComponentType<any>> }>
import GettingStartedArticleEn from "~/docs/getting-started-en.mdx"
import GettingStartedArticleRu from "~/docs/getting-started.mdx"
import FolderReaderNodeArticleEn from "~/docs/nodes/en/folder-reader.mdx"
import FolderReaderNodeArticleRu from "~/docs/nodes/ru/folder-reader.mdx"
import FolderWriterNodeArticleEn from "~/docs/nodes/en/folder-writer.mdx"
import FolderWriterNodeArticleRu from "~/docs/nodes/ru/folder-writer.mdx"
import UpscaleNodeArticleEn from "~/docs/nodes/en/upscale.mdx"
import UpscaleNodeArticleRu from "~/docs/nodes/ru/upscale.mdx"
import SharpNodeArticleEn from "~/docs/nodes/en/sharp.mdx"
import SharpNodeArticleRu from "~/docs/nodes/ru/sharp.mdx"
import ScreentoneNodeArticleEn from "~/docs/nodes/en/screentone.mdx"
import ScreentoneNodeArticleRu from "~/docs/nodes/ru/screentone.mdx"
import ResizeNodeArticleEn from "~/docs/nodes/en/resize.mdx"
import ResizeNodeArticleRu from "~/docs/nodes/ru/resize.mdx"
import LevelNodeArticleEn from "~/docs/nodes/en/level.mdx"
import LevelNodeArticleRu from "~/docs/nodes/ru/level.mdx"
import CVTColorNodeArticleEn from "~/docs/nodes/en/cvt-color.mdx"
import CVTColorNodeArticleRu from "~/docs/nodes/ru/cvt-color.mdx"
import GrayBaseArticleEn from "~/docs/gray/en/base.mdx"
import GrayBaseArticleRu from "~/docs/gray/ru/base.mdx"
import ColorBaseArticleEn from "~/docs/color/en/base.mdx"
import ColorBaseArticleRu from "~/docs/color/ru/base.mdx"
import MangaScaleArticleEn from "~/docs/gray/en/mangascale.mdx"
import MangaScaleArticleRu from "~/docs/gray/ru/mangascale.mdx"
import DescreentoneArticleEn from "~/docs/gray/en/ds.mdx"
import DescreentoneArticleRu from "~/docs/gray/ru/ds.mdx"
import { NODE_ICONS } from "~/constants"
import { NodeType } from "~/types/enums"
import {IconInfoCircle, IconPointOff, IconSparkles} from '@tabler/icons-react';

export type DocumentationLocale = "en" | "ru"

export type DocumentationArticle = {
  slug: string
  title: string
  sectionId: string
  components: Partial<Record<DocumentationLocale, MDXComponent>> & {
    en: MDXComponent
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
          en: GettingStartedArticleEn,
          ru: GettingStartedArticleRu
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
          en: GrayBaseArticleEn,
          ru: GrayBaseArticleRu
        },
      },
      {
        slug: "mangascale",
        title: "MangaScale",
        sectionId: "bwscale",
        icon: IconSparkles,
        components: {
          en: MangaScaleArticleEn,
          ru: MangaScaleArticleRu
        },
      },
      {
        slug: "rescreentone",
        title: "docs.articles.ds",
        sectionId: "bwscale",
        icon: IconPointOff,
        components: {
          en: DescreentoneArticleEn,
          ru: DescreentoneArticleRu
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
          en: ColorBaseArticleEn,
          ru: ColorBaseArticleRu
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
          en: FolderReaderNodeArticleEn,
          ru: FolderReaderNodeArticleRu,
        },
      }),
      withNodeIcon({
        slug: "node-folder-writer",
        title: "nodes.node-type-options.folder_writer",
        sectionId: "nodes",
        nodeType: NodeType.FOLDER_WRITER,
        components: {
          en: FolderWriterNodeArticleEn,
          ru: FolderWriterNodeArticleRu,
        },
      }),
      withNodeIcon({
        slug: "node-upscale",
        title: "nodes.node-type-options.upscale",
        sectionId: "nodes",
        nodeType: NodeType.UPSCALE,
        components: {
          en: UpscaleNodeArticleEn,
          ru: UpscaleNodeArticleRu,
        },
      }),
      withNodeIcon({
        slug: "node-sharp",
        title: "nodes.node-type-options.sharp",
        sectionId: "nodes",
        nodeType: NodeType.SHARP,
        components: {
          en: SharpNodeArticleEn,
          ru: SharpNodeArticleRu,
        },
      }),
      withNodeIcon({
        slug: "node-screentone",
        title: "nodes.node-type-options.screentone",
        sectionId: "nodes",
        nodeType: NodeType.SCREENTONE,
        components: {
          en: ScreentoneNodeArticleEn,
          ru: ScreentoneNodeArticleRu,
        },
      }),
      withNodeIcon({
        slug: "node-resize",
        title: "nodes.node-type-options.resize",
        sectionId: "nodes",
        nodeType: NodeType.RESIZE,
        components: {
          en: ResizeNodeArticleEn,
          ru: ResizeNodeArticleRu,
        },
      }),
      withNodeIcon({
        slug: "node-level",
        title: "nodes.node-type-options.level",
        sectionId: "nodes",
        nodeType: NodeType.LEVEL,
        components: {
          en: LevelNodeArticleEn,
          ru: LevelNodeArticleRu,
        },
      }),
      withNodeIcon({
        slug: "node-cvt-color",
        title: "nodes.node-type-options.cvt_color",
        sectionId: "nodes",
        nodeType: NodeType.CVT_COLOR,
        components: {
          en: CVTColorNodeArticleEn,
          ru: CVTColorNodeArticleRu,
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