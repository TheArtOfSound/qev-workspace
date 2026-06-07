import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  base: isGitHubPages ? "/qev-workspace/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@qev-workspace/protocol": fileURLToPath(new URL("../../packages/protocol/src/index.ts", import.meta.url)),
      "@qev-workspace/crypto": fileURLToPath(new URL("../../packages/crypto/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
