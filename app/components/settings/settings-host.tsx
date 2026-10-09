import { Suspense, useEffect, useState } from "react"
import { useBackendContext } from "~/components/providers/backend-provider"
import { SettingsDialog } from "~/components/providers/lazy-dialogs"
import { ReadySignal } from "~/components/providers/ready-signal"
import { useSettings } from "~/components/providers/settings-provider"

// Loads the (heavy) settings dialog on first open, then keeps it mounted so the
// dialog's close animation and internal state survive reopen cycles.
function useLazyMount(open: boolean) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (open) setMounted(true)
  }, [open])
  return mounted
}

export function TauriSettingsHost() {
  const backend = useBackendContext()
  const { open, section, setOpen, markSettingsReady } = useSettings()
  const mounted = useLazyMount(open)

  if (!mounted) return null

  return (
    <Suspense fallback={null}>
      <SettingsDialog
        open={open}
        onOpenChange={setOpen}
        isTauri
        section={section}
        depsStatus={backend.depsStatus}
        versions={backend.versions}
        installingDeps={backend.installingDeps}
        statusMessage={backend.statusMessage}
        logs={backend.logs}
        uvProgress={backend.uvProgress}
        onInstall={backend.handleInstallDeps}
        cleanupSize={backend.cleanupSize}
        onCleanup={backend.handleCleanupDeps}
      />
      <ReadySignal onReady={markSettingsReady} />
    </Suspense>
  )
}

export function WebSettingsHost() {
  const { open, section, setOpen, markSettingsReady } = useSettings()
  const mounted = useLazyMount(open)

  if (!mounted) return null

  return (
    <Suspense fallback={null}>
      <SettingsDialog open={open} onOpenChange={setOpen} isTauri={false} section={section} />
      <ReadySignal onReady={markSettingsReady} />
    </Suspense>
  )
}
