import type { MouseEvent as ReactMouseEvent } from "react"
import { useRef, useState } from "react"
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
import { cn } from "~/lib/utils"

const RAPID_CLICK_MS = 500
const CLICKS_TO_TRIGGER = 5
const COMIC_SANS = '"Comic Sans MS", "Comic Sans", cursive'

export function AppHeader() {
  const { t } = useTranslation()
  const isTauri = useIsTauri()
  const customTitlebar = useCustomTitlebar()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const conf = isDesktop ? t("home-page.title") : t("home-page.title").substring(0, 6)
  const re = isDesktop ? "Reline " : "Re: "

  const [stage, setStage] = useState(0)
  const clickCountRef = useRef(0)
  const lastClickRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playSound = (file: string, pitchDown = false) => {
    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio
    audio.pause()
    audio.src = `${import.meta.env.BASE_URL}${file}`
    audio.volume = 0.05
    audio.playbackRate = pitchDown ? 0.5 : 1
    const withPitch = audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }
    withPitch.preservesPitch = !pitchDown
    withPitch.webkitPreservesPitch = !pitchDown
    audio.currentTime = 0
    void audio.play().catch(() => {})
  }

  const handleLogoClick = () => {
    if (!isTauri) return
    const now = Date.now()
    clickCountRef.current = now - lastClickRef.current < RAPID_CLICK_MS ? clickCountRef.current + 1 : 1
    lastClickRef.current = now
    if (clickCountRef.current < CLICKS_TO_TRIGGER) return
    clickCountRef.current = 0
    const next = (stage + 1) % 3
    setStage(next)
    if (next === 1) playSound("fart.mp3")
    else if (next === 2) playSound("fart.mp3", true)
    else playSound("boop.mp3")
  }

  return (
    <header
      className="flex justify-between h-15 bg-card rounded-xl ring-1 ring-foreground/10 p-2 px-4 mt-3 md:mt-5 mx-3 md:mx-5"
      data-tauri-drag-region={customTitlebar || undefined}
    >
      <div className="flex flex-row gap-2 items-center">
        {stage === 0 && <KumaLogo />}
        <div className="flex flex-row gap-2">
          <h1
            onClick={handleLogoClick}
            style={stage === 2 ? { fontFamily: COMIC_SANS } : undefined}
            className={cn(
              "gap-1.5 scroll-m-20 text-2xl font-semibold tracking-tight select-none trasition duration-150 active:text-primary",
              stage === 0 && "hover:tracking-normal active:font-normal",
            )}
          >
            {stage === 0 ? (
              <>
                <span>
                  <b>
                    <i>{re}</i>
                  </b>
                </span>
                {conf}
              </>
            ) : (
              <span>{stage === 1 ? "Reline Local GUI" : "microreline"}</span>
            )}
          </h1>
          {stage === 0 && (
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
          )}
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
