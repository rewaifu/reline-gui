import { omit, type Component } from "solid-js";
import styles from "./slider.module.scss";

export interface UiSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  class?: string;
}

/** Track + thumb slider over a native range input — keyboard and pointer
 * behavior come from the platform, the chrome is fully styled. `--fill`
 * paints the progress up to the thumb on WebKit (Firefox has
 * ::-moz-range-progress). */
export const UiSlider: Component<UiSliderProps> = (props) => {
  const rest = omit(
    props,
    "onChange",
    "value",
    "min",
    "max",
    "step",
    "id",
    "class",
  );
  const min = () => props.min ?? 0;
  const max = () => props.max ?? 100;
  const fill = () => ((props.value - min()) / Math.max(1, max() - min())) * 100;

  return (
    <input
      {...rest}
      id={props.id}
      class={[styles.slider, props.class]}
      type="range"
      min={min()}
      max={max()}
      step={props.step ?? 1}
      value={props.value}
      style={{ "--fill": `${fill()}%` }}
      onInput={(e) => props.onChange(Number(e.currentTarget.value))}
    />
  );
};
