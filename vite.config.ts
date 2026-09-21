import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
/**
 * What build is this?
 *
 * Read from the environment Vercel sets on every deployment, so a
 * preview and production tell themselves apart with no configuration
 * at all. Absent locally, which is itself the answer. Shown in the
 * developer panel — see src/lib/dev.ts.
 *
 * Only the commit, branch and environment name: nothing here should
 * be a secret, because everything in `define` is baked into the
 * JavaScript that ships to every browser.
 */
const build = {
  "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(
    process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  ),
  "import.meta.env.VITE_BRANCH": JSON.stringify(
    process.env.VERCEL_GIT_COMMIT_REF ?? "local",
  ),
  "import.meta.env.VITE_DEPLOY_ENV": JSON.stringify(
    process.env.VERCEL_ENV ?? "development",
  ),
  "import.meta.env.VITE_BUILT_AT": JSON.stringify(new Date().toISOString()),
};

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  define: build,

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
