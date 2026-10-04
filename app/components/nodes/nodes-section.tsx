import { Card, CardHeader, CardContent } from "~/components/ui"
import React, { useContext } from "react"
import type { ComponentProps } from "react"
import { NodesContext, NodesDispatchContext } from "~/context/contexts"
import { NodeResolver } from "~/components/nodes/node-resolver"
import { AddNodeButton } from "~/components/nodes/add-node-button"
import { PresetSelect } from "~/components/config/preset-select"
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area.tsx"
import { useTranslation } from "react-i18next"
import { DragDropProvider, useDroppable, PointerSensor, KeyboardSensor } from "@dnd-kit/react"
import { PointerActivationConstraints } from "@dnd-kit/dom"
import { isSortable } from "@dnd-kit/react/sortable"
import { cn } from "~/lib/utils"
import { NodesActionType } from "~/types/actions"
import { useMediaQuery } from "~/hooks/useMediaQuery"

const EDGE_DROP_ZONE_START = "nodes-edge-start"
const EDGE_DROP_ZONE_END = "nodes-edge-end"

function EdgeDropZone({ id }: { id: string }) {
  const { ref } = useDroppable({
    id,
  })

  return <div ref={ref} className={cn("absolute left-0 right-0 z-20 h-10 pointer-events-none", id === EDGE_DROP_ZONE_START ? "top-0" : "bottom-0")} />
}

export function NodesSection() {
  const { t } = useTranslation()
  const nodes = useContext(NodesContext)
  const dispatch = useContext(NodesDispatchContext)
  const isMobile = useMediaQuery("(max-width: 767px)")

  const onDragEnd: NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]> = (event) => {
    if (event.canceled) {
      return
    }

    const source = event.operation.source
    if (!source || !isSortable(source) || !("initialIndex" in source)) {
      return
    }

    const from = source.initialIndex
    const targetId = event.operation.target?.id
    const to = targetId === EDGE_DROP_ZONE_START ? 0 : targetId === EDGE_DROP_ZONE_END ? Math.max(nodes.length - 1, 0) : source.index

    if (from < 0 || to < 0 || from === to) {
      return
    }

    dispatch({
      type: NodesActionType.MOVE,
      payload: {
        from,
        to,
      },
    })
  }

  return (
    <Card className="pb-2 md:pb-4">
      <CardHeader className="flex flex-row items-center mx-2 h-[25px] md:h-[32px]">
        <h2 className="scroll-m-20 text-xl font-semibold tracking-tight select-none">{t("home-page.nodes")}</h2>
        <div className="flex flex-row items-center ml-auto gap-2">
          <div className="hidden md:flex">
            <PresetSelect />
          </div>
          <AddNodeButton />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden px-2 md:px-4">
        <DragDropProvider
          sensors={[
            PointerSensor.configure({
              activationConstraints: [
                new PointerActivationConstraints.Delay({
                  value: isMobile ? 200 : 0,
                  tolerance: isMobile ? 5 : 0,
                }),
              ],
            }),
            KeyboardSensor.configure(KeyboardSensor.defaults),
          ]}
          onDragEnd={onDragEnd}
        >
          <ScrollArea
            className="relative rounded-xl border h-full bg-background overflow-hidden
                       before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-4
                       before:bg-linear-to-b/oklab before:from-background before:to-background/0 before:opacity-0 before:transition-opacity before:content-['']
                       data-[overflow-y-start]:before:opacity-100
                       after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-10 after:h-4
                       after:bg-linear-to-t/oklab after:from-background after:to-background/0 after:opacity-0 after:transition-opacity after:content-['']
                       data-[overflow-y-end]:after:opacity-100"
          >
            <div className="flex flex-col min-h-full">
              <EdgeDropZone id={EDGE_DROP_ZONE_START} />
              <div className="flex-1 flex flex-col gap-5 mx-3 mt-0 mb-0 pt-3 pb-3 md:mx-5 md:pt-5 md:pb-5 [transform:translateZ(0)]">
                {nodes.map((data, index) => (
                  <NodeResolver key={data.id} id={data.id} index={index} />
                ))}
              </div>
              <EdgeDropZone id={EDGE_DROP_ZONE_END} />
            </div>
            <ScrollBar className="mr-1 my-2 pb-4 z-20 hidden md:flex" />
          </ScrollArea>
        </DragDropProvider>
      </CardContent>
    </Card>
  )
}
