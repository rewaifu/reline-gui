/** App-wide wording: field labels, placeholders, control names. Values that
 * live inside a select are the raw wire strings and are never translated. */

export const ru = {
  app: {
    switchLanguage: "Переключить на {language}",
  },
  ui: {
    select: "Выберите…",
    openOptions: "Открыть список",
    increase: "Увеличить {label}",
    decrease: "Уменьшить {label}",
    single: "значение",
    list: "список",
  },
};

export const en: typeof ru = {
  app: {
    switchLanguage: "Switch to {language}",
  },
  ui: {
    select: "Select…",
    openOptions: "Open options",
    increase: "Increase {label}",
    decrease: "Decrease {label}",
    single: "single",
    list: "list",
  },
};
