import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { IconCheck, IconSelector } from "@tabler/icons-react"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader } from "~/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "~/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover"
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area"
import { usePreferences } from "~/components/preferences-provider"
import { NODE_BODY_COMPONENTS } from "~/components/nodes/node-body-components"
import { NODE_ICONS } from "~/constants"
import { NodesContext } from "~/context/contexts"
import { NodeType } from "~/types/enums"
import { NodesActionType, type NodesAction } from "~/types/actions"
import { cn } from "~/lib/utils"
import type { StackNode } from "~/types/node"

function NodeTypeCombobox({ value, onChange }: { value: NodeType; onChange: (value: NodeType) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const SelectedIcon = NODE_ICONS[value]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" aria-expanded={open} className="w-[170px] md:w-[200px] justify-between hover:cursor-pointer">
            <div className="flex items-center gap-2">
              {SelectedIcon && <SelectedIcon size={18} className="text-primary dark:text-primary" />}
              <span>{t(`nodes.node-type-options.${value}`)}</span>
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
              {Object.values(NodeType).map((nodeType) => {
                const ItemIcon = NODE_ICONS[nodeType]
                return (
                  <CommandItem
                    key={nodeType}
                    value={nodeType}
                    onSelect={() => {
                      onChange(nodeType)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2 [&>svg:last-child]:hidden"
                  >
                    <div className="flex flex-row gap-2 items-center">
                      {ItemIcon && <ItemIcon size={18} className="text-muted-foreground dark:text-primary" />}
                      <span>{t(`nodes.node-type-options.${nodeType}`)}</span>
                    </div>
                    <IconCheck className={cn("ml-auto h-4 w-4", value === nodeType ? "opacity-100" : "opacity-0")} />
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

function NodeDefaultsEditor({ type }: { type: NodeType }) {
  const { getDefaultNodeOptions, setNodeDefault } = usePreferences()
  const idSuffix = useId().replace(/:/g, "")
  const NodeBodyComponent = NODE_BODY_COMPONENTS[type]
  const [mockNode, setMockNode] = useState<StackNode>(() => ({
    id: -1,
    type,
    options: getDefaultNodeOptions(type),
    collapsed: false,
  }))

  const handleChange = (action: NodesAction) => {
    if (action.type === NodesActionType.CHANGE && action.payload.id === -1) {
      setMockNode(action.payload)
      setNodeDefault(type, action.payload.options)
    }
  }

  return (
    <NodesContext.Provider value={[mockNode]}>
      <NodeBodyComponent id={-1} dispatch={handleChange} idSuffix={idSuffix} />
    </NodesContext.Provider>
  )
}

export function NodesTab() {
  const { t } = useTranslation()
  const { nodeDefaults, resetNodeDefault, resetAllNodeDefaults } = usePreferences()
  const [selectedType, setSelectedType] = useState<NodeType>(NodeType.FOLDER_READER)
  const [editorKey, setEditorKey] = useState(0)

  const hasOverrides = selectedType in nodeDefaults
  const hasAnyOverrides = Object.keys(nodeDefaults).length > 0

  const handleTypeChange = (type: NodeType) => {
    setSelectedType(type)
    setEditorKey((key) => key + 1)
  }

  const handleReset = () => {
    resetNodeDefault(selectedType)
    setEditorKey((key) => key + 1)
  }

  const handleResetAll = () => {
    resetAllNodeDefaults()
    setEditorKey((key) => key + 1)
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center gap-2">
          <NodeTypeCombobox value={selectedType} onChange={handleTypeChange} />
          <div className="ml-auto flex flex-row gap-2">
            <Button variant="outline" size="sm" disabled={!hasOverrides} onClick={handleReset}>
              {t("backend.preferences.reset")}
            </Button>
            <Button variant="outline" size="sm" disabled={!hasAnyOverrides} onClick={handleResetAll}>
              {t("backend.preferences.resetAll")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Card>
            <CardContent>
              <NodeDefaultsEditor key={`${selectedType}-${editorKey}`} type={selectedType} />
            </CardContent>
          </Card>
        </CardContent>
      </Card>
      <ScrollBar className="-mr-3" />
    </ScrollArea>
  )
}
