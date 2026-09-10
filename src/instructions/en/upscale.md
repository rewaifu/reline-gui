## What it does

Raises the resolution of an image with a neural upscale model.

## Parameters

- **Own model** (flag) — on: the path field takes a path to a model in your own
  storage; off: the model name is downloaded from our database.
- **Model path** (text field) — a path to your own model, for example
  `/model/2x_model.pth` (`pth`, `pt` and `safetensor` are supported), or just a
  model name from the database, for example `2x_model` — it will be downloaded.
  Autocompletion included.
- **Precision** (select) — computation precision:
  - `F32` — full precision: always works, a bit slower and hungrier for VRAM.
  - `F16` — half precision: faster than `F32` and clearly lighter on memory,
    mostly works on medium and light convolutional models.
  - `BF16` — like `F16`, but steadier on large transformer models trained for it:
    the bytes are distributed differently.
- **Tiling method** (select) — how to cut the image while upscaling:
  - `exact` — splits the image into tiles of the chosen size; far less memory, and
    the bigger the tile, the more memory it needs. Too small a value slows the
    processing down a lot and lowers quality.
  - `no_tiling` — no tiles at all; with fast models this is simply quicker.
- **Tiler size** (number) — tile size for `exact`. Use the largest value that fits
  your memory and stay on sizes divisible by 64 or 128.
- **Allow CPU upscale** (flag) — upscale on the CPU when there is no GPU; off by
  default. Colab sometimes hands out no GPU, and without the flag you get an error
  instead — which at least tells you there is no GPU.
- **Target scale (optional)** (number) — when set, the result is brought to this
  scale instead of the model's own scale.

## Notes

- A model from the database is downloaded once into the run's models folder.
- Without tiling a large image may not fit into VRAM.
