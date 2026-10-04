import { queryOptions } from "@tanstack/react-query"
import { invoke } from "@tauri-apps/api/core"
import { MODELS, MODELS_URL } from "~/constants"
import type { ModelFile } from "~/types/api"

export const remoteModelsQueryOptions = queryOptions({
  queryKey: ["remote-models"],
  queryFn: () => invoke<ModelFile[]>("list_remote_models"),
  staleTime: 60_000,
})

export const modelsQueryOptions = queryOptions({
  queryKey: ["models"],
  queryFn: async () => {
    const res = await fetch(MODELS_URL)
    if (!res.ok) {
      throw new Error(`Failed to fetch models: ${res.status}`)
    }
    const data = (await res.json()) as ModelFile[]
    return data.map((model) => model.name)
  },
  placeholderData: MODELS,
  staleTime: Number.POSITIVE_INFINITY,
})
