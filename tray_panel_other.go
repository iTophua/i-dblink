//go:build !darwin

package main

import (
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// trayPanelWindow 与 darwin 版对应（main.go 无条件赋值），非 macOS 无人读取。
var trayPanelWindow application.Window

// 非 macOS 平台：wails 的 HideOnFocusLost 基于 WM_KILL_FOCUS，行为正常，无需兜底。
func installTrayPanelOutsideClickMonitor(_ unsafe.Pointer) {}
