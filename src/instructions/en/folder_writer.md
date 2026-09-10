## What it does

Writes the processed images into a folder. Always the last node of a pipeline,
otherwise the config is not valid.

## Parameters

- **Path to folder** (text field) — destination folder; created on write if it is
  not there yet.
- **Format** (select) — how to save:
  - `png` — lossless (default).
  - `jpeg` — smaller files, with losses.

## Notes

- File names are kept as they were; an existing file is overwritten.
- Nested folders repeat the input structure.
- `jpeg` quality comes from the global run settings.
