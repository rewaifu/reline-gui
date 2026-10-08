export enum LANG {
    EN = "en",
    RU = "ru",
}

export enum LANG_FLAG {
    en = "gb",
    ru = "ru",
}

export const AVAILABLE_LANGUAGES = [
    { code: LANG.EN, label: "English", flag: LANG_FLAG.en },
    { code: LANG.RU, label: "Русский", flag: LANG_FLAG.ru },
] as const;
