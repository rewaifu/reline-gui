import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "~/components/ui/combobox"
import { modelBaseName } from "~/lib/screentone-preview"

export function ModelsPicker({
  items,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  items: string[]
  value?: string
  onChange: (value: string | undefined) => void
  disabled?: boolean
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState(value ?? "")

  useEffect(() => {
    setInputValue(value ?? "")
  }, [value])

  return (
    <Combobox
      items={items}
      value={value ?? null}
      inputValue={inputValue}
      onInputValueChange={(next) => setInputValue(next)}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next)
      }}
    >
      <ComboboxInput placeholder={placeholder} showTrigger disabled={disabled} renderValue={modelBaseName} />
      <ComboboxContent>
        <ComboboxEmpty>{t("nodes.upscale.no-models-found")}</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {modelBaseName(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
