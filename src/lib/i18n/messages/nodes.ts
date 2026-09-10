/** Node names as the editor shows them. The wire keeps the raw node type
 * (`folder_reader`); `PureNodeType` values that only exist on the wire
 * (`halftone`, `download`, `unarchive`) are here too — the run journal shows
 * a step under the same name the editor uses for the node that performs it. */

export const ru = {
  node: {
    folder_reader: "Чтение папки",
    folder_writer: "Запись папки",
    upscale: "Апскейл",
    sharp: "Резкость",
    resize: "Ресайз",
    screentone: "Скринтон",
    level: "Уровни",
    cvt_color: "Цветовое пространстово",
    halftone: "Скринтон",
  },
};

export const en: typeof ru = {
  node: {
    folder_reader: "Folder Reader",
    folder_writer: "Folder Writer",
    upscale: "Upscale",
    sharp: "Sharp",
    resize: "Resize",
    screentone: "Screentone",
    level: "Level",
    cvt_color: "Cvt Color",
    halftone: "Halftone",
  },
};
