import { MODEL_POSTFIX, MODEL_PREFIX } from "~/constants";

/** Legacy configs address a model by its mounted path
 * (`/content/models/X.pth`), current ones by the bare name the model database
 * is keyed by. Returns null for anything else — an own model may live
 * anywhere on the runner. */
export const stripModelPath = (model: string): string | null => {
  if (!model.startsWith(MODEL_PREFIX) || !model.endsWith(MODEL_POSTFIX)) {
    return null;
  }
  return model.slice(MODEL_PREFIX.length, model.length - MODEL_POSTFIX.length);
};

/** A download name reduces to the same key: legacy entries may carry the
 * mounted path or the extension, current ones are already bare. */
export const modelKey = (value: string): string => {
  const stripped = stripModelPath(value);
  const base = stripped ?? value.split("/").pop() ?? value;
  return base.endsWith(MODEL_POSTFIX)
    ? base.slice(0, base.length - MODEL_POSTFIX.length)
    : base;
};
