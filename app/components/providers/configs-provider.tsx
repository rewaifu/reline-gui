import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ConfigCreateDialog } from "~/components/config/config-create-dialog"
import { UnsavedChangesDialog } from "~/components/config/unsaved-changes-dialog"
import { NodesContext, NodesDispatchContext, ConfigsContext, type ConfigsContextValue, type CreateDialogMode } from "~/context/contexts"
import { usePrepareNodes } from "~/hooks/usePrepareNodes"
import { CONFIG_PRESETS, getPresetById } from "~/lib/config-presets"
import { migrateNodes } from "~/lib/config-migration"
import { normalizeNodeIds } from "~/lib/nodes-storage"
import {
  createConfigId,
  isNameTaken,
  loadActiveConfig,
  loadUserConfigs,
  saveActiveConfig as persistActiveConfig,
  saveUserConfigs,
} from "~/lib/user-configs"
import { NodesActionType } from "~/types/actions"
import type { ActiveConfig, ConfigBase, UserConfig } from "~/types/config"
import type { StackNode } from "~/types/node"

const prepareUserNodes = (nodes: StackNode[]): StackNode[] => normalizeNodeIds(migrateNodes(nodes))

export function ConfigsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const nodes = useContext(NodesContext)
  const dispatch = useContext(NodesDispatchContext)
  const prepareNodes = usePrepareNodes()

  const [userConfigs, setUserConfigs] = useState<UserConfig[]>(loadUserConfigs)
  const [activeConfig, setActiveConfig] = useState<ActiveConfig>(() => loadActiveConfig() ?? { kind: "preset", id: CONFIG_PRESETS[0].id })
  const [dirty, setDirty] = useState(false)
  const [baseline, setBaseline] = useState<string | null>(() => {
    const active = loadActiveConfig()
    if (active?.kind === "user") {
      const config = loadUserConfigs().find((item) => item.id === active.id)
      return config ? JSON.stringify(prepareUserNodes(config.nodes)) : null
    }
    return null
  })
  const [createDialog, setCreateDialog] = useState<{ open: boolean; mode: CreateDialogMode }>({ open: false, mode: "full" })
  const [pendingSwitch, setPendingSwitch] = useState<ActiveConfig>(null)
  const [pendingName, setPendingName] = useState("")
  const lastActiveKeyRef = useRef<string | null>(null)

  const preparePresetNodes = useCallback((presetNodes: StackNode[]) => normalizeNodeIds(prepareNodes(presetNodes)), [prepareNodes])

  const resolveBaseNodes = useCallback(
    (base: ConfigBase): StackNode[] => {
      if (base.kind === "empty") return []
      if (base.kind === "current") return prepareUserNodes(nodes)
      const preset = getPresetById(base.id)
      return preset ? preparePresetNodes(preset.nodes) : []
    },
    [nodes, preparePresetNodes],
  )

  useEffect(() => {
    saveUserConfigs(userConfigs)
  }, [userConfigs])

  useEffect(() => {
    persistActiveConfig(activeConfig)
  }, [activeConfig])

  useEffect(() => {
    const key = activeConfig ? `${activeConfig.kind}:${activeConfig.id}` : null
    if (key === lastActiveKeyRef.current) return
    lastActiveKeyRef.current = key
    if (activeConfig?.kind === "user") {
      const config = userConfigs.find((item) => item.id === activeConfig.id)
      setBaseline(config ? JSON.stringify(prepareUserNodes(config.nodes)) : null)
    } else {
      setBaseline(null)
    }
  }, [activeConfig, userConfigs])

  useEffect(() => {
    if (activeConfig?.kind !== "user" || baseline == null) {
      setDirty(false)
      return
    }
    setDirty(JSON.stringify(nodes) !== baseline)
  }, [nodes, activeConfig, baseline])

  const applyConfig = useCallback(
    (target: ActiveConfig) => {
      if (!target) return
      if (target.kind === "preset") {
        const preset = getPresetById(target.id)
        if (!preset) return
        dispatch({ type: NodesActionType.IMPORT, payload: preparePresetNodes(preset.nodes) })
      } else {
        const config = userConfigs.find((item) => item.id === target.id)
        if (!config) return
        dispatch({ type: NodesActionType.IMPORT, payload: prepareUserNodes(config.nodes) })
      }
      setActiveConfig(target)
    },
    [dispatch, preparePresetNodes, userConfigs],
  )

  const loadConfig = useCallback(
    (target: ActiveConfig) => {
      if (!target) return
      const isSame = activeConfig != null && activeConfig.kind === target.kind && activeConfig.id === target.id
      if (isSame) return
      if (dirty && activeConfig?.kind === "user") {
        const config = userConfigs.find((item) => item.id === activeConfig.id)
        setPendingName(config?.name ?? "")
        setPendingSwitch(target)
        return
      }
      applyConfig(target)
    },
    [activeConfig, applyConfig, dirty, userConfigs],
  )

  const createConfig = useCallback(
    (name: string, base: ConfigBase) => {
      const trimmed = name.trim()
      if (!trimmed || isNameTaken(trimmed, userConfigs)) return
      const baseNodes = resolveBaseNodes(base)
      const now = Date.now()
      const config: UserConfig = { id: createConfigId(), name: trimmed, nodes: baseNodes, createdAt: now, updatedAt: now }
      setUserConfigs((prev) => [...prev, config])
      setActiveConfig({ kind: "user", id: config.id })
      setBaseline(JSON.stringify(baseNodes))
      dispatch({ type: NodesActionType.IMPORT, payload: baseNodes })
      setCreateDialog((prev) => ({ ...prev, open: false }))
      toast.success(t("toasts.config-created", { name: trimmed }))
    },
    [dispatch, resolveBaseNodes, t, userConfigs],
  )

  const saveActiveConfig = useCallback(() => {
    if (activeConfig?.kind === "user") {
      if (!dirty) return
      const config = userConfigs.find((item) => item.id === activeConfig.id)
      if (!config) return
      setUserConfigs((prev) => prev.map((item) => (item.id === config.id ? { ...item, nodes, updatedAt: Date.now() } : item)))
      setBaseline(JSON.stringify(nodes))
      toast.success(t("toasts.config-saved", { name: config.name }))
      return
    }
    setCreateDialog({ open: true, mode: "name-only" })
  }, [activeConfig, dirty, nodes, t, userConfigs])

  const renameConfig = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed || isNameTaken(trimmed, userConfigs, id)) return
      setUserConfigs((prev) => prev.map((item) => (item.id === id ? { ...item, name: trimmed, updatedAt: Date.now() } : item)))
      toast.success(t("toasts.config-renamed", { name: trimmed }))
    },
    [t, userConfigs],
  )

  const deleteConfig = useCallback(
    (id: string) => {
      saveUserConfigs(userConfigs.filter((item) => item.id !== id))
      setUserConfigs((prev) => prev.filter((item) => item.id !== id))
      if (activeConfig?.kind === "user" && activeConfig.id === id) {
        const fallback: ActiveConfig = { kind: "preset", id: CONFIG_PRESETS[0].id }
        const preset = getPresetById(fallback.id)
        if (preset) {
          dispatch({ type: NodesActionType.IMPORT, payload: preparePresetNodes(preset.nodes) })
          setActiveConfig(fallback)
        } else {
          setActiveConfig(null)
        }
      }
      toast.success(t("toasts.config-deleted"))
    },
    [activeConfig, dispatch, preparePresetNodes, t, userConfigs],
  )

  const openCreateDialog = useCallback((mode: CreateDialogMode = "full") => {
    setCreateDialog({ open: true, mode })
  }, [])

  const activeName = useMemo(() => {
    if (activeConfig?.kind === "preset") return getPresetById(activeConfig.id)?.name ?? t("config-presets.select")
    if (activeConfig?.kind === "user") return userConfigs.find((item) => item.id === activeConfig.id)?.name ?? t("config-presets.select")
    return t("config-presets.select")
  }, [activeConfig, userConfigs, t])

  const saveRef = useRef(saveActiveConfig)
  useEffect(() => {
    saveRef.current = saveActiveConfig
  }, [saveActiveConfig])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return
      event.preventDefault()
      if (createDialog.open || pendingSwitch !== null) return
      if (event.shiftKey) {
        setCreateDialog((prev) => ({ ...prev, open: true, mode: "name-only" }))
        return
      }
      saveRef.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [createDialog.open, pendingSwitch])

  const value: ConfigsContextValue = useMemo(
    () => ({
      userConfigs,
      activeConfig,
      activeName,
      dirty,
      createDialogOpen: createDialog.open,
      createDialogMode: createDialog.mode,
      loadConfig,
      createConfig,
      saveActiveConfig,
      renameConfig,
      deleteConfig,
      openCreateDialog,
    }),
    [
      userConfigs,
      activeConfig,
      activeName,
      dirty,
      createDialog.open,
      createDialog.mode,
      loadConfig,
      createConfig,
      saveActiveConfig,
      renameConfig,
      deleteConfig,
      openCreateDialog,
    ],
  )

  return (
    <ConfigsContext.Provider value={value}>
      {children}
      <ConfigCreateDialog
        open={createDialog.open}
        mode={createDialog.mode}
        onOpenChange={(open) => setCreateDialog((prev) => ({ ...prev, open }))}
        onSubmit={createConfig}
      />
      <UnsavedChangesDialog
        open={pendingSwitch !== null}
        name={pendingName}
        onSave={() => {
          saveActiveConfig()
          applyConfig(pendingSwitch)
          setPendingSwitch(null)
        }}
        onDiscard={() => {
          applyConfig(pendingSwitch)
          setPendingSwitch(null)
        }}
        onCancel={() => setPendingSwitch(null)}
        onClosed={() => setPendingName("")}
      />
    </ConfigsContext.Provider>
  )
}

export function useConfigs(): ConfigsContextValue {
  const ctx = useContext(ConfigsContext)
  if (!ctx) {
    throw new Error("useConfigs must be used within a ConfigsProvider")
  }
  return ctx
}
