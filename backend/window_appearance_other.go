//go:build !darwin

package backend

// SetWindowAppearance 非 macOS 平台 stub。
//
// macOS 之外（Windows/Linux）的原生窗口外观由各平台自带机制控制
// （如 Windows 由系统注册表 / Mica 自动跟随），无需应用层干预。
// 此空实现保证跨平台编译通过。
func SetWindowAppearance(_ string) {}

// setDockBadgeDarwin 非 macOS 平台 stub（dock 角标仅 macOS 有）。
func setDockBadgeDarwin(_ string) {}

// SystemPrefersDark 非 macOS 平台 stub：查不到系统外观，按浅色算。
// 只影响启动瞬间「跟随系统」主题的原生窗口底色，前端起来后会把实际颜色写回窗口
func SystemPrefersDark() bool { return false }
