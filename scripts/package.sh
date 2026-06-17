#!/usr/bin/env bash
set -euo pipefail

APP_NAME="iDBLink"
BUILD_DIR="build/bin"
DMG_NAME="${APP_NAME}.dmg"
VOLNAME="${APP_NAME}"

echo "==> Building frontend..."
cd frontend && pnpm build && cd ..

echo "==> Building ${APP_NAME}..."
wails build

APP_PATH="${BUILD_DIR}/${APP_NAME}.app"
if [ ! -d "${APP_PATH}" ]; then
  echo "Error: ${APP_PATH} not found after build"
  exit 1
fi

echo "==> Creating DMG installer..."
create-dmg \
  --volname "${VOLNAME}" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 100 \
  --icon "${APP_NAME}.app" 175 120 \
  --app-drop-link 425 120 \
  "${BUILD_DIR}/${DMG_NAME}" \
  "${APP_PATH}"

echo "==> Done: ${BUILD_DIR}/${DMG_NAME}"
