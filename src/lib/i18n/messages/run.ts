/** Everything the run area says: the stage titles of `progress` frames, the
 * formatters over them, and the journal lines both WebSocket clients write.
 *
 * Journal lines are stored as keys (not as formatted text) — the log outlives
 * a run, so a line written in Russian must be readable in English the moment
 * the switcher flips. */

export const ru = {
  run: {
    stage: {
      download: "Скачивание моделей",
      unarchive: "Распаковка архивов",
      read: "Чтение файлов",
      process: "Обработка изображений",
      write: "Запись результатов",
    },
    phase: {
      preprocess: "Предобработка",
      process: "Обработка",
    },
    preparing: "Подготовка…",
    done: "Готово",
    doneOutput: "Готово: {output}",
    stopped: "Остановлено",
    error: "Ошибка: {detail}",
    serverError: "Ошибка сервера: {detail}",
    unknown: "неизвестно",
    echoLost: "Соединение потеряно: нет ответа на echo",
    reconnecting: "Переподключение ({attempt}/{total})…",
    reconnected: "Соединение восстановлено",
    recovered: "Прогон найден, продолжение с места обрыва",
    reattached: "Подключено к прогону, кадры идут",
    gone: "Прогон {run} на сервере не найден — он завершился или сервер перезапущен",
    nothingToRecover: "На сервере нет активного прогона",
    reconnectFailed:
      "Переподключиться не удалось · {url} — прогон продолжается на сервере. Узнайте run_id через GET /health и нажмите «Продолжить»",
    badAddress: "Некорректный адрес: {detail}",
    badFrame: "Некорректный кадр (не MessagePack)",
    accepted: "Запуск принят сервером",
    cancelledEarly: "Отменено до подключения",
    noStopAck: "Сервер не подтвердил остановку",
    ls: {
      noAnswer: "ls: нет ответа от сервера",
      addressChanged: "ls: адрес изменён",
      closed: "ls: соединение закрыто",
    },
    duration: {
      seconds: "{value} с",
      minutes: "{value} мин",
      minutesSeconds: "{minutes} мин {seconds} с",
      hours: "{value} ч",
      hoursMinutes: "{hours} ч {minutes} мин",
    },
    eta: "осталось ~{time}",
    elapsed: "прошло {time}",
    rate: {
      images: "{value} изобр./с",
      bytes: "{value} {unit}/с",
    },
    units: {
      bytes: "Б",
      kilobytes: "КБ",
      megabytes: "МБ",
      gigabytes: "ГБ",
      terabytes: "ТБ",
    },
  },
};

export const en: typeof ru = {
  run: {
    stage: {
      download: "Downloading models",
      unarchive: "Unpacking archives",
      read: "Reading files",
      process: "Processing images",
      write: "Writing results",
    },
    phase: {
      preprocess: "Preprocessing",
      process: "Processing",
    },
    preparing: "Preparing…",
    done: "Done",
    doneOutput: "Done: {output}",
    stopped: "Stopped",
    error: "Error: {detail}",
    serverError: "Server error: {detail}",
    unknown: "unknown",
    echoLost: "Connection lost: no reply to the echo",
    reconnecting: "Reconnecting ({attempt}/{total})…",
    reconnected: "Connection restored",
    recovered: "Run found, resuming where it dropped",
    reattached: "Attached to the run, frames are coming",
    gone: "Run {run} is not on the server — it finished or the server restarted",
    nothingToRecover: "No active run on the server",
    reconnectFailed:
      "Could not reconnect · {url} — the run continues on the server. Get its run_id from GET /health and press “Resume”",
    badAddress: "Invalid address: {detail}",
    badFrame: "Malformed frame (not MessagePack)",
    accepted: "The server accepted the run",
    cancelledEarly: "Cancelled before connecting",
    noStopAck: "The server did not confirm the stop",
    ls: {
      noAnswer: "ls: no answer from the server",
      addressChanged: "ls: address changed",
      closed: "ls: connection closed",
    },
    duration: {
      seconds: "{value} s",
      minutes: "{value} min",
      minutesSeconds: "{minutes} min {seconds} s",
      hours: "{value} h",
      hoursMinutes: "{hours} h {minutes} min",
    },
    eta: "{time} left",
    elapsed: "{time} elapsed",
    rate: {
      images: "{value} img/s",
      bytes: "{value} {unit}/s",
    },
    units: {
      bytes: "B",
      kilobytes: "KB",
      megabytes: "MB",
      gigabytes: "GB",
      terabytes: "TB",
    },
  },
};
