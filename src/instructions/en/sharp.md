## What it does

Makes contours sharper after descreentone models — it removes the sawtooth along
the edges.

## Parameters

- **Low input** (slider) — moves the black point: if your black was 10 points
  lighter and you set 10, black becomes 0 and the other tones shift evenly.
- **High input** (slider) — moves the white point the same way, but upwards: it
  was 245, at 245 it becomes 255.
- **Gamma** (slider) — moves the midtones: the closer to zero, the lighter the
  middle, the higher, the darker; black and white at 0 and 255 stay put.
- **White point** (slider) — everything above `255 − n` becomes white. The
  reference values come from a blurred copy of the image, so part of the noise on
  white disappears and the midtones do not shift. `-1` turns it off; 0–2 are the
  useful values.
- **Black point** (slider) — the same for black, but it grows the black areas.
  Legacy: if you do not know why you need it, keep `-1`.
- **Canny** (flag) — after the other steps it finds edges with the Canny filter
  and boosts sharpness exactly along them.
- **Canny type** (select) — how to use the edges it found:
  - `normal` — finds edges and grows them with pure black: contours get denser.
  - `invert` — finds edges and puts pure white in their place: contours get
    thinner.
  - `unsharp` — finds edges, checks that they border white and raises sharpness
    aggressively; inner contours are left alone. (Recommended)

## Notes

- The node is meant to run right after a descreentone model.
- `White point` and `Black point` are off by default (`-1`).
