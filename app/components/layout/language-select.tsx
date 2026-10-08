import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui"
import { useTranslation } from "react-i18next"
import { AVAILABLE_LANGUAGES } from "~/i18n/languages-enum"
import { IconCheck, IconLanguage } from "@tabler/icons-react"
import { FlagIcon } from "~/components/layout/flag-icon"
import React from "react"

export function LanguageSelect() {
  const { i18n } = useTranslation()
  const currentLang = AVAILABLE_LANGUAGES.find((l) => l.code === i18n.language) || AVAILABLE_LANGUAGES[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon-lg" className="relative">
          <IconLanguage className="size-[1.2rem] stroke-[1.8] -mb-[1px]" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {AVAILABLE_LANGUAGES.map((lang) => (
          <DropdownMenuItem key={lang.code} onClick={() => i18n.changeLanguage(lang.code)} className="flex items-center justify-between">
            <div className="flex items-center">
              <FlagIcon code={lang.flag} className="mr-2 h-3.5 w-5" />
              {lang.label}
            </div>
            {i18n.language === lang.code && <IconCheck size={16} className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
