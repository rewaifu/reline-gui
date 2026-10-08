import { useId, useState } from "react"
import { NodesContext } from "~/context/contexts"
import type { NodeType } from "~/types/enums"
import { DEFAULT_NODE_OPTIONS, NODE_ICONS } from "~/constants"
import type { NodeOptions, StackNode } from "~/types/node"
import { NODE_BODY_COMPONENTS } from "~/components/nodes/node-body-components"
import { IconSelector } from "@tabler/icons-react"
import { Button, Card, CardContent, CardHeader } from "~/components/ui"
import { useTranslation } from "react-i18next"
import type { NodesAction } from "~/types/actions"
import { NodesActionType } from "~/types/actions"

type DemoNodeProps = {
  type: string
}

export function DemoNode({ type }: DemoNodeProps) {
  const { t } = useTranslation()
  const nodeType = type as NodeType

  const Icon = NODE_ICONS[nodeType]
  const NodeBodyComponent = NODE_BODY_COMPONENTS[nodeType]

  const idSuffix = useId().replace(/:/g, "")

  const [mockNode, setMockNode] = useState<StackNode>({
    id: -1,
    type: nodeType,
    options: { ...DEFAULT_NODE_OPTIONS[nodeType] } as NodeOptions,
    collapsed: false,
  })

  const handleChange = (action: NodesAction) => {
    setMockNode((prev) => {
      if (action.type === NodesActionType.CHANGE && action.payload.id === -1) {
        return { ...prev, ...action.payload }
      }
      return prev
    })
  }

  if (!NodeBodyComponent) {
    return null
  }

  return (
    <NodesContext.Provider value={[mockNode]}>
      <Card className="rounded-xl my-5 not-prose select-none">
        <CardHeader className="flex flex-row items-center px-4">
          <Button variant="outline" disabled className="w-[170px] md:w-[200px] justify-between">
            <div className="flex items-center gap-2">
              {Icon && <Icon size={18} className="text-primary dark:text-primary" />}
              <span>{t(`nodes.node-type-options.${nodeType}`, { defaultValue: nodeType.replace("_", " ") })}</span>
            </div>
            <IconSelector className="ml-2 h-6 w-6 shrink-0 opacity-50" />
          </Button>
        </CardHeader>
        <CardContent className="px-4">
          <Card>
            <CardContent className="px-5">
              <NodeBodyComponent id={-1} dispatch={handleChange} idSuffix={idSuffix} />
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </NodesContext.Provider>
  )
}
