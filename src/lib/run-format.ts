import { t, type MessageKey } from "~/lib/i18n";
import { PureNodeType } from "~/types/enums";
import type { RunProgress, RunStage } from "./run-client";

/** Stage titles from WS_API.md. `RunStage` is a closed union, so this covers
 * every stage a frame can carry. Keys, not text: the line is formatted where
 * it renders, so a journal written in one language reads in the other. */
const STAGE_KEYS: Record<RunStage, MessageKey> = {
  download: "run.stage.download",
  unarchive: "run.stage.unarchive",
  read: "run.stage.read",
  process: "run.stage.process",
  write: "run.stage.write",
};

/** Wire node type → the name that node carries in the editor. The runner
 * labels its own steps ("Halftone" for the node the UI calls "Screentone"),
 * so a frame naming a node is shown under the editor's name; frames without
 * one (models, archives, files) keep the label the runner sent. */
const NODE_NAME_KEYS: Record<string, MessageKey | undefined> = {
  [PureNodeType.LEVEL]: "node.level",
  [PureNodeType.FOLDER_READER]: "node.folder_reader",
  [PureNodeType.FOLDER_WRITER]: "node.folder_writer",
  [PureNodeType.SHARP]: "node.sharp",
  [PureNodeType.CVT_COLOR]: "node.cvt_color",
  [PureNodeType.UPSCALE]: "node.upscale",
  [PureNodeType.RESIZE]: "node.resize",
  [PureNodeType.HALFTONE]: "node.halftone",
};

/** Binary units, largest last — `scaleBytes` walks this by index. */
const BYTE_UNIT_KEYS = [
  "run.units.bytes",
  "run.units.kilobytes",
  "run.units.megabytes",
  "run.units.gigabytes",
  "run.units.terabytes",
] as const satisfies readonly MessageKey[];

/** A number worth showing, or nothing: a missing, NaN or negative metric
 * would reach the UI as "NaN с" / "NaN s" or a bar of negative width. */
const metric = (value: number | undefined): number | undefined =>
  value === undefined || !Number.isFinite(value) || value < 0
    ? undefined
    : value;

/** Binary scaling into the largest unit that keeps the number readable. */
const scaleBytes = (bytes: number): { value: number; unitKey: MessageKey } => {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNIT_KEYS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return { value, unitKey: BYTE_UNIT_KEYS[unit] };
};

/** One decimal below 100 ("8.4", "1.5"), whole numbers above ("123"), and a
 * bare "0" — "0.0 Б" would claim a precision the counter does not have. */
const amount = (value: number): string => {
  const tenths = Math.round(value * 10) / 10;
  if (tenths === 0) return "0";
  return tenths < 100 ? tenths.toFixed(1) : String(Math.round(tenths));
};

/** What the current step is working on. The editor's own name for a node wins
 * over the runner's label; `hasOwn` keeps a wire string like "constructor"
 * from resolving to something on the prototype. */
const stageDetail = (p: RunProgress): string | undefined => {
  const label = p.label?.trim() || undefined;
  const node = p.node;
  if (node === undefined || !Object.hasOwn(NODE_NAME_KEYS, node)) return label;
  const key = NODE_NAME_KEYS[node];
  return key === undefined ? label : t(key);
};

/** "9 с" / "9 s", "1 мин 20 с" / "1 min 20 s"; undefined for anything that cannot be a
 * duration. */
export const formatDuration = (
  seconds: number | undefined,
): string | undefined => {
  const total = metric(seconds);
  if (total === undefined) return undefined;
  const whole = Math.round(total);
  if (whole < 60) return t("run.duration.seconds", { value: whole });
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) {
    const rest = whole % 60;
    return rest === 0
      ? t("run.duration.minutes", { value: minutes })
      : t("run.duration.minutesSeconds", {
          minutes,
          seconds: rest,
        });
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0
    ? t("run.duration.hours", { value: hours })
    : t("run.duration.hoursMinutes", { hours, minutes: restMinutes });
};

/** "123 МБ" / "123 MB", "1.5 ГБ" / "1.5 GB" — binary units, short forms per language. */
export const formatBytes = (bytes: number | undefined): string | undefined => {
  const value = metric(bytes);
  if (value === undefined) return undefined;
  const scaled = scaleBytes(value);
  return `${amount(scaled.value)} ${t(scaled.unitKey)}`;
};

/** The run's main line: the stage title plus what it is working on, e.g.
 * "Скачивание моделей · 4x_a" / "Downloading models · 4x_a". A frame that carries neither falls back to the
 * preparing text, so the line is never empty. */
export const describeStage = (p: RunProgress): string => {
  const detail = stageDetail(p);
  if (p.stage === undefined) return detail ?? t("run.preparing");
  const stage = t(STAGE_KEYS[p.stage]);
  return detail === undefined ? stage : `${stage} · ${detail}`;
};

/** "42 / 120", undefined while the total is unknown (`total: 0` is exactly
 * the case where a share of the stage cannot be told). */
export const formatProgressCounters = (p: RunProgress): string | undefined => {
  const done = metric(p.done);
  const total = metric(p.total);
  if (done === undefined || total === undefined || total <= 0) return undefined;
  return `${Math.round(done)} / ${Math.round(total)}`;
};

/** "8.4 изобр./с" / "8.4 img/s" for the image stages, "5.2 МБ/с" / "5.2 MB/s" for a download — `rate`
 * counts images on read/process/write and bytes on download (WS_API.md). */
export const formatRate = (p: RunProgress): string | undefined => {
  const rate = metric(p.rate);
  if (rate === undefined || rate === 0) return undefined;
  if (p.stage !== "download")
    return t("run.rate.images", { value: amount(rate) });
  const scaled = scaleBytes(rate);
  return t("run.rate.bytes", {
    value: amount(scaled.value),
    unit: t(scaled.unitKey),
  });
};

/** "осталось ~9 с" / "9 s left"; undefined while the runner has no estimate, and for
 * anything under a second — "~0 с" reads as "stuck", not as "almost done". */
export const formatEta = (p: RunProgress): string | undefined => {
  const eta = metric(p.eta);
  if (eta === undefined || eta < 1) return undefined;
  const duration = formatDuration(eta);
  return duration === undefined ? undefined : t("run.eta", { time: duration });
};

/** "прошло 12 с" / "12 s elapsed"; undefined until the runner reports an elapsed time. */
export const formatElapsed = (p: RunProgress): string | undefined => {
  const duration = formatDuration(p.elapsed);
  return duration === undefined
    ? undefined
    : t("run.elapsed", { time: duration });
};

/** "123 МБ / 271 МБ" / "123 MB / 271 MB", or the downloaded side alone when the server sent no
 * size; undefined while nothing has been counted yet. */
export const formatDownloadProgress = (p: RunProgress): string | undefined => {
  const done = formatBytes(p.bytesDone);
  if (done === undefined) return undefined;
  const total =
    p.bytesTotal !== undefined && p.bytesTotal > 0
      ? formatBytes(p.bytesTotal)
      : undefined;
  return total === undefined ? done : `${done} / ${total}`;
};
