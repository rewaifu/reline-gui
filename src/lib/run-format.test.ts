import { flush } from "solid-js";
import { beforeEach, describe, expect, it } from "vitest";
import { setLocale, type Locale } from "~/lib/i18n";
import type { RunProgress } from "~/lib/run-client";
import {
  describeStage,
  formatBytes,
  formatDownloadProgress,
  formatDuration,
  formatElapsed,
  formatEta,
  formatProgressCounters,
  formatRate,
} from "~/lib/run-format";

/** A `progress` frame carrying only the fields a test is about. */
const frame = (fields: Partial<RunProgress>): RunProgress => ({
  percent: 0,
  ...fields,
});

const MEGABYTE = 1024 * 1024;

/** Solid 2 defers a signal write to the next flush: switching the language and
 * formatting in the same tick without flushing would use the old one. */
const use = (next: Locale) => {
  setLocale(next);
  flush();
};

// jsdom reports an English browser, so the Russian expectations below state
// their language instead of inheriting one.
beforeEach(() => use("ru"));

describe("stage line", () => {
  it("names the stage and the model it is fetching", () => {
    expect(describeStage(frame({ stage: "download", label: "4x_a" }))).toBe(
      "Скачивание моделей · 4x_a",
    );
  });

  it("shows a node under the editor's name, not the runner's", () => {
    // the runner auto-labels its halftone step "Halftone"; the editor calls
    // that node «Скринтон»
    expect(describeStage(frame({ stage: "process", node: "halftone" }))).toBe(
      "Обработка изображений · Скринтон",
    );
    expect(
      describeStage(
        frame({ stage: "process", node: "sharp", label: "Gaussian Blur" }),
      ),
    ).toBe("Обработка изображений · Резкость");
  });

  it("keeps the runner's label for steps without a node", () => {
    expect(
      describeStage(frame({ stage: "unarchive", label: "raws.zip" })),
    ).toBe("Распаковка архивов · raws.zip");
    expect(describeStage(frame({ stage: "read" }))).toBe("Чтение файлов");
  });

  it("falls back to the label and then to preparing", () => {
    expect(describeStage(frame({ label: "worker busy" }))).toBe("worker busy");
    expect(describeStage(frame({}))).toBe("Подготовка…");
    // a wire string that happens to name an Object.prototype member is not a
    // node label
    expect(describeStage(frame({ label: "step", node: "constructor" }))).toBe(
      "step",
    );
  });
});

describe("counters", () => {
  it("reports the current step's progress", () => {
    expect(formatProgressCounters(frame({ done: 42, total: 120 }))).toBe(
      "42 / 120",
    );
  });

  it("stays hidden while the total is unknown", () => {
    expect(
      formatProgressCounters(frame({ done: 42, total: 0 })),
    ).toBeUndefined();
    expect(
      formatProgressCounters(frame({ done: 42, total: undefined })),
    ).toBeUndefined();
    expect(formatProgressCounters(frame({ total: 120 }))).toBeUndefined();
  });

  it("renders nothing rather than a broken number", () => {
    expect(
      formatProgressCounters(frame({ done: Number.NaN, total: 120 })),
    ).toBeUndefined();
    expect(
      formatProgressCounters(frame({ done: -1, total: 120 })),
    ).toBeUndefined();
  });
});

describe("rate", () => {
  it("counts images per second on the image stages", () => {
    expect(formatRate(frame({ stage: "process", rate: 8.4 }))).toBe(
      "8.4 изобр./с",
    );
    expect(formatRate(frame({ stage: "process", rate: 123.4 }))).toBe(
      "123 изобр./с",
    );
  });

  it("counts bytes per second while downloading", () => {
    expect(formatRate(frame({ stage: "download", rate: 5.4 * MEGABYTE }))).toBe(
      "5.4 МБ/с",
    );
  });

  it("stays hidden before the first measurement", () => {
    expect(formatRate(frame({ stage: "process", rate: 0 }))).toBeUndefined();
    expect(formatRate(frame({ stage: "process" }))).toBeUndefined();
    expect(
      formatRate(frame({ stage: "process", rate: Number.NaN })),
    ).toBeUndefined();
  });
});

