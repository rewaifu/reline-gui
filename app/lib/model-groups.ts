export interface ModelGroup {
  value: string
  items: string[]
}

const MODEL_GROUP_DEFINITIONS: { label: string; matchers: string[] }[] = [
  { label: "Mangascale", matchers: ["ms", "mangascale", "mangajanai", "digimanga"] },
  { label: "Descreentone", matchers: ["ds", "descreentone", "descreenon"] },
  { label: "Digital Art", matchers: ["illustration", "digitalart", "digital_art", "enhancr_da"] },
  { label: "Decompress", matchers: ["jpeg", "decompress"] },
  { label: "Restoration", matchers: ["mr"] },
  { label: "Prototypes", matchers: ["beta", "net_g", "alpha"] },
]

export const UNGROUPED_LABEL = "Ungrouped"

export function groupModels(models: readonly string[], getName: (model: string) => string = (model) => model): ModelGroup[] {
  const buckets = new Map<string, string[]>()
  const ungrouped: string[] = []

  for (const model of models) {
    const haystack = getName(model).toLowerCase()
    const matched = MODEL_GROUP_DEFINITIONS.find((definition) => definition.matchers.some((matcher) => haystack.includes(matcher)))
    if (!matched) {
      ungrouped.push(model)
      continue
    }
    const bucket = buckets.get(matched.label)
    if (bucket) {
      bucket.push(model)
    } else {
      buckets.set(matched.label, [model])
    }
  }

  const groups: ModelGroup[] = []
  for (const definition of MODEL_GROUP_DEFINITIONS) {
    const items = buckets.get(definition.label)
    if (items && items.length > 0) {
      groups.push({ value: definition.label, items })
    }
  }
  if (ungrouped.length > 0) {
    groups.push({ value: UNGROUPED_LABEL, items: ungrouped })
  }
  return groups
}
