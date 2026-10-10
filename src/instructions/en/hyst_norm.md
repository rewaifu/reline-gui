## What it does

Fixes the levels of a monochrome (neutral) image: builds per-channel RGB
histograms, finds their dominant peaks and — when all three channels read as
neutral — stretches every channel from its own black/white point and writes
the Rec.601 luma back as neutral grey. Colour images pass through untouched.

Runs through `pepe_hyst.monochrome`: histogram smoothing, peak search,
neutrality check, luma stretch.

## Parameters

- **Smoothing passes** (`blur_n`, slider 0–32) — how many times the histogram
  is smoothed with the `[1/4, 1/2, 1/4]` kernel. More passes mean fewer noise
  peaks, but wide peaks may merge.
- **Window radius** (`window_radius`, slider 1–64, in histogram bins) — the
  neighbourhood local maxima are searched in. The backend requires `1..255`.
- **Min peak prominence** (`min_prominence`, slider 0–10 step 0.1, in percent
  of the pixel count) — the topographic height of a peak above the closest
  higher bins. Lower peaks are dropped.
- **Min peak distance** (`min_distance`, slider 1–64, in bins) — closer peaks
  are thinned out, the more prominent one survives. The backend requires
  `1..255`.
- **Neutrality tolerance** (`percentage`, slider 0–1 step 0.01) — the maximum
  relative deviation of the channel masses from their mean that still counts
  as a neutral colour.

## Notes

- A channel set counts as monochrome only when peaks are few (under three per
  channel) and both the low and the high peak triplets are neutral — otherwise
  the image is left alone.
- `min_prominence` is a percentage; the backend derives the absolute threshold
  itself: `pixels × percent / 100` (at least 1).
