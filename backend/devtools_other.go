//go:build !darwin || ios

package backend

// openNativeWebInspector 非 macOS 平台由 Wails 自身处理 DevTools。
func openNativeWebInspector() bool { return false }
