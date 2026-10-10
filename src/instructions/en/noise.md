## What it does

Adds grainy noise to the image. The chart above this text shows what the noise
looks like at the current settings: move the node's sliders and the curve
follows. Horizontally — how much a single pixel may darken (left) or brighten
(right), from −255 to +255; the dashed line in the middle means no change.
The higher the curve somewhere, the more often the noise deviates that much.

With `a = b = 1` every deviation is equally likely (a flat line). When `a` is
bigger than `b` the noise darkens more often, the other way round it brightens
more often. Both above one — pixels usually shift only a little; both below
one — the noise is ragged, with sharp spikes.

## Parameters

- **Alpha shape (a)** (slider 0.01–10 step 0.01) — skews the noise towards dark.
  Higher darkens more often and harder.
- **Beta shape (b)** (slider 0.01–10 step 0.01) — skews the noise towards
  bright. Higher brightens more often and harder.
- **Noise strength** (slider 0–1 step 0.01) — how visible the noise is.
  0 disables the node.
- **Black point** (slider 0–255) — shadows darker than the threshold skip the
  noise and stay as they were.
- **White point** (slider 0–255) — lights brighter than the threshold skip the
  noise and stay as they were. Together the thresholds set the working range —
  noise lands on the midtones only.
- **Noise mode** (select):
  - `rgb` — noise is added to the pixels directly.
  - `gray` — only brightness is noised, colours untouched.
  - `chrome` — the opposite: brightness untouched, only colour is noised.
  - On flat greyscale input `rgb` always applies.
- **Seed** (switch + number) — off: fresh noise every run. On: the noise is
  always the same, 0 when the field is empty.

## Notes

- The mask is computed before noising: a pixel is either fully noised or
  restored verbatim — no feathering at the threshold edges.
- At high strengths lights and shadows blow out into flat fills.
