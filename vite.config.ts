import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";

import { fileURLToPath } from "node:url";

export default defineConfig(({ command }) => ({
  // CDN serves the app from a nested path, so the built page must reference
  // its chunks relatively (./assets/…) — dev keeps an absolute root.
  base: command === "build" ? "./" : "/",
  resolve: {
    alias: [
      {
        find: "~",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
  // generates the entries around src/App.tsx, wrapped in src/Document.tsx
  // (or a built-in shell). `vite build` prerenders the shell into
  // dist/client/index.html and emits a purely static dist/client.
  plugins: [
    solid({ start: true, extensions: [".jsx", ".tsx"], diagnostics: true }), // add `ssr: true` for streaming SSR
  ],
  server: {
    port: 3000,
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest-setup.ts"],
    // if you have few tests, try commenting this
    // out to improve performance:
    isolate: false,
  },
  build: {
    target: "esnext",
    // Keep images as asset files instead of inlining them into the JS bundle.
    assetsInlineLimit: 0,
    manifest: false,
    rolldownOptions: {
      output: {
        // Vite 8 default minifier is oxc; the object form unlocks its compress
        // options. `codegen: true` keeps whitespace removal on (this is the
        // boolean form of the default `minify: 'oxc'`).
        minify: {
          compress: { dropConsole: true, dropDebugger: true },
          mangle: true,
          codegen: true,
        },
      },
    },
  },
}));
