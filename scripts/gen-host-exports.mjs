// Writes sdk/host-exports.json: the names the host's Solid builds export, which
// the SDK's build helper needs to re-export `solid-js` / `@solidjs/web` from the
// host's own copy at runtime (a plugin must never bundle a second Solid).
//
//   node --conditions=browser scripts/gen-host-exports.mjs
//
// `--conditions=browser` picks the client builds — the ones the app ships.
import { writeFileSync } from "node:fs";

const names = async (specifier) =>
  Object.keys(await import(specifier))
    .filter((n) => n !== "default")
    .sort();

const out = {
  "solid-js": await names("solid-js"),
  "@solidjs/web": await names("@solidjs/web"),
};
writeFileSync(
  new URL("../sdk/host-exports.json", import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(
  `solid-js: ${out["solid-js"].length} names, @solidjs/web: ${out["@solidjs/web"].length} names`,
);
