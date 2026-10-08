import { useEffect, useMemo, useReducer, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ThemeProvider } from "next-themes"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { Toaster } from "~/components/ui/sonner"
import { TooltipProvider } from "~/components/ui/tooltip"
import { ActiveNodeContext, NodesContext, NodesDispatchContext, ModelsContext } from "~/context/contexts"
import { nodesReducer } from "~/context/reducer"
import { MODELS } from "~/constants"
import { modelsQueryOptions } from "~/lib/queries"
import { loadInitialNodes } from "~/lib/nodes-storage"
import { ConfigToolbar } from "~/components/config/config-toolbar"
import { CodeSection } from "~/components/layout/code-section.tsx"
import { NodesSection } from "~/components/layout/nodes-section.tsx"
import { AppHeader } from "~/components/layout/app-header"
import { FooterBar, TauriFooter } from "~/components/layout/footer-bar"
import { BackendProvider, useBackendContext } from "~/components/providers/backend-provider"
import { ConfigsProvider } from "~/components/providers/configs-provider"
import { PreferencesProvider } from "~/components/providers/preferences-provider"
import { LocalModelsProvider } from "~/components/providers/local-models-provider"
import { ModelDownloadsProvider } from "~/components/providers/model-downloads-provider"
import { SettingsProvider } from "~/components/providers/settings-provider"
import { UpdaterProvider } from "~/components/providers/updater-provider"
import { TauriSettingsHost, WebSettingsHost } from "~/components/settings/settings-host"
import { useIsTauri } from "~/hooks/useIsTauri"
import { useCustomTitlebar } from "~/hooks/useCustomTitlebar"
import { usePrepareNodes, useSyncLocalModelMatches } from "~/hooks/usePrepareNodes"

const queryClient = new QueryClient()

// Reveals the main window (and dismisses the splashscreen) once the essential
// startup backend checks have resolved. Must live inside BackendProvider so it
// can read `startupReady`.
function SplashGate() {
  const isTauri = useIsTauri()
  const { startupReady } = useBackendContext()

  useEffect(() => {
    if (!isTauri || !startupReady) return
    // Uses a timer instead of requestAnimationFrame because hidden WebView2
    // windows throttle rAF, which would keep the main window hidden forever.
    const id = window.setTimeout(() => {
      void invoke("show_main_window").catch(() => {})
    }, 0)
    return () => window.clearTimeout(id)
  }, [isTauri, startupReady])

  return null
}

function HomePage() {
  const { data: models = MODELS } = useQuery(modelsQueryOptions)
  const isTauri = useIsTauri()
  const customTitlebar = useCustomTitlebar()
  const prepareNodes = usePrepareNodes()

  const [nodes, dispatch] = useReducer(nodesReducer, undefined, () => loadInitialNodes(prepareNodes))
  useSyncLocalModelMatches(nodes, dispatch)
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null)
  const activeNodeValue = useMemo(() => ({ activeNodeId, setActiveNodeId }), [activeNodeId])

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
      <ConfigToolbar />
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
      <AppHeader />
      <NodesContext.Provider value={nodes}>
        <NodesDispatchContext.Provider value={dispatch}>
          <ActiveNodeContext.Provider value={activeNodeValue}>
            <ConfigsProvider>
              <ModelsContext.Provider value={models}>
                {isTauri ? (
                  <BackendProvider>
                    <SplashGate />
                    {content}
                  </BackendProvider>
                ) : (
                  content
                )}
              </ModelsContext.Provider>
            </ConfigsProvider>
          </ActiveNodeContext.Provider>
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
              <ModelDownloadsProvider>
                <SettingsProvider>
                  <UpdaterProvider>
                    <HomePage />
                    <Toaster position="top-center" />
                  </UpdaterProvider>
                </SettingsProvider>
              </ModelDownloadsProvider>
            </LocalModelsProvider>
          </PreferencesProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
