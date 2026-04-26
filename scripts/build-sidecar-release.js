#!/usr/bin/env node
/**
 * 为当前平台构建 Go sidecar 到 src-tauri/sidecars/
 *
 * macOS: 同时构建 x86_64 + aarch64
 * Linux: 构建 x86_64
 * Windows: 构建 x86_64
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const goDir = path.join(rootDir, "go-backend");
const sidecarsDir = path.join(rootDir, "src-tauri", "sidecars");

if (!fs.existsSync(goDir)) {
  console.error("[sidecar-release] go-backend/ not found");
  process.exit(1);
}

fs.mkdirSync(sidecarsDir, { recursive: true });

const platform = process.platform;

function build(name, env = {}) {
  const out = path.join(sidecarsDir, name);
  console.log(`[sidecar-release] Building ${name}...`);
  try {
    execSync("go build -o " + out, {
      cwd: goDir,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    console.log(`[sidecar-release] ${name} done`);
  } catch {
    console.error(`[sidecar-release] ${name} failed`);
    process.exit(1);
  }
}

if (platform === "darwin") {
  build("go-backend-x86_64-apple-darwin", {
    GOOS: "darwin",
    GOARCH: "amd64",
  });
  build("go-backend-aarch64-apple-darwin", {
    GOOS: "darwin",
    GOARCH: "arm64",
  });
} else if (platform === "linux") {
  build("go-backend-x86_64-unknown-linux-gnu", {
    GOOS: "linux",
    GOARCH: "amd64",
  });
} else if (platform === "win32") {
  build("go-backend-x86_64-pc-windows-msvc.exe", {
    GOOS: "windows",
    GOARCH: "amd64",
  });
} else {
  console.error(`[sidecar-release] Unsupported platform: ${platform}`);
  process.exit(1);
}

console.log("[sidecar-release] All sidecars built successfully");
