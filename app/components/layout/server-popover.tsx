import { IconCheck, IconLoader2, IconServer, IconServerOff, IconSettings, IconX } from "@tabler/icons-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useBackendContext } from "~/components/providers/backend-provider"
import { useSettings } from "~/components/providers/settings-provider"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover"
import { Separator } from "~/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"

const GRAY = "#6b7280"
const GREEN = "#22c55e"
const RED = "#ef4444"

export function ServerPopover() {
  const { t } = useTranslation()
  const {
    stage,
    installingDeps,
    serverRunning,
    serverPort,
    depsStatus,
    depsReady,
    preferredPort,
    setPreferredPort,
    handleStartServer,
    handleStopServer,
    handleCheckPortFree,
  } = useBackendContext()
  const { openSettings } = useSettings()
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<boolean | null>(null)

  const isError = stage === "error"
  const isStarting = stage === "starting"
  const showDepsPrompt = depsStatus != null && !depsReady
  const dotColor = isError ? RED : serverRunning ? GREEN : GRAY
  const listeningAddress = `127.0.0.1:${serverPort ?? ""}`

  const handleCheckPort = async () => {
    if (preferredPort === "" || checking) return
    setChecking(true)
    setCheckResult(null)
    try {
      setCheckResult(await handleCheckPortFree(preferredPort))
    } catch {
      setCheckResult(false)
    } finally {
      setChecking(false)
    }
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button size="icon-lg" variant="outline" className="relative shrink-0" aria-label={t("backend.serverSettings")}>
                  <IconServer />
                  <span
                    className="pointer-events-none absolute top-1 left-1 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                    style={{ backgroundColor: dotColor }}
                  />
                </Button>
              }
            />
          }
        />
        <TooltipContent>{t("backend.serverSettings")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" side="top" sideOffset={10} className="w-72 gap-3">
        <div className="flex flex-col gap-2">
          <PopoverTitle className="text-center text-xs font-medium text-muted-foreground">{t("backend.serverSettings")}</PopoverTitle>
          <Separator />
        </div>
        {showDepsPrompt ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-center text-xs text-muted-foreground">{t("backend.installDepsPrompt")}</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                openSettings("deps")
              }}
            >
              <IconSettings />
              {t("backend.settings")}
            </Button>
          </div>
        ) : serverRunning ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
            <span className="truncate">{t("backend.listeningOn", { address: listeningAddress })}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("backend.port")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1024}
                max={65535}
                maxLength={4}
                placeholder={t("backend.portAuto")}
                className="h-8 text-xs"
                value={preferredPort === "" ? "" : String(preferredPort)}
                onChange={(e) => {
                  const raw = e.target.value.slice(0, 4)
                  setCheckResult(null)
                  if (raw === "") {
                    setPreferredPort("")
                    return
                  }
                  const n = Number(raw)
                  if (Number.isFinite(n)) setPreferredPort(n)
                }}
              />
              <Button variant="outline" size="sm" disabled={preferredPort === "" || checking} onClick={handleCheckPort}>
                {checking ? <IconLoader2 className="animate-spin" /> : null}
                {t("backend.checkPort")}
              </Button>
            </div>
            {checkResult != null ? (
              <div className={`flex items-center gap-1.5 text-xs ${checkResult ? "text-green-500" : "text-red-500"}`}>
                {checkResult ? <IconCheck className="size-3.5" /> : <IconX className="size-3.5" />}
                <span>{checkResult ? t("backend.portFree", { port: preferredPort }) : t("backend.portInUse", { port: preferredPort })}</span>
              </div>
            ) : null}
          </div>
        )}

        {showDepsPrompt ? null : serverRunning ? (
          <Button variant="destructive" className="w-full" onClick={handleStopServer}>
            <IconServerOff />
            {t("backend.stopServer")}
          </Button>
        ) : (
          <Button variant="default" className="w-full" onClick={handleStartServer} disabled={isStarting || installingDeps || !depsReady}>
            {isStarting || installingDeps ? <IconLoader2 className="animate-spin" /> : <IconServer />}
            {t("backend.startServer")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
