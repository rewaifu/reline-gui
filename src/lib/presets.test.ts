import { describe, expect, it } from "vitest";
import { CONFIG_PRESETS } from "~/lib/presets";
import { NodeType } from "~/types/enums";
import type { UpscaleNodeOptions } from "~/types/options";

const MODEL_BASE = "https://bucket.yor.ovh/torch_models";

/** Links that are deliberately not `<name>.tar.xz`: the model is published as a
 * bare file. Every other link has to be derivable from the name — a
 * hand-written but plausible url downloads the wrong weights under the right
 * name, and nothing downstream would notice. */
const BARE_FILES = new Set(["2x_enhancr_da_smosr_v1.safetensors"]);

describe("stock presets", () => {
  it("derives every model link from the model name", () => {
    const links = CONFIG_PRESETS.flatMap((preset) =>
      preset.nodes
        .filter((node) => node.type === NodeType.UPSCALE)
        .map((node) => {
          const options = node.options as UpscaleNodeOptions;
          return {
            preset: preset.id,
            model: options.model,
            url: options.model_url ?? "",
          };
        }),
    );
    expect(links.length).toBeGreaterThan(0);
    for (const { preset, model, url } of links) {
      const file = url.split("/").pop() ?? "";
      const derived = url === `${MODEL_BASE}/${model}.tar.xz`;
      expect(
        derived || BARE_FILES.has(file),
        `${preset}: ${model} -> ${url}`,
      ).toBe(true);
    }
  });

  it("points the default color preset at the published .safetensors", () => {
    const color = CONFIG_PRESETS.find((preset) => preset.id === "color-mosrl");
    const upscale = color?.nodes.find((node) => node.type === NodeType.UPSCALE);
    expect(upscale).toBeDefined();
    const options = upscale?.options as UpscaleNodeOptions | undefined;
    expect(options?.model_url).toBe(
      `${MODEL_BASE}/2x_enhancr_da_smosr_v1.safetensors`,
    );
  });
});
