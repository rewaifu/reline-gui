import * as chrome from "./chrome";
import * as common from "./common";
import * as forms from "./forms";
import * as nodes from "./nodes";
import * as panel from "./panel";
import * as run from "./run";

/** The dictionaries, merged by area. Each area file keeps `ru` and `en` in one
 * place and annotates `en` with `typeof ru`, so a key added to Russian without
 * English (or a misspelled key) fails the type check. */
export const ru = {
  ...common.ru,
  ...nodes.ru,
  ...forms.ru,
  ...chrome.ru,
  ...panel.ru,
  ...run.ru,
};

export type Messages = typeof ru;

export const en: Messages = {
  ...common.en,
  ...nodes.en,
  ...forms.en,
  ...chrome.en,
  ...panel.en,
  ...run.en,
};
