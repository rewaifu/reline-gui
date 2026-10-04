import { useReducer } from "react"
import { ThemeProvider } from "next-themes"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { Toaster } from "~/components/ui/sonner"
import { TooltipProvider } from "~/components/ui/tooltip"
import { NodesContext, NodesDispatchContext, ModelsContext } from "~/context/contexts"
import { nodesReducer } from "~/context/reducer"
import { MODELS } from "~/constants"
import { modelsQueryOptions } from "~/lib/queries"
import { loadInitialNodes } from "~/lib/nodes-storage"
import { ConfigToolbar } from "~/components/config/config-toolbar"
import { CodeSection } from "~/components/config/code-section"
import { NodesSection } from "~/components/nodes/nodes-section"
import { AppHeader } from "~/components/layout/app-header"
import { FooterBar, TauriFooter } from "~/components/layout/footer-bar"
import { BackendProvider } from "~/components/providers/backend-provider"
import { PreferencesProvider } from "~/components/providers/preferences-provider"
import { LocalModelsProvider } from "~/components/providers/local-models-provider"
import { SettingsProvider } from "~/components/providers/settings-provider"
import { TauriSettingsHost, WebSettingsHost } from "~/components/settings/settings-host"
import { useIsTauri } from "~/hooks/useIsTauri"
import { useCustomTitlebar } from "~/hooks/useCustomTitlebar"
import { usePrepareNodes } from "~/hooks/usePrepareNodes"

const queryClient = new QueryClient()

function HomePage() {
  const { data: models = MODELS } = useQuery(modelsQueryOptions)
  const isTauri = useIsTauri()
  const customTitlebar = useCustomTitlebar()
  const prepareNodes = usePrepareNodes()

  const [nodes, dispatch] = useReducer(nodesReducer, undefined, () => loadInitialNodes(prepareNodes))

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
