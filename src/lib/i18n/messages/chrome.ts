/** Wording owned by the app chrome: the node card and node list headers, the
 * add-node menu knob and the workspace top bar. */

export const ru = {
  chrome: {
    panels: "Панели",
    columns: {
      left: "Узлы",
      middle: "Стек",
      right: "Настройки",
    },
    resizeColumn: "Изменить ширину: {label}",
    reorderTitle: "Перетащите или нажмите ↑ / ↓",
    reorder: "Изменить порядок ноды",
    reorderNamed: "Изменить порядок: {name}",
    rename: "Переименовать ноду",
    nodeName: "Имя ноды",
    collapse: "Свернуть ноду",
    remove: "Удалить ноду",
    removeNamed: "Удалить {name}",
    enable: "Включить {name}",
    addNode: "Добавить ноду",
    /* Shown by the error boundary around the workspace. Solid 2 halts the
     * whole reactive system on an uncaught error, so this screen is the
     * difference between "one form broke" and "every input on the page is
     * dead". */
    crash: {
      title: "Интерфейс сломался",
      hint: "Состояние нод сохранено. Перезапустите интерфейс — если повторяется, пришлите текст ошибки ниже.",
      reload: "Перезагрузить страницу",
      resetNodes: "Сбросить ноды и перезагрузить",
      resetNodesAsk:
        "Сбросить все ноды? Сохранённая конфигурация будет удалена.",
      /* The reactive-system watchdog: the page is alive but nothing on it
       * reacts any more, so this has to explain what happened without a UI. */
      halted: "Интерфейс перестал реагировать",
      haltedHint:
        "Страница открыта, но ни один элемент не отвечает: внутренняя ошибка остановила обновления. Ноды сохранены — перезагрузите страницу, и если это повторится, пришлите ошибку ниже.",
      lastError: "Последняя ошибка:",
      copyError: "Скопировать отчёт",
    },
  },
};

export const en: typeof ru = {
  chrome: {
    panels: "Panels",
    columns: {
      left: "Nodes",
      middle: "Stack",
      right: "Settings",
    },
    resizeColumn: "Resize: {label}",
    reorderTitle: "Drag, or press ↑ / ↓",
    reorder: "Reorder node",
    reorderNamed: "Reorder: {name}",
    rename: "Rename node",
    nodeName: "Node name",
    collapse: "Collapse node",
    remove: "Delete node",
    removeNamed: "Delete {name}",
    enable: "Enable {name}",
    addNode: "Add node",
    crash: {
      title: "The interface broke",
      hint: "Your nodes are saved. Restart the interface — if it keeps happening, send the error text below.",
      reload: "Reload the page",
      resetNodes: "Reset nodes and reload",
      resetNodesAsk:
        "Reset every node? The saved configuration will be deleted.",
      halted: "The interface stopped responding",
      haltedHint:
        "The page is open, but nothing on it reacts: an internal error stopped the updates. Your nodes are saved — reload the page, and if it happens again, send the error below.",
      lastError: "Last error:",
      copyError: "Copy the report",
    },
  },
};
