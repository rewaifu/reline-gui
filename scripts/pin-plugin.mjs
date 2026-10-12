// Publishes a hand-written plugin from examples/<name>/ to
// public/plugins/examples/<name>/: copies the entry and writes plugin.json with
// the SHA-384 pin the host checks. Examples are installable by link
// (./plugins/examples/<name>/plugin.json) but are NOT in the catalog — the
// catalog lists only the top-level public/plugins/<name>/ directories.
//
//   node scripts/pin-plugin.mjs writer-suffix
//
// (Built plugins — like the sequence one — get their plugin.json from the SDK's
// Vite helper instead.)
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];
if (name === undefined) throw new Error("usage: pin-plugin.mjs <example-name>");
const from = join("examples", name);
const to = join("public", "plugins", "examples", name);
const manifest = JSON.parse(readFileSync(join(from, "manifest.json"), "utf8"));
mkdirSync(to, { recursive: true });
copyFileSync(join(from, manifest.entry), join(to, manifest.entry));
const code = readFileSync(join(to, manifest.entry));
manifest.integrity = `sha384-${createHash("sha384").update(code).digest("base64")}`;
writeFileSync(
  join(to, "plugin.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`${to}/plugin.json  ${manifest.integrity}`);
