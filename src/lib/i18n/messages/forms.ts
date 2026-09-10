/** Every parameter label of every node form, plus the wording the shared row
 * components own. Labels are grouped by node type so a form reads its own
 * block. */

export const ru = {
  form: {
    folder_reader: {
      path: "Путь к папке",
      mode: "Режим",
      recursive: "Рекурсивно",
      unarchive: "Распаковка архивов",
    },
    folder_writer: {
      path: "Путь к папке",
      format: "Формат",
    },
    upscale: {
      own: "Своя модель",
      model: "Путь к модели",
      modelPlaceholder: "Имя модели",
      dtype: "Точность",
      tiler: "Метод тайлинга",
      exactSize: "Размер плитки",
      allowCpu: "Разрешить апскейл на CPU",
      targetScale: "Целевой масштаб (необязательно)",
    },
    resize: {
      type: "Тип изменения",
      width: "Ширина (px)",
      height: "Высота (px)",
      percent: "Проценты",
      filter: "Фильтр",
      spread: "Развороты",
      spreadSize: "Ширина разворота",
    },
    sharp: {
      lowInput: "Нижний порог входа",
      highInput: "Верхний порог входа",
      gamma: "Гамма",
      white: "Порог белого",
      black: "Порог чёрного",
      canny: "Canny",
      cannyType: "Тип Canny",
    },
    level: {
      lowInput: "Нижний порог входа",
      highInput: "Верхний порог входа",
      lowOutput: "Нижний порог выхода",
      highOutput: "Верхний порог выхода",
      gamma: "Гамма",
    },
    screentone: {
      halftoneMode: "Режим",
      channel: "Канал",
      dotSize: "Размер точки",
      angle: "Поворот",
      dotType: "Тип точки",
      disableAutoDot: "Отключить авто-точку",
      ssaaScale: "Масштаб SSAA",
    },
    cvt_color: {
      conversion: "Преобразование",
    },
  },
};

export const en: typeof ru = {
  form: {
    folder_reader: {
      path: "Path to folder",
      mode: "Mode",
      recursive: "Recursive",
      unarchive: "Unarchive",
    },
    folder_writer: {
      path: "Path to folder",
      format: "Format",
    },
    upscale: {
      own: "Own model",
      model: "Model path",
      modelPlaceholder: "Model name",
      dtype: "Precision",
      tiler: "Tiling method",
      exactSize: "Tiler size",
      allowCpu: "Allow CPU upscale",
      targetScale: "Target scale (optional)",
    },
    resize: {
      type: "Resize type",
      width: "Width (px)",
      height: "Height (px)",
      percent: "Percent",
      filter: "Filter",
      spread: "Spreads",
      spreadSize: "Spread width",
    },
    sharp: {
      lowInput: "Low input",
      highInput: "High input",
      gamma: "Gamma",
      white: "White point",
      black: "Black point",
      canny: "Canny",
      cannyType: "Canny type",
    },
    level: {
      lowInput: "Low input",
      highInput: "High input",
      lowOutput: "Low output",
      highOutput: "High output",
      gamma: "Gamma",
    },
    screentone: {
      halftoneMode: "Mode",
      channel: "Channel",
      dotSize: "Dot size",
      angle: "Rotation",
      dotType: "Dot type",
      disableAutoDot: "Disable auto dot",
      ssaaScale: "SSAA scale",
    },
    cvt_color: {
      conversion: "Conversion",
    },
  },
};
