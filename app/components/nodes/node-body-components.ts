import type { Dispatch, FC } from "react"
import { CvtColorNodeBody } from "./cvt-color-node"
import { FolderReaderNodeBody } from "./folder-reader-node"
import { FolderWriterNodeBody } from "./folder-writer-node"
import { LevelNodeBody } from "./level-node"
import { ResizeNodeBody } from "./resize-node"
import { ScreentoneNodeBody } from "./screentone-node"
import { SharpNodeBody } from "./sharp-node"
import { UpscaleNodeBody } from "./upscale-node"
import type { NodesAction } from "~/types/actions"
import type { NodeType } from "~/types/enums"

export type NodeBodyProps = {
  id: number
  dispatch?: Dispatch<NodesAction>
  idSuffix?: string
}

export const NODE_BODY_COMPONENTS: Record<NodeType, FC<NodeBodyProps>> = {
  level: LevelNodeBody as FC<NodeBodyProps>,
  folder_reader: FolderReaderNodeBody as FC<NodeBodyProps>,
  folder_writer: FolderWriterNodeBody as FC<NodeBodyProps>,
  cvt_color: CvtColorNodeBody as FC<NodeBodyProps>,
  sharp: SharpNodeBody as FC<NodeBodyProps>,
  upscale: UpscaleNodeBody as FC<NodeBodyProps>,
  resize: ResizeNodeBody as FC<NodeBodyProps>,
  screentone: ScreentoneNodeBody as FC<NodeBodyProps>,
}
