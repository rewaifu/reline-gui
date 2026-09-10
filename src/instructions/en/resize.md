## What it does

Resizes an image to a given width, height or proportionally.

## Parameters

- **Resize type** (select):
  - `width` — opens the width: resize to it proportionally.
  - `height` — opens the height: resize to it proportionally.
  - `absolute` — opens both: width and height are set independently, proportions
    are not kept.
  - `percent` — opens the percent: resize by that share, proportionally.
- **Filter** (typed input, combobox). A name is a base filter plus an optional
  prefix; the number in it is the window size — bigger means softer and slower.
  - `i*` (`ilinear`, `ilanczos`, …) — interpolation: very rough, strongly prone to
    moiré, but the sharpest.
  - without a prefix (`box`, `linear`, `hamming`, `catmullrom`, `mitchell`,
    `lanczos`, `gauss`) — convolution: resizes softly, less moiré than `i*`, but
    blurrier.
  - `s*` (`slinear4`, `slanczos8`, …) — super-sampling: first enlarges the image
    with nearest neighbour, then downsizes it with convolution; less moiré on
    paper.
  - `dpid_*` — a resize of its own kind: the value in the name is alpha, the
    smaller it is the softer the result, the bigger the sharper. Works very well
    on manga, but adds a little noise on flat fills; mathematically it is the most
    accurate way to downscale.
- **Spreads** (flag) — opens a separate width for spreads; active in `width` mode:
  an image wider than it is tall is resized by the value below instead of the
  common width.
- **Spread width** (number) — the width for spreads, 2800 by default.

## Notes

- Width, height and percent are remembered: coming back to a mode puts its values
  back, and only the current mode's parameters reach the config.