describe("time left", () => {
  it("rounds into seconds, minutes and hours", () => {
    expect(formatEta(frame({ eta: 9.3 }))).toBe("осталось ~9 с");
    expect(formatEta(frame({ eta: 80 }))).toBe("осталось ~1 мин 20 с");
    expect(formatEta(frame({ eta: 3900 }))).toBe("осталось ~1 ч 5 мин");
  });

  it("stays hidden while the runner has no estimate", () => {
    expect(formatEta(frame({}))).toBeUndefined();
    expect(formatEta(frame({ eta: 0 }))).toBeUndefined();
    expect(formatEta(frame({ eta: 0.4 }))).toBeUndefined();
    expect(formatEta(frame({ eta: -3 }))).toBeUndefined();
  });
});

describe("elapsed time", () => {
  it("reports the age of the run", () => {
    expect(formatElapsed(frame({ elapsed: 12.4 }))).toBe("прошло 12 с");
    expect(formatElapsed(frame({ elapsed: 95 }))).toBe("прошло 1 мин 35 с");
  });

  it("stays hidden without an elapsed field", () => {
    expect(formatElapsed(frame({}))).toBeUndefined();
    expect(formatElapsed(frame({ elapsed: Number.NaN }))).toBeUndefined();
    expect(formatElapsed(frame({ elapsed: -1 }))).toBeUndefined();
  });
});

describe("duration", () => {
  it("drops an empty smaller unit", () => {
    expect(formatDuration(0)).toBe("0 с");
    expect(formatDuration(60)).toBe("1 мин");
    expect(formatDuration(3600)).toBe("1 ч");
  });

  it("refuses anything that is not a duration", () => {
    expect(formatDuration(undefined)).toBeUndefined();
    expect(formatDuration(Number.NaN)).toBeUndefined();
    expect(formatDuration(-5)).toBeUndefined();
  });
});

describe("bytes", () => {
  it("scales into binary units", () => {
    expect(formatBytes(840 * 1024)).toBe("840 КБ");
    expect(formatBytes(123 * MEGABYTE)).toBe("123 МБ");
    expect(formatBytes(1.5 * 1024 * MEGABYTE)).toBe("1.5 ГБ");
  });

  it("keeps a zero count readable and refuses garbage", () => {
    expect(formatBytes(0)).toBe("0 Б");
    expect(formatBytes(undefined)).toBeUndefined();
    expect(formatBytes(Number.NaN)).toBeUndefined();
    expect(formatBytes(-1)).toBeUndefined();
  });
});

describe("download progress", () => {
  it("shows both sides once the size is known", () => {
    expect(
      formatDownloadProgress(
        frame({ bytesDone: 123 * MEGABYTE, bytesTotal: 271 * MEGABYTE }),
      ),
    ).toBe("123 МБ / 271 МБ");
  });

  it("shows the downloaded side alone without a size", () => {
    expect(
      formatDownloadProgress(frame({ bytesDone: 400 * 1024, bytesTotal: 0 })),
    ).toBe("400 КБ");
    expect(formatDownloadProgress(frame({ bytesDone: 400 * 1024 }))).toBe(
      "400 КБ",
    );
  });

  it("stays hidden until bytes arrive", () => {
    expect(formatDownloadProgress(frame({ bytesTotal: 1024 }))).toBeUndefined();
    expect(formatDownloadProgress(frame({}))).toBeUndefined();
  });
});

describe("English output", () => {
  beforeEach(() => use("en"));

  it("names the stage, the node and the model", () => {
    expect(describeStage(frame({ stage: "download", label: "4x_a" }))).toBe(
      "Downloading models · 4x_a",
    );
    expect(describeStage(frame({ stage: "process", node: "halftone" }))).toBe(
      "Processing images · Halftone",
    );
    expect(describeStage(frame({ stage: "process", node: "sharp" }))).toBe(
      "Processing images · Sharp",
    );
    expect(describeStage(frame({}))).toBe("Preparing…");
  });

  it("formats durations, bytes and rates in English units", () => {
    expect(formatDuration(80)).toBe("1 min 20 s");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatBytes(123 * MEGABYTE)).toBe("123 MB");
    expect(formatBytes(840 * 1024)).toBe("840 KB");
    expect(formatEta(frame({ eta: 80 }))).toBe("1 min 20 s left");
    expect(formatElapsed(frame({ elapsed: 12 }))).toBe("12 s elapsed");
    expect(formatRate(frame({ stage: "process", rate: 8.4 }))).toBe(
      "8.4 img/s",
    );
    expect(formatRate(frame({ stage: "download", rate: 5.4 * MEGABYTE }))).toBe(
      "5.4 MB/s",
    );
  });
});
