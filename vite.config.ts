import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5100,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
    ...(process.env.TAURI_DEBUG
      ? {
          minify: false,
          sourcemap: true,
        }
      : {
          minify: "esbuild",
        }),
  },
});
