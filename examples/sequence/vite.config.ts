import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";
import { relinePlugin } from "../../sdk/vite";
import { manifest } from "./manifest";

// Built into public/plugins/sequence/, which the app serves next to itself:
// install it from ./plugins/sequence/plugin.json
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "@reline/plugin-sdk": fileURLToPath(
        new URL("../../sdk/index.ts", import.meta.url),
      ),
    },
  },
  plugins: [relinePlugin({ manifest, entryName: "sequence.js" }), solid()],
  build: {
    outDir: fileURLToPath(
      new URL("../../public/plugins/sequence", import.meta.url),
    ),
    emptyOutDir: true,
    target: "esnext",
    lib: {
      entry: "src/index.tsx",
      formats: ["es"],
      fileName: () => "sequence.js",
    },
  },
});
