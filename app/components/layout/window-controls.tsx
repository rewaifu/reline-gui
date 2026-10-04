import { IconCopy, IconMinus, IconSquare, IconX } from "@tabler/icons-react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "~/components/ui/button"

export function WindowControls() {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | undefined
    const win = getCurrentWindow()

    win.isMaximized().then((value) => {
      if (active) setMaximized(value)
    })
    win
      .onResized(() => {
        win.isMaximized().then((value) => {
          if (active) setMaximized(value)
        })
      })
      .then((fn) => {
        unlisten = fn
      })

    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon-lg" aria-label={t("window.minimize")} onClick={() => getCurrentWindow().minimize()}>
        <IconMinus />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={maximized ? t("window.restore") : t("window.maximize")}
        onClick={() => getCurrentWindow().toggleMaximize()}
      >
        {maximized ? <IconCopy className="size-3 rotate-90" stroke={2.5} /> : <IconSquare className="size-3" stroke={2.5} />}
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={t("window.close")}
        className="hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white"
        onClick={() => getCurrentWindow().close()}
      >
        <IconX />
      </Button>
    </div>
  )
}
