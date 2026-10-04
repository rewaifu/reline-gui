import type { MouseEvent as ReactMouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { KumaLogo } from "~/svg/kuma.tsx"
import { LanguageSelect } from "~/components/layout/language-select.tsx"
import { ModeToggle } from "~/components/layout/mode-toggle"
import { WindowControls } from "~/components/layout/window-controls"
import { Separator } from "~/components/ui/separator.tsx"
import { useCustomTitlebar } from "~/hooks/useCustomTitlebar"
import { useIsTauri } from "~/hooks/useIsTauri"
import { useMediaQuery } from "~/hooks/useMediaQuery"

export function AppHeader() {
  const { t } = useTranslation()
  const isTauri = useIsTauri()
  const customTitlebar = useCustomTitlebar()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const conf = isDesktop ? t("home-page.title") : t("home-page.title").substring(0, 6)
  const re = isDesktop ? "Reline " : "Re: "

  return (
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
                      onClick: (event: ReactMouseEvent<HTMLAnchorElement>) => {
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
  )
}
