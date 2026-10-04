import { useBackendContext } from "~/components/providers/backend-provider"
import { SettingsDialog } from "~/components/settings/settings-dialog"
import { useSettings } from "~/components/providers/settings-provider"

export function TauriSettingsHost() {
  const backend = useBackendContext()
  const { open, section, setOpen } = useSettings()

  return (
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
    />
  )
}

export function WebSettingsHost() {
  const { open, section, setOpen } = useSettings()

  return <SettingsDialog open={open} onOpenChange={setOpen} isTauri={false} section={section} />
}
