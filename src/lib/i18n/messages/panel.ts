/** The settings panel: its four tabs, the code view, presets and the run
 * controls. Messages the runner itself produces live in `run.ts`. */

export const ru = {
  panel: {
    tabs: {
      instructions: "Инструкции",
      code: "Код",
      presets: "Пресеты",
      run: "Запуск",
    },
    instructions: {
      empty:
        "Выберите ноду, чтобы увидеть её инструкцию. Ноды обрабатываются сверху вниз: чтение → обработка → запись.",
    },
    code: {
      json: "Конфиг JSON",
      apply: "Применить правку",
      cancel: "Отменить правку",
      edit: "Править код",
      import: "Импортировать конфиг",
      importTitle: "Импортировать конфиг из файла",
      copy: "Скопировать код",
      download: "Скачать конфиг",
      downloadTitle: "Скачать конфиг файлом",
    },
    presets: {
      label: "Пресеты:",
      aria: "Пресет",
      namePlaceholder: "Название пресета",
      save: "Сохранить",
      remove: "Удалить",
      removeNamed: "Удалить пресет {name}",
      hide: "Скрыть стоковый пресет",
      restore: "Вернуть стоковые ({count})",
      description: {
        default: "Стандартный конвейер со всеми шагами",
        mangascale:
          "Конфиг для mangascale-моделей: семейство MangaJanai и wtp_MangaScale_GfisrV2",
        "atdl3-ssaa": "4x_dwtp_ds_atdl3 + Dot 7 SSAA 2",
        "moesrv2-ssaa": "4x_dwtp_ds_moesr_v2 + Dot 7 SSAA 2",
        "color-mosrl": "Цветной пресет с моделью umzi_digital_art_mosr_l",
        "color-heavy": "Цветной пресет с моделью IllustrationJanaiV3",
        "psd-to-png": "Конвертирует PSD в PNG",
        user: "Пользовательский пресет",
      },
    },
    status: {
      applied: "Конфиг применён",
      imported: "Импортирован файл «{name}»",
      presetApplied: "Пресет «{name}» применён",
      invalidJson: "Некорректный JSON: {detail}",
    },
    legacy: {
      notice: "конфиг старого формата перенесён — {details}",
      models: "модель {names} переведена на имя вместо пути",
      urls: "ссылки из базы: {names}",
      missing: "ссылка не найдена: {names}",
      unarchives: "распаковка: {names}",
    },
    run: {
      address: "Адрес запуска",
      start: "▶ Запустить",
      resume: "⟳ Продолжить",
      runId: "Прогон {run}",
      stop: "■ Стоп",
      connecting: "Подключение…",
      journal: "Журнал запуска",
      clearJournal: "Очистить журнал",
    },
  },
};

export const en: typeof ru = {
  panel: {
    tabs: {
      instructions: "Instructions",
      code: "Code",
      presets: "Presets",
      run: "Run",
    },
    instructions: {
      empty:
        "Pick a node to see its instructions. Nodes run top to bottom: read → process → write.",
    },
    code: {
      json: "Config JSON",
      apply: "Apply edit",
      cancel: "Discard edit",
      edit: "Edit code",
      import: "Import config",
      importTitle: "Import config from a file",
      copy: "Copy code",
      download: "Download config",
      downloadTitle: "Download config as a file",
    },
    presets: {
      label: "Presets:",
      aria: "Preset",
      namePlaceholder: "Preset name",
      save: "Save",
      remove: "Delete",
      removeNamed: "Delete preset {name}",
      hide: "Hide stock preset",
      restore: "Restore stock ({count})",
      description: {
        default: "The standard pipeline with every step",
        mangascale:
          "Config for mangascale models: the MangaJanai family and wtp_MangaScale_GfisrV2",
        "atdl3-ssaa": "4x_dwtp_ds_atdl3 + Dot 7 SSAA 2",
        "moesrv2-ssaa": "4x_dwtp_ds_moesr_v2 + Dot 7 SSAA 2",
        "color-mosrl": "Colour preset with the umzi_digital_art_mosr_l model",
        "color-heavy": "Colour preset with the IllustrationJanaiV3 model",
        "psd-to-png": "Converts PSD to PNG",
        user: "User preset",
      },
    },
    status: {
      applied: "Config applied",
      imported: "Imported the file “{name}”",
      presetApplied: "Preset “{name}” applied",
      invalidJson: "Invalid JSON: {detail}",
    },
    legacy: {
      notice: "legacy config migrated — {details}",
      models: "model {names} moved from a path to a name",
      urls: "links from the database: {names}",
      missing: "no link found: {names}",
      unarchives: "unarchive: {names}",
    },
    run: {
      address: "Run address",
      start: "▶ Start",
      resume: "⟳ Resume",
      runId: "Run {run}",
      stop: "■ Stop",
      connecting: "Connecting…",
      journal: "Run journal",
      clearJournal: "Clear the journal",
    },
  },
};
