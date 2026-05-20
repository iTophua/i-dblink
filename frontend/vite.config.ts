import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5100,
    strictPort: true,
    host: true,
    cors: true,
    hmr: {
      host: 'localhost',
      port: 5100,
    },
  },
  build: {
    target: ["es2022", "chrome100", "safari15"],
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
