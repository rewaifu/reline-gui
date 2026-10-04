import { useContext, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { NodesDispatchContext } from "~/context/contexts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Separator } from "~/components/ui/separator"
import { CONFIG_PRESETS, getPresetById } from "~/lib/config-presets"
import { usePrepareNodes } from "~/hooks/usePrepareNodes"
import { NodesActionType } from "~/types/actions"

export function PresetSelect() {
  const { t } = useTranslation()
  const dispatch = useContext(NodesDispatchContext)
  const prepareNodes = usePrepareNodes()
  const [selectedPreset, setSelectedPreset] = useState("default")

  const handleChange = (value: string | null) => {
    if (!value) return
    setSelectedPreset(value)
    const preset = getPresetById(value)
    if (!preset) return
    dispatch({
      type: NodesActionType.IMPORT,
      payload: prepareNodes(preset.nodes),
    })
    toast.success(t("toasts.preset-loaded", { name: preset.name }))
  }

  return (
    <div className="flex flex-row gap-4 items-center">
      <p className="select-none text-sm translate-x-1">{t("config-presets.presets")}</p>
      <Select value={selectedPreset} onValueChange={handleChange}>
        <SelectTrigger size="sm" className="min-w-40 text-s self-center">
          <SelectValue placeholder={t("config-presets.select")} />
        </SelectTrigger>
        <SelectContent align="start">
          {CONFIG_PRESETS.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              {preset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Separator orientation="vertical" />
    </div>
  )
}
