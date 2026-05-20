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
  const goDir = path.resolve(__dirname, "..", "go-backend");
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
    if (process.env.FORCE_SIDECAR_REBUILD === "1") return true;
    if (!fs.existsSync(binary)) return true;
    const goFiles = getGoFiles();
    if (goFiles.length === 0) return false;
    const latestSource = Math.max(
      ...goFiles.map((f) => fs.statSync(f).mtimeMs)
    );
    return latestSource > fs.statSync(binary).mtimeMs;
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function build() {
    console.log("\n\x1b[36m┌─────────────────────────────────────┐\x1b[0m");
    console.log("\x1b[36m│         Sidecar Build Info          │\x1b[0m");
    console.log("\x1b[36m└─────────────────────────────────────┘\x1b[0m");

    if (!fs.existsSync(goDir)) {
      console.log("\x1b[33m[sidecar]\x1b[0m go-backend/ not found, skipping");
      return;
    }

    const goFiles = getGoFiles();
    console.log(`\x1b[36m[sidecar]\x1b[0m Scanned ${goFiles.length} Go files`);

    if (!fs.existsSync(binary)) {
      console.log("\x1b[36m[sidecar]\x1b[0m Binary not found, needs build");
    } else {
      const stats = fs.statSync(binary);
      const binaryTime = new Date(stats.mtime).toLocaleString();
      console.log(`\x1b[36m[sidecar]\x1b[0m Binary: ${formatBytes(stats.size)} (modified: ${binaryTime})`);
      
      if (!needsRebuild()) {
        console.log("\x1b[32m[sidecar]\x1b[0m ✓ go-backend is up to date");
        console.log("\x1b[36m[sidecar]\x1b[0m Use FORCE_SIDECAR_REBUILD=1 to force rebuild\n");
        return;
      }
      
      console.log("\x1b[33m[sidecar]\x1b[0m Source files changed, rebuilding...");
    }

    console.log("\x1b[36m[sidecar]\x1b[0m Building go-backend...");
    console.log("\x1b[36m[sidecar]\x1b[0m Command: go build -o go-backend");
    const startTime = Date.now();
    
    try {
      execSync("go build -o go-backend", { cwd: goDir, stdio: "inherit" });
      const duration = Date.now() - startTime;
      
      if (fs.existsSync(binary)) {
        const newStats = fs.statSync(binary);
        console.log(`\x1b[32m[sidecar]\x1b[0m ✓ Build successful in ${duration}ms (${formatBytes(newStats.size)})`);
      } else {
        console.log(`\x1b[32m[sidecar]\x1b[0m ✓ Build successful in ${duration}ms`);
      }
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      console.error(`\x1b[31m[sidecar]\x1b[0m ✗ Build failed after ${duration}ms`);
      if (error instanceof Error && 'stderr' in error) {
        console.error("\x1b[31m[sidecar]\x1b[0m", (error as { stderr?: Buffer }).stderr?.toString() || error.message);
      } else if (error instanceof Error) {
        console.error("\x1b[31m[sidecar]\x1b[0m", error.message);
      }
      // 不退出进程，让 Vite 继续启动，但 sidecar 功能将不可用
    }
    
    console.log("");
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
