## What it does

Applies screentone (`gray`) or halftone (`rgb`, `hsv`, `cmyk`). Mostly needed to
bring the screentone back after descreentone models.

## Parameters

- **Mode** (select):
  - `gray` — pure screentone; a colour image on the input is converted to
    greyscale.
  - `rgb` — halftone of a synthetic kind; per-channel parameters appear.
  - `hsv` — halftone over the V (value) channel only; a single parameter set,
    H and S are untouched.
  - `cmyk` — classic halftone, the comic kind; parameters per channel as well.
- **Dot size** (slider) — the size of every dot; easier to reason about than dots
  per inch in editors, because it sets the size itself.
- **Rotation** (slider) — rotation of the dot grid.
- **Dot type** (select):
  - `circle` — classic round dots.
  - `line` — 45° lines instead of dots.
  - `cross` — cross-shaped dots.
  - `ellipse` — ellipse-shaped dots.
  - `invline` — like the lines, but rotated −45°.
- **Disable auto dot** (flag) — disables automatic dot size adjustment for SSAA.
- **SSAA scale** (number) — the image is processed at an enlarged scale and
  downsized back with the `shamming4` filter: it smooths the edges of the dots.

## Notes

- In the multi-channel modes (`rgb`, `cmyk`) every channel has its own size,
  rotation and dot type; the per-channel values survive a mode switch.
