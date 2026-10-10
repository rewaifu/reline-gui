## What it does

Writes the processed images into a folder. Always the last node of a pipeline,
otherwise the config is not valid.

## Parameters

- **Path to folder** (text field) — destination folder; created on write if it is
  not there yet.
- **Format** (select) — how to save:
  - `png` — lossless (default).
  - `jpeg` — smaller files, with losses.
- **PSD** (switch) — after writing, compose a layered PSD per image into the
  `psd` subfolder: the source file becomes the background, the processed one
  the layer on top. Off — no postprocess.
- **Delete originals after PSD** (switch, shown while PSD is on) — the flat
  files a PSD was composed from are removed. Only `.psd` files stay behind.
- **Clean folder before run** (switch) — the output folder is emptied entirely
  before the run starts (a `cleandir` preprocessor), so stale files cannot mix
  with the new ones.
- **Fit method** (select) — how the processed layer lands on the background
  canvas (the canvas is always the background's size):
  - `original` — as is, no scaling.
  - `fit` — fit inside entirely, aspect kept.
  - `cover` — fill the canvas, aspect kept, excess cropped.
  - `stretch` — stretch exactly into the canvas, aspect ignored.
- **Backgrounds folder** (path field) — where to take backgrounds from: same
  rules as reading (absolute or relative path, completion).

## Notes

- File names are kept as they were; an existing file is overwritten.
- Nested folders repeat the input structure.
- PSD writes `.psd` into the `psd` subfolder next to the output and pairs
  processed files with backgrounds by file name: matching names first, then
  leftovers from both sides in name order (`img2` before `img10`) — until one
  side runs out. No pair — the file is skipped, the run continues.
