import type React from "react"
import { useReducer, useState } from "react"
import { ThemeProvider } from "next-themes"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { invoke } from "@tauri-apps/api/core"
import { Toaster } from "~/components/ui/sonner"
import { NodesContext, NodesDispatchContext, ModelsContext } from "~/context/contexts"
import { nodesReducer } from "~/context/reducer"
import { DEFAULT_NODES, MODELS, STORAGE_KEY } from "~/constants"
import { modelsQueryOptions } from "~/lib/queries"
import { ModeToggle } from "~/components/mode-toggle"
import { CodeSection } from "~/components/code-section"
import { NodesSection } from "~/components/nodes-section"
import { KumaLogo } from "~/svg/kuma.tsx"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip"
import { Button } from "./components/ui/button"
import { IconCheck, IconCopy, IconDownload, IconFileUpload } from "@tabler/icons-react"
import { LanguageSelect } from "~/components/language-select.tsx"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useTranslation } from "react-i18next"
import { Dialog, DialogTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui"
import { CONFIG_PRESETS, getPresetById } from "~/lib/config-presets.ts"
import { Separator } from "~/components/ui/separator.tsx"
import { FileUploadDialogContent } from "~/components/file-upload-dialog-content.tsx"
import { FooterBar, TauriFooter } from "~/components/footer-bar"
import { WindowControls } from "~/components/window-controls"
import { BackendProvider } from "~/components/backend-provider"
import { PreferencesProvider } from "~/components/preferences-provider"
import { LocalModelsProvider } from "~/components/local-models-provider"
import { SettingsProvider } from "~/components/settings-provider"
import { TauriSettingsHost, WebSettingsHost } from "~/components/settings/settings-host"
import { useIsTauri } from "~/hooks/useIsTauri"
import { useCustomTitlebar } from "~/hooks/useCustomTitlebar"
import { usePrepareNodes } from "~/hooks/usePrepareNodes"
import { nodesToString, stringToNodes } from "~/lib/utils.ts"
import { NodesActionType } from "~/types/actions.ts"
import { toast } from "sonner"

const queryClient = new QueryClient()

function HomePage() {
  const { t } = useTranslation()
  const { data: models = MODELS } = useQuery(modelsQueryOptions)
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const isTauri = useIsTauri()
  const customTitlebar = useCustomTitlebar()
  const prepareNodes = usePrepareNodes()

  const [isCopied, setIsCopied] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string>("default")
  const handlePresetChange = (value: string | null) => {
    if (!value) return
    setSelectedPreset(value)
    const preset = getPresetById(value)
    if (preset) {
      const preparedNodes = prepareNodes(preset.nodes)
      dispatch({
        type: NodesActionType.IMPORT,
        payload: preparedNodes,
      })
      toast.success(t("toasts.preset-loaded", { name: preset.name }))
    }
  }

  const normalizeNodeIds = (nodes: typeof DEFAULT_NODES) => {
    const usedIds = new Set<number>()
    let nextId = 0

    return nodes.map((node, index) => {
      const fallbackId = index
      const rawId = typeof node.id === "number" ? node.id : fallbackId
      const candidate = Number.isNaN(rawId) ? fallbackId : rawId

      if (!usedIds.has(candidate)) {
        usedIds.add(candidate)
        nextId = Math.max(nextId, candidate + 1)
        return { ...node, id: candidate }
      }

      while (usedIds.has(nextId)) {
        nextId += 1
      }

      const normalized = { ...node, id: nextId }
      usedIds.add(nextId)
      nextId += 1
      return normalized
    })
  }

  const getInitialData = () => {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      try {
        const parsedNodes = JSON.parse(data)
        return normalizeNodeIds(prepareNodes(parsedNodes))
      } catch (error) {
        console.error("Err parsing from storage:", error)
        return prepareNodes(DEFAULT_NODES)
      }
    }
    return prepareNodes(DEFAULT_NODES)
  }

  const conf = isDesktop ? t("home-page.title") : t("home-page.title").substring(0, 6)
  const re = isDesktop ? "Reline " : "Re: "
  const [nodes, dispatch] = useReducer(nodesReducer, undefined, getInitialData)

  const content = (
    <>
      <div className="flex-1 overflow-hidden p-1 mx-2 md:mx-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 h-full">
          <NodesSection />
          <div className="hidden md:block h-full min-h-0">
            <CodeSection />
          </div>
        </div>
      </div>
      <div className="h-10 md:hidden bg-card rounded-xl ring-1 ring-foreground/10 p-1 mx-3">
        <div className="flex flex-row gap-1 items-center justify-center">
          <div className="flex flex-row gap-4 items-center">
            <Select value={selectedPreset} onValueChange={handlePresetChange}>
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
            <Separator orientation="vertical" className="mr-0.5" />
          </div>
          <Dialog>
            <Tooltip>
              <TooltipTrigger>
                <DialogTrigger
                  render={
                    <Button size="icon" variant="ghost">
                      <IconFileUpload />
                    </Button>
                  }
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("tooltips.import")}</p>
              </TooltipContent>
            </Tooltip>
            <FileUploadDialogContent
              onImport={(text) => {
                const parsedNodes = stringToNodes(text)
                const preparedNodes = prepareNodes(parsedNodes)
                dispatch({
                  type: NodesActionType.IMPORT,
                  payload: preparedNodes,
                })
              }}
            />
          </Dialog>
          <Tooltip>
            <TooltipTrigger>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(nodesToString(nodes)).then(() => {
                    setIsCopied(true)
                    toast.success(t("toasts.copied"))
                    setTimeout(() => {
                      setIsCopied(false)
                    }, 5000)
                  })
                }}
              >
                {isCopied ? <IconCheck /> : <IconCopy />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("tooltips.copy")}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                  const data = nodesToString(nodes)
                  if ("showSaveFilePicker" in window) {
                    try {
                      // @ts-ignore
                      const handle = await window.showSaveFilePicker({
                        suggestedName: "config.json",
                        types: [
                          {
                            description: "JSON File",
                            accept: { "application/json": [".json"] },
                          },
                        ],
                      })

                      const writable = await handle.createWritable()
                      await writable.write(data)
                      await writable.close()

                      toast.success(t("toasts.saved"))
                    } catch (err) {
                      console.error(err)
                    }
                  } else {
                    const blob = new Blob([data], { type: "application/json" })
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement("a")
                    link.href = url
                    link.download = "config.json"
                    link.click()
                    URL.revokeObjectURL(url)
                    toast.success(t("toasts.dl-started"))
                  }
                }}
              >
                <IconDownload />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("tooltips.download")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      {isTauri ? (
        <>
          <TauriFooter />
          <TauriSettingsHost />
        </>
      ) : (
        <>
          <FooterBar />
          <WebSettingsHost />
        </>
      )}
    </>
  )

  return (
    <main className="flex flex-col h-screen gap-2 md:gap-4" data-tauri-drag-region={customTitlebar || undefined}>
      <header
        className="flex justify-between h-15 bg-card rounded-xl ring-1 ring-foreground/10 p-2 px-4 mt-3 md:mt-5 mx-3 md:mx-5"
        data-tauri-drag-region={customTitlebar || undefined}
      >
        <div className="flex flex-row gap-2 items-center">
          <KumaLogo />
          <div className="flex flex-row gap-2">
            <h1 className="gap-1.5 scroll-m-20 text-2xl font-semibold tracking-tight select-none hover:tracking-normal trasition duration-150 active:font-normal active:text-primary">
              <span>
                <b>
                  <i>{re}</i>
                </b>
              </span>
              {conf}
            </h1>
            <h1 className="hidden md:flex scroll-m-20 text-xs font-light tracking-tight self-end mb-1 -ml-1 hover:text-primary hover:tracking-widest hover:font-semibold hover:text-sm trasition duration-150 select-none">
              <i>
                <a
                  href="https://github.com/rewaifu"
                  {...(isTauri
                    ? {
                        onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
                          event.preventDefault()
                          void invoke("open_url", { url: "https://github.com/rewaifu" })
                        },
                      }
                    : { target: "_blank", rel: "noreferrer" })}
                >
                  by rewaifu
                </a>
              </i>
            </h1>
          </div>
        </div>
        <div className="flex flex-row gap-1 self-center items-center">
          <div>
            <LanguageSelect />
          </div>
          <div className="self-center">
            <ModeToggle />
          </div>
          {customTitlebar ? (
            <>
              <Separator orientation="vertical" className="mx-2 h-6 data-vertical:self-center" />
              <WindowControls />
            </>
          ) : null}
        </div>
      </header>
      <NodesContext.Provider value={nodes}>
        <NodesDispatchContext.Provider value={dispatch}>
          <ModelsContext.Provider value={models}>{isTauri ? <BackendProvider>{content}</BackendProvider> : content}</ModelsContext.Provider>
        </NodesDispatchContext.Provider>
      </NodesContext.Provider>
    </main>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider delay={150}>
          <PreferencesProvider>
            <LocalModelsProvider>
              <SettingsProvider>
                <HomePage />
                <Toaster position="top-center" />
              </SettingsProvider>
            </LocalModelsProvider>
          </PreferencesProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
