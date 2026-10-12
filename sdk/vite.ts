import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import hostExports from "./host-exports.json" with { type: "json" };

/**
 * Vite helper for building a Reline plugin.
 *
 *   plugins: [relinePlugin({ manifest }), solid()]
 *
 * It does two things the plugin cannot do for itself:
 *
 * 1. `solid-js` and `@solidjs/web` are not bundled. Imports of them become
 *    reads from `globalThis.__RELINE__`, the host's own copies — two copies of
 *    the reactive core do not talk to each other, so a component built on its
 *    own Solid would never update the host's page.
 * 2. After the bundle is written it hashes the entry and writes `plugin.json`
 *    next to it with the entry name and the SHA-384 pin, which is what the host
 *    checks before it runs a byte of the code.
 */
export interface PluginManifestSource {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** The description in the reader's language; `description` is the fallback. */
  descriptions?: { ru?: string; en?: string };
  caps: readonly string[];
  requires?: Record<string, string>;
}

export interface RelinePluginOptions {
  manifest: PluginManifestSource;
  /** Output file name of the entry chunk. Defaults to `<last id segment>.js`. */
  entryName?: string;
}

const SHIMS: Record<string, "solid" | "web"> = {
  "solid-js": "solid",
  "@solidjs/web": "web",
};

const shimFor = (specifier: "solid-js" | "@solidjs/web"): string => {
  const key = SHIMS[specifier];
  const names = hostExports[specifier];
  // `const x = host.solid.x` per name: a plugin imports names, and an ES module
  // needs them declared statically
  return [
    `const host = globalThis.__RELINE__?.${key};`,
    `if (host === undefined) throw new Error("Reline host not found: this plugin must be loaded by Reline");`,
    ...names.map((name) => `export const ${name} = host.${name};`),
    "export default host;",
  ].join("\n");
};

export const relinePlugin = (options: RelinePluginOptions): Plugin[] => {
  const virtual = (specifier: string) => `\0reline-host:${specifier}`;
  const entryName =
    options.entryName ?? `${options.manifest.id.split(".").at(-1)}.js`;
  let outDir = "";
  return [
    {
      name: "reline-plugin:host-externals",
      enforce: "pre",
      resolveId(source) {
        return source in SHIMS ? virtual(source) : null;
      },
      load(id) {
        for (const specifier of Object.keys(SHIMS))
          if (id === virtual(specifier))
            return shimFor(specifier as "solid-js" | "@solidjs/web");
        return null;
      },
    },
    {
      name: "reline-plugin:manifest",
      apply: "build",
      config(config) {
        // one ES module, named predictably: the manifest points at it
        return {
          build: {
            ...config.build,
            lib: {
              entry: config.build?.lib
                ? (config.build.lib as { entry: string }).entry
                : "src/index.tsx",
              formats: ["es"],
              fileName: () => entryName,
            },
          },
        };
      },
      configResolved(resolved) {
        outDir = resolved.build.outDir;
      },
      writeBundle(_, bundle) {
        const entry = Object.values(bundle).find(
          (chunk) => chunk.type === "chunk" && chunk.isEntry,
        );
        if (entry === undefined)
          throw new Error("reline-plugin: no entry chunk");
        const code = readFileSync(join(outDir, entry.fileName));
        const integrity = `sha384-${createHash("sha384").update(code).digest("base64")}`;
        const { manifest } = options;
        writeFileSync(
          join(outDir, "plugin.json"),
          `${JSON.stringify(
            {
              id: manifest.id,
              name: manifest.name,
              version: manifest.version,
              api: 1,
              description: manifest.description,
              descriptions: manifest.descriptions,
              entry: entry.fileName,
              integrity,
              caps: manifest.caps,
              requires: manifest.requires,
            },
            null,
            2,
          )}\n`,
        );
      },
    },
  ];
};
