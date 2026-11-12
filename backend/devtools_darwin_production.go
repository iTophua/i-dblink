//go:build darwin && !ios && production && !devtools

package backend

// openNativeWebInspector 纯生产构建（未带 devtools tag）不包含私有 WebKit
// inspector selector，回退到 Wails 的空实现。
func openNativeWebInspector() bool { return false }
