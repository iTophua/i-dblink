#!/usr/bin/env bash
set -euo pipefail

APP_NAME="iDBLink"
BUILD_DIR="build/bin"
DMG_NAME="${APP_NAME}.dmg"
VOLNAME="${APP_NAME}"
WAILS3="${WAILS3:-$HOME/go/bin/wails3}"

# --- 前置检查 ---
if ! command -v create-dmg &>/dev/null; then
  echo "Error: create-dmg not found. Install via: brew install create-dmg"
  exit 1
fi

if [ ! -x "$WAILS3" ]; then
  echo "Error: wails3 CLI not found at $WAILS3"
  echo "Install via: go install github.com/wailsapp/wails/v3/cmd/wails3@latest"
  exit 1
fi

# --- 构建（wails3 task package：编译 + 组装 .app bundle + adhoc 签名） ---
echo "==> Building ${APP_NAME}..."
PATH="$HOME/go/bin:$PATH" "$WAILS3" task package

APP_PATH="${BUILD_DIR}/${APP_NAME}.app"
if [ ! -d "${APP_PATH}" ]; then
  echo "Error: ${APP_PATH} not found after build"
  exit 1
fi

# --- 清理旧产物 ---
rm -f "${BUILD_DIR}/${DMG_NAME}"
rm -f "${BUILD_DIR}"/rw.*."${DMG_NAME}"

# --- 创建 DMG ---
echo "==> Creating DMG installer..."
create-dmg \
  --volname "${VOLNAME}" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 100 \
  --icon "${APP_NAME}.app" 175 120 \
  --app-drop-link 425 120 \
  "${BUILD_DIR}/${DMG_NAME}" \
  "${APP_PATH}" \
  || { echo "Error: create-dmg failed"; exit 1; }

echo "==> Done: ${BUILD_DIR}/${DMG_NAME}"
