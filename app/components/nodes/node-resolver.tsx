import { IconArrowUp, IconArrowDown, IconX, IconChevronDown, IconChevronRight, IconSelector, IconCheck, IconGripVertical } from "@tabler/icons-react"
import { useCallback, useContext, useLayoutEffect, useRef, useState } from "react"
import { NodesContext, NodesDispatchContext } from "~/context/contexts"
import { NodeType } from "~/types/enums"
import { NODE_ICONS } from "~/constants"
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Button, Card, CardHeader, CardContent } from "~/components/ui"
import { Switch } from "~/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "~/components/ui/command"
import { cn } from "~/lib/utils"
import { NODE_BODY_COMPONENTS } from "./node-body-components"
import { usePreferences } from "~/components/providers/preferences-provider"
import { NodesActionType } from "~/types/actions"
import { useSortable } from "@dnd-kit/react/sortable"
import { useTranslation } from "react-i18next"

function Combobox({
  allValues,
  initialValue,
  onChange,
}: {
  allValues: string[]
  initialValue: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const SelectedIcon = NODE_ICONS[initialValue as NodeType]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" aria-role="combobox" aria-expanded={open} className="w-[170px] md:w-[200px] justify-between hover:cursor-pointer">
            <div className="flex items-center gap-2">
              {SelectedIcon && <SelectedIcon size={18} className="text-primary dark:text-primary" />}
              <span>{t(`nodes.node-type-options.${initialValue}`, { defaultValue: initialValue.replace("_", " ") })}</span>
            </div>
            <IconSelector className="ml-2 h-6 w-6 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-[170px] md:w-[200px] p-0">
        <Command>
          <CommandList>
            <CommandEmpty>Nothing was found.</CommandEmpty>
            <CommandGroup>
              {allValues.map((_value) => {
                const ItemIcon = NODE_ICONS[_value as NodeType]
                return (
                  <CommandItem
                    key={_value}
                    value={_value}
                    onSelect={(currentValue) => {
                      onChange(currentValue)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2 [&>svg:last-child]:hidden"
                  >
                    <div className="flex flex-row gap-2 items-center">
                      {ItemIcon && <ItemIcon size={18} className="text-muted-foreground dark:text-primary" />}
                      <span>{t(`nodes.node-type-options.${_value}`, { defaultValue: _value.replace("_", " ") })}</span>
                    </div>
                    <IconCheck className={cn("ml-auto h-4 w-4", initialValue === _value ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function NodeResolver({ id, index }: { id: number; index: number }) {
  const nodes = useContext(NodesContext)
  const data = nodes.find((node) => node.id === id)
  const dispatch = useContext(NodesDispatchContext)
  const { getDefaultNodeOptions } = usePreferences()
  if (!data) {
    return null
  }

  const NodeBodyComponent = NODE_BODY_COMPONENTS[data.type]
  const { ref, handleRef, isDragSource } = useSortable({
    id: `node-${data.id}`,
    data: {
      nodeId: data.id,
    },
    index,
    group: "nodes",
  })
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const keepInViewRef = useRef(false)
  const beforeTopRef = useRef<number | null>(null)

  const setNodeRef = useCallback(
    (element: HTMLDivElement | null) => {
      ref(element)
      nodeRef.current = element
    },
    [ref],
  )

  const moveNode = (delta: number) => {
    beforeTopRef.current = nodeRef.current?.getBoundingClientRect().top ?? null
    keepInViewRef.current = true
    dispatch({
      type: NodesActionType.MOVE,
      payload: {
        from: index,
        to: index + delta,
      },
    })
  }

  const previousIndexRef = useRef(index)

  useLayoutEffect(() => {
    const indexChanged = previousIndexRef.current !== index
    previousIndexRef.current = index
    if (!indexChanged || !keepInViewRef.current) return
    keepInViewRef.current = false
    const before = beforeTopRef.current
    beforeTopRef.current = null
    if (before === null || !nodeRef.current) return
    const delta = nodeRef.current.getBoundingClientRect().top - before
    if (delta === 0) return
    const scroller = nodeRef.current.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    scroller?.scrollBy({ top: delta, behavior: "smooth" })
  }, [index])

  const onTypeChange = (value: string) => {
    dispatch({
      type: NodesActionType.CHANGE,
      payload: {
        id: data.id,
        type: value as NodeType,
        collapsed: data.collapsed,
        enabled: data.enabled,
        options: getDefaultNodeOptions(value as NodeType),
      },
    })
  }
  return (
    <div ref={setNodeRef} className={cn("transition-opacity", isDragSource && "opacity-70")}>
      <Collapsible
        open={!data.collapsed}
        onOpenChange={(isOpen) => {
          dispatch({
            type: NodesActionType.CHANGE,
            payload: {
              ...data,
              collapsed: !isOpen,
            },
          })
        }}
      >
        <Card className={cn("rounded-xl", data.enabled === false && "opacity-60")}>
          <CardHeader className="flex flex-row px-2 md:px-4">
            <Button
              ref={handleRef}
              className="mr-0 md:mr-1 cursor-grab active:cursor-grabbing"
              variant="ghost"
              size="icon"
              aria-label="Drag node"
              style={{ touchAction: "none" }}
            >
              <IconGripVertical />
            </Button>
            <Switch
              checked={data.enabled !== false}
              onCheckedChange={(checked) => {
                dispatch({
                  type: NodesActionType.CHANGE,
                  payload: {
                    ...data,
                    enabled: checked,
                  },
                })
              }}
              className="self-center mr-1 md:mr-2"
            />
            <Combobox initialValue={data.type} allValues={Object.values(NodeType)} onChange={onTypeChange} />
            <CollapsibleTrigger
              render={
                <Button className="ml-0 md:ml-1" variant="ghost" size="icon">
                  {data.collapsed ? <IconChevronRight /> : <IconChevronDown />}
                </Button>
              }
            />
            <Button variant="ghost" size="icon" disabled={index === 0} className="ml-auto hidden md:flex" onClick={() => moveNode(-1)}>
              <IconArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="hidden md:flex" disabled={index === nodes.length - 1} onClick={() => moveNode(1)}>
              <IconArrowDown className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto md:ml-0"
              onClick={() => {
                dispatch({
                  type: NodesActionType.DELETE,
                  payload: data.id,
                })
              }}
            >
              <IconX className="size-4" />
            </Button>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="px-3 md:px-4">
              <Card>
                <CardContent className="px-5">
                  <NodeBodyComponent id={id} />
                </CardContent>
              </Card>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  )
}
