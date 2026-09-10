import { NODE_DEFS } from "~/components/nodes/registry";
import { NodeType, PureNodeType } from "~/types/enums";
import type { RunProgress, RunStage } from "./run-client";

/** Stage titles from WS_API.md. `RunStage` is a closed union, so this covers
 * every stage a frame can carry. */
export const STAGE_LABELS: Record<RunStage, string> = {
  download: "Скачивание моделей",
  unarchive: "Распаковка архивов",
  read: "Чтение файлов",
  process: "Обработка изображений",
  write: "Запись результатов",
};

/** Shown until the first `progress` frame says what the run is doing. */
export const PREPARING_TEXT = "Подготовка…";

/** Wire node type → the name that node carries in the editor. The runner
 * labels its own steps ("Halftone" for the node the UI calls "Screentone"),
 * so a frame naming a node is shown under the editor's name; frames without
 * one (models, archives, files) keep the label the runner sent. */
const NODE_LABELS: Record<string, string | undefined> = {
  [PureNodeType.LEVEL]: NODE_DEFS[NodeType.LEVEL].label,
  [PureNodeType.FOLDER_READER]: NODE_DEFS[NodeType.FOLDER_READER].label,
  [PureNodeType.FOLDER_WRITER]: NODE_DEFS[NodeType.FOLDER_WRITER].label,
  [PureNodeType.SHARP]: NODE_DEFS[NodeType.SHARP].label,
  [PureNodeType.CVT_COLOR]: NODE_DEFS[NodeType.CVT_COLOR].label,
  [PureNodeType.UPSCALE]: NODE_DEFS[NodeType.UPSCALE].label,
  [PureNodeType.RESIZE]: NODE_DEFS[NodeType.RESIZE].label,
  [PureNodeType.HALFTONE]: NODE_DEFS[NodeType.SCREENTONE].label,
};

const BYTE_UNITS = ["Б", "КБ", "МБ", "ГБ", "ТБ"] as const;

/** A number worth showing, or nothing: a missing, NaN or negative metric
 * would reach the UI as "NaN с" or a bar of negative width. */
const metric = (value: number | undefined): number | undefined =>
  value === undefined || !Number.isFinite(value) || value < 0
    ? undefined
    : value;

/** Binary scaling into the largest unit that keeps the number readable. */
const scaleBytes = (bytes: number): { value: number; unit: string } => {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return { value, unit: BYTE_UNITS[unit] };
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
  if (node === undefined || !Object.hasOwn(NODE_LABELS, node)) return label;
  return NODE_LABELS[node] ?? label;
};

/** "9 с", "1 мин 20 с", "1 ч 5 мин"; undefined for anything that cannot be a
 * duration. */
export const formatDuration = (
  seconds: number | undefined,
): string | undefined => {
  const total = metric(seconds);
  if (total === undefined) return undefined;
  const whole = Math.round(total);
  if (whole < 60) return `${whole} с`;
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) {
    const rest = whole % 60;
    return rest === 0 ? `${minutes} мин` : `${minutes} мин ${rest} с`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${hours} ч` : `${hours} ч ${restMinutes} мин`;
};

/** "123 МБ", "1.5 ГБ", "840 КБ" — binary units, Russian short forms. */
export const formatBytes = (bytes: number | undefined): string | undefined => {
  const value = metric(bytes);
  if (value === undefined) return undefined;
  const scaled = scaleBytes(value);
  return `${amount(scaled.value)} ${scaled.unit}`;
};

/** The run's main line: the stage title plus what it is working on, e.g.
 * "Скачивание моделей · 4x_a". A frame that carries neither falls back to the
 * preparing text, so the line is never empty. */
export const describeStage = (p: RunProgress): string => {
  const detail = stageDetail(p);
  if (p.stage === undefined) return detail ?? PREPARING_TEXT;
  const stage = STAGE_LABELS[p.stage];
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

/** "8.4 img/s" for the image stages, "5.2 МБ/с" for a download — `rate`
 * counts images on read/process/write and bytes on download (WS_API.md). */
export const formatRate = (p: RunProgress): string | undefined => {
  const rate = metric(p.rate);
  if (rate === undefined || rate === 0) return undefined;
  if (p.stage !== "download") return `${amount(rate)} img/s`;
  const scaled = scaleBytes(rate);
  return `${amount(scaled.value)} ${scaled.unit}/с`;
};

/** "осталось ~9 с"; undefined while the runner has no estimate, and for
 * anything under a second — "~0 с" reads as "stuck", not as "almost done". */
export const formatEta = (p: RunProgress): string | undefined => {
  const eta = metric(p.eta);
  if (eta === undefined || eta < 1) return undefined;
  return `осталось ~${formatDuration(eta)}`;
};

/** "прошло 12 с"; undefined until the runner reports an elapsed time. */
export const formatElapsed = (p: RunProgress): string | undefined => {
  const elapsed = formatDuration(p.elapsed);
  return elapsed === undefined ? undefined : `прошло ${elapsed}`;
};

/** "123 МБ / 271 МБ", or the downloaded side alone when the server sent no
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
