import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"

import { en } from "./locales/en"
import { ru } from "./locales/ru"

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
    },
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  })

if (import.meta.hot) {
  import.meta.hot.accept(["./locales/en", "./locales/ru"], ([enModule, ruModule]) => {
    if (enModule) i18n.addResourceBundle("en", "translation", enModule.en, true, true)
    if (ruModule) i18n.addResourceBundle("ru", "translation", ruModule.ru, true, true)
  })
}

export default i18n
