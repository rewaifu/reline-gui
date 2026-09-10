## What it does

Adjusts image levels — the same idea as levels in Photoshop.

## Parameters

- **Low input** (slider) — moves the black point: if your black was 10 points
  lighter and you set 10, black becomes 0 and the other tones shift evenly.
- **High input** (slider) — moves the white point the same way, but upwards: it
  was 245, at 245 it becomes 255.
- **Low output** (slider) — the same in reverse: it was 0 and you set 10, black
  becomes 10 and the other tones are compressed.
- **High output** (slider) — the same for white: it was 255 and you set 245, so
  white now counts as 245.
- **Gamma** (slider) — moves the midtones and leaves black and white alone while
  they sit at 0 and 255: the closer to zero, the lighter the middle, the higher,
  the darker.

## Notes

- Thresholds run over a 0–255 scale, gamma is a positive number.
- All parameters work together: input is applied first, then output and gamma.
