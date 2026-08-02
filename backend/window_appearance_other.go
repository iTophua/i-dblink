//go:build !darwin

package backend

// SetWindowAppearance 非 macOS 平台 stub。
//
// macOS 之外（Windows/Linux）的原生窗口外观由各平台自带机制控制
// （如 Windows 由系统注册表 / Mica 自动跟随），无需应用层干预。
// 此空实现保证跨平台编译通过。
func SetWindowAppearance(_ string) {}
