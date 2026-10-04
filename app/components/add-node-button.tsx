import {IconPlus, IconBolt, IconFolderDown, IconFolderUp, IconGrain, IconArrowsDiagonal, IconChartArrows, IconBorderStyle2, IconPalette} from "@tabler/icons-react"
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "~/components/ui/command"
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover"
import {NodeType} from "~/types/enums"
import {useContext, useState} from "react"
import {NodesContext, NodesDispatchContext} from "~/context/contexts"
import {NODE_ICONS} from "~/constants"
import {Button} from "./ui/button"
import {NodesActionType} from "~/types/actions"
import {useTranslation} from "react-i18next"
import {usePreferences} from "~/components/preferences-provider"

export function AddNodeButton() {
    const {t} = useTranslation()
    const [open, setOpen] = useState(false)
    const dispatch = useContext(NodesDispatchContext)
    const nodes = useContext(NodesContext)
    const {getDefaultNodeOptions} = usePreferences()
    const nextNodeId = nodes.reduce((maxId, node) => Math.max(maxId, node.id), -1) + 1
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button className="ml-auto " variant="ghost" size="icon-lg" aria-expanded={open}>
                    <IconPlus/>
                </Button>} />
            <PopoverContent className="w-[200px] p-0">
                <Command>
                    <CommandList>
                        <CommandEmpty>Nothing was found.</CommandEmpty>
                        <CommandGroup>
                            {Object.values(NodeType).map((value) => {
                                const Icon = NODE_ICONS[value as NodeType];

                                return (
                                    <CommandItem
                                        key={value}
                                        value={value}
                                        onSelect={(currentValue) => {
                                            dispatch({
                                                type: NodesActionType.ADD,
                                                payload: {
                                                    id: nextNodeId,
                                                    type: currentValue as NodeType,
                                                    options: getDefaultNodeOptions(currentValue as NodeType),
                                                    collapsed: false,
                                                },
                                            })
                                            setOpen(false)
                                        }}
                                        className="flex items-center gap-2 cursor-pointer"
                                    >
                                        {Icon && <Icon size={18} className="text-muted-foreground" />}
                                        <span>
                                            {t(`nodes.node-type-options.${value}`, {defaultValue: value.replace('_', ' ')})}
                                        </span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
