// Writes public/plugins/index.json — the catalog of plugins this build vouches
// for — from the manifests under public/plugins/<name>/plugin.json.
//
//   node scripts/build-catalog.mjs
//
// Each entry copies what the Plugins tab shows before install and the SHA-384 of
// the entry code, so the host can refuse a manifest that changed since listing.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join("public", "plugins");

export const buildCatalog = () => {
  const plugins = readdirSync(ROOT, { withFileTypes: true })
    .filter(
      (dir) =>
        dir.isDirectory() && existsSync(join(ROOT, dir.name, "plugin.json")),
    )
    .map((dir) => {
      const manifest = JSON.parse(
        readFileSync(join(ROOT, dir.name, "plugin.json"), "utf8"),
      );
      if (manifest.integrity === undefined)
        throw new Error(
          `${dir.name}/plugin.json has no integrity: pin it first`,
        );
      return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        ...(manifest.description === undefined
          ? {}
          : { description: manifest.description }),
        ...(manifest.descriptions === undefined
          ? {}
          : { descriptions: manifest.descriptions }),
        caps: manifest.caps,
        ...(manifest.sandbox === undefined
          ? {}
          : { sandbox: manifest.sandbox }),
        manifest: `${dir.name}/plugin.json`,
        integrity: manifest.integrity,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return { schema: 1, name: "Reline plugins", plugins };
};

export const writeCatalog = () => {
  const catalog = buildCatalog();
  writeFileSync(
    join(ROOT, "index.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
  );
  return catalog;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const catalog = writeCatalog();
  console.log(`${ROOT}/index.json  ${catalog.plugins.length} plugins`);
}
