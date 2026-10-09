import { defineConfig } from "vite"
import mdx from "@mdx-js/rollup"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import tsconfigPaths from "vite-tsconfig-paths"
import unfonts from "unplugin-fonts/vite"
import svgr from "vite-plugin-svgr"
import pkg from "./package.json"

const host = process.env.TAURI_DEV_HOST
const isTauri = process.env.TAURI_ENV_PLATFORM || host !== undefined

export default defineConfig({
  base: isTauri ? "./" : (process.env.BASE_URL ?? "/"),
  clearScreen: !isTauri,

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  plugins: [
    { enforce: "pre", ...mdx() },
    react({
      include: /\.(mdx|js|jsx|ts|tsx)$/,
    }),
    tailwindcss(),
    tsconfigPaths(),
    svgr(),
    unfonts({
      fontsource: {
        families: ["Geist Sans", "Geist Mono"],
      },
    }),
  ],
  server: isTauri
    ? {
        port: 5173,
        strictPort: true,
        host: host || false,
        hmr: host
          ? {
              protocol: "ws",
              host,
              port: 5174,
            }
          : undefined,
        watch: {
          ignored: ["**/src-tauri/**"],
        },
      }
    : undefined,

  envPrefix: ["VITE_", "TAURI_"],

  build: {
    target: isTauri ? (process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15") : undefined,
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          const path = id.replace(/\\/g, "/")
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(path)) return "react"
          if (path.includes("/node_modules/@base-ui/") || path.includes("/node_modules/@floating-ui/")) return "base-ui"
          if (path.includes("/node_modules/@tabler/")) return "icons"
          if (path.includes("/node_modules/@dnd-kit/")) return "dnd-kit"
          if (path.includes("/node_modules/@tanstack/")) return "query"
          if (path.includes("/node_modules/i18next")) return "i18n"
          if (path.includes("/node_modules/highlight.js")) return "highlight"
          if (path.includes("/node_modules/zod")) return "zod"
          return "vendor"
        },
      },
    },
  },
})
