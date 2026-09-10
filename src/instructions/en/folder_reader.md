## What it does

Reads images from a folder and feeds them into the pipeline. Always the first node
of a pipeline, otherwise the config is not valid. Can walk nested folders and
unpack archives.

## Parameters

- **Path to folder** (text field) — the folder with images: a relative path
  (`raws`, `./raws`) or a full one (`/content/raws`). Suggests folder entries
  while you type.
- **Mode** (select) — how to read the images:
  - `rgb` — always colour, even if the file is greyscale.
  - `gray` — always greyscale, even if the file is colour. (Default)
  - `dynamic` — as is: greyscale stays greyscale, colour stays colour.
- **Recursive** (flag) — also read images in nested folders; off, nested folders
  are skipped.
- **Unarchive** (flag) — unpack archives before reading, if there are any.

## Notes

- A pipeline branch starts with this node: without it the config is not valid.
- The modes change the data itself: `rgb` turns greyscale into three channels,
  `gray` drops the colour of colour images, only `dynamic` keeps the original.
