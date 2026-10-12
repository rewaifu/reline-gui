/** Findings of the pipeline validator (`~/lib/pipeline`): what is wrong with
 * the stack the user is building, shown on the card, in the run tab and in the
 * journal when a run is refused. */

export const ru = {
  diag: {
    title: "Проблемы конфига",
    empty: "В стеке нет нод",
    noneEnabled: "Все ноды выключены — запускать нечего",
    noReader: "Нет включённой ноды чтения папки",
    noWriter: "Нет включённой ноды записи — результат никуда не сохранится",
    field: "Поле «{field}»: {detail}",
    orphan:
      "Тип «{type}» не определён в этой сборке — раннер может его не знать",
    validateFailed: "Проверка ноды не выполнилась: {detail}",
    convertFailed: "Нода не собралась в конфиг: {detail}",
    exportFailed: "Конфиг не удалось превратить в текст: {detail}",
    errors: "Ошибок: {count}",
    warnings: "Предупреждений: {count}",
  },
};

export const en: typeof ru = {
  diag: {
    title: "Config problems",
    empty: "The stack has no nodes",
    noneEnabled: "Every node is switched off — nothing to run",
    noReader: "No enabled folder reader node",
    noWriter: "No enabled writer node — the result will not be saved",
    field: "Field “{field}”: {detail}",
    orphan:
      "Type “{type}” is not defined in this build — the runner may not know it",
    validateFailed: "The node check did not run: {detail}",
    convertFailed: "The node could not be built into the config: {detail}",
    exportFailed: "The config could not be turned into text: {detail}",
    errors: "Errors: {count}",
    warnings: "Warnings: {count}",
  },
};
