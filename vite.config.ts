import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * 自动构建 Go sidecar 的 Vite 插件
 *
 * - 开发模式 (`pnpm dev` / `pnpm tauri dev`)：检查 go-backend/go-backend 是否需要重建
 * - 生产模式：跳过（由 package.json 脚本负责构建到 sidecars/）
 */
function buildSidecarPlugin(): Plugin {
  const goDir = path.resolve("go-backend");
  const binary = path.join(goDir, "go-backend");

  function getGoFiles(dir: string = goDir): string[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "vendor" && entry.name !== "node_modules") {
        files.push(...getGoFiles(full));
      } else if (entry.isFile() && entry.name.endsWith(".go")) {
        files.push(full);
      }
    }
    return files;
  }

  function needsRebuild(): boolean {
    if (!fs.existsSync(binary)) return true;
    const goFiles = getGoFiles();
    if (goFiles.length === 0) return false;
    const latestSource = Math.max(
      ...goFiles.map((f) => fs.statSync(f).mtimeMs)
    );
    return latestSource > fs.statSync(binary).mtimeMs;
  }

  function build() {
    if (!fs.existsSync(goDir)) {
      console.log("\x1b[33m[sidecar]\x1b[0m go-backend/ not found, skipping");
      return;
    }

    if (!needsRebuild()) {
      console.log("\x1b[36m[sidecar]\x1b[0m go-backend is up to date");
      return;
    }

    console.log("\x1b[36m[sidecar]\x1b[0m Building go-backend...");
    try {
      execSync("go build -o go-backend", { cwd: goDir, stdio: "inherit" });
      console.log("\x1b[36m[sidecar]\x1b[0m Build successful");
    } catch {
      console.error("\x1b[31m[sidecar]\x1b[0m Build failed");
      // 不退出进程，让 Vite 继续启动，但 sidecar 功能将不可用
    }
  }

  return {
    name: "build-sidecar",
    configureServer() {
      build();
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    buildSidecarPlugin(),
  ],
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
