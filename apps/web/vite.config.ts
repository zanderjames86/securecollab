import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // During development the sync server runs separately via `wrangler dev`.
    proxy: {
      "/api": { target: "http://localhost:8787", ws: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: "node",
  },
});
