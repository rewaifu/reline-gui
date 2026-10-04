import { Card, CardHeader, CardContent } from "~/components/ui"
import React, { useContext, useRef } from "react"
import type { ComponentProps } from "react"
import { NodesContext, NodesDispatchContext } from "~/context/contexts"
import { NodeResolver } from "~/components/node-resolver"
import { AddNodeButton } from "~/components/add-node-button"
import { PresetSelect } from "~/components/preset-select"
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area.tsx"
import { useTranslation } from "react-i18next"
import { DragDropProvider, useDroppable, PointerSensor, KeyboardSensor } from "@dnd-kit/react"
import { PointerActivationConstraints } from "@dnd-kit/dom"
import { isSortableOperation } from "@dnd-kit/react/sortable"
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
  const dragStartIndexRef = useRef<number | null>(null)
  const lastOverIndexRef = useRef<number | null>(null)
  const getSourceInitialIndex = (source: unknown): number | null => {
    if (!source || typeof source !== "object") {
      return null
    }

    const candidate = (source as { initialIndex?: unknown }).initialIndex
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null
  }

  const onDragOver: NonNullable<ComponentProps<typeof DragDropProvider>["onDragOver"]> = (event) => {
    if (event.operation.target?.id === EDGE_DROP_ZONE_START) {
      lastOverIndexRef.current = 0
      return
    }

    if (event.operation.target?.id === EDGE_DROP_ZONE_END) {
      lastOverIndexRef.current = Math.max(nodes.length - 1, 0)
      return
    }

    const overIndex = isSortableOperation(event.operation) ? event.operation.target?.index : undefined
    if (overIndex !== undefined && overIndex >= 0) {
      lastOverIndexRef.current = overIndex
    }
  }

  const onDragStart: NonNullable<ComponentProps<typeof DragDropProvider>["onDragStart"]> = (event) => {
    dragStartIndexRef.current = null
    lastOverIndexRef.current = null

    if (!event.operation.source) {
      return
    }

    dragStartIndexRef.current = getSourceInitialIndex(event.operation.source)
  }

  const onDragEnd: NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]> = (event) => {
    if (event.canceled) {
      dragStartIndexRef.current = null
      lastOverIndexRef.current = null
      return
    }

    if (!event.operation.source) {
      dragStartIndexRef.current = null
      lastOverIndexRef.current = null
      return
    }

    const sourceInitialIndex = getSourceInitialIndex(event.operation.source)
    if (sourceInitialIndex === null && dragStartIndexRef.current === null) {
      dragStartIndexRef.current = null
      lastOverIndexRef.current = null
      return
    }

    const from = dragStartIndexRef.current ?? sourceInitialIndex ?? -1
    const toRaw =
      event.operation.target?.id === EDGE_DROP_ZONE_START
        ? 0
        : event.operation.target?.id === EDGE_DROP_ZONE_END
          ? Math.max(nodes.length - 1, 0)
          : isSortableOperation(event.operation)
            ? (event.operation.target?.index ?? lastOverIndexRef.current)
            : lastOverIndexRef.current
    const deltaY = event.operation.transform.y

    let to: number
    if (toRaw === null || toRaw === undefined) {
      to = deltaY < 0 ? 0 : nodes.length - 1
    } else {
      to = Math.max(0, Math.min(toRaw, nodes.length - 1))
    }

    if (to === from && Math.abs(deltaY) > 24) {
      to = deltaY < 0 ? 0 : nodes.length - 1
    }

    if (from < 0 || to < 0 || from === to) {
      dragStartIndexRef.current = null
      lastOverIndexRef.current = null
      return
    }

    dispatch({
      type: NodesActionType.MOVE,
      payload: {
        from,
        to,
      },
    })

    dragStartIndexRef.current = null
    lastOverIndexRef.current = null
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
          onDragStart={onDragStart}
          onDragOver={onDragOver}
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
              <div className="flex-1 flex flex-col gap-5 m-3 md:m-5">
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
