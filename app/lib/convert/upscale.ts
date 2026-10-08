import type { ConvertToPureFunction, ConvertToStackFunction } from "~/lib/convert/index.ts"
import type { PureUpscaleNodeOptions, UpscaleNodeOptions } from "~/types/options"
import { NodeType, PureNodeType } from "~/types/enums"
import { DEFAULT_COLLAPSED, MODEL_POSTFIX, MODEL_PREFIX } from "~/constants"
import { isTauriRuntime } from "~/lib/completion-feedback"

function isFilesystemPath(model: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(model) || model.includes('/') || model.includes('\\')
}

export const convertUpscaleToPure: ConvertToPureFunction = (nodes, index) => {
  const result = []
  const node = nodes[index]
  const { is_own_model, ...options } = node.options as UpscaleNodeOptions
  if (isTauriRuntime() || is_own_model || isFilesystemPath(options.model)) {
    result.push({
      type: PureNodeType.UPSCALE,
      options,
    })
  } else {
    result.push(
      {
        type: PureNodeType.DOWNLOAD,
        options: {
          name: options.model,
        },
      },
      {
        type: PureNodeType.UPSCALE,
        options: {
          ...options,
          model: MODEL_PREFIX + options.model + MODEL_POSTFIX,
        },
      },
    )
  }
  return [result, index + 1]
}

export const convertUpscaleToStack: ConvertToStackFunction = (nodes, index) => {
  const node = nodes[index]
  const options = node.options as PureUpscaleNodeOptions
  return [
    [
      {
        id: index,
        type: NodeType.UPSCALE,
        options: {
          ...options,
          is_own_model: true,
        },
        collapsed: DEFAULT_COLLAPSED,
      },
    ],
    index + 1,
  ]
}
