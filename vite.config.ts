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
    target: ["es2022", "chrome100", "safari15"],
    commonjsOptions: {
      transformMixedEsModules: true,
    },
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
