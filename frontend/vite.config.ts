import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // `?raw` imports the Dutch crew handbook straight out of ../docs/gebruik.
    // Vite's default fs sandbox is the project root (= frontend/), so widen
    // it to the repo root so those imports don't error during dev.
    fs: { allow: [resolve(__dirname, "..")] },
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        tracker: resolve(__dirname, "tracker.html"),
      },
    },
  },
});
