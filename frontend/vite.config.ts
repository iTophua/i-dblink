import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5100,
    strictPort: true,
    host: '127.0.0.1',
    cors: true,
    hmr: {
      host: '127.0.0.1',
      port: 5100,
      protocol: 'ws',
    },
  },
  build: {
    target: ["es2022", "chrome100", "safari15"],
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
