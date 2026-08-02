//go:build darwin

package backend

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework AppKit

#import <AppKit/AppKit.h>

// applyAppearance 在主线程设置 NSApp 及其所有窗口的 appearance。
//   appearance == nil → 移除覆盖，跟随系统偏好
//   appearance != nil → 强制指定外观（Aqua/DarkAqua）
//
// 必须在 main thread 执行（NSApp/NSWindow 的 UI 操作要求），
// 调用方需自行 dispatch_async 到 main queue。
static void applyAppearance(NSAppearance *appearance) {
    // 窗口级：影响标题栏底色、红绿灯按钮样式、窗口边框
    for (NSWindow *win in [NSApp windows]) {
        [win setAppearance:appearance];
    }
    // 应用级兜底：影响菜单栏弹出项、新开窗口的默认外观
    [NSApp setAppearance:appearance];
}

// setWindowAppearance 派发到主线程设置原生窗口外观。
//   mode: "light" → NSAppearanceNameAqua（标准浅色）
//        "dark"  → NSAppearanceNameDarkAqua（标准深色）
//        其他/空  → nil，移除覆盖，跟随系统偏好
//
// Wails 绑定方法运行在 Go goroutine（非主线程），
// 直接操作 NSApp/NSWindow 会触发 Cocoa 异常，
// 因此必须 dispatch_async 到 main queue。
static void setWindowAppearance(const char* mode) {
    if (mode == NULL) return;
    NSString *m = [NSString stringWithUTF8String:mode];
    NSAppearance *appearance = nil;
    if ([m isEqualToString:@"dark"]) {
        appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    } else if ([m isEqualToString:@"light"]) {
        appearance = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
    }
    // system/未知: appearance 保持 nil

    NSAppearance *captured = [appearance retain];  // 跨 block 保留
    dispatch_async(dispatch_get_main_queue(), ^{
        applyAppearance(captured);
        [captured release];
    });
}
*/
import "C"

import "unsafe"

// SetWindowAppearance 设置 macOS 原生窗口外观（仅 darwin 生效）。
//
// mode 取值：
//   - "light"：标准浅色外观（NSAppearanceNameAqua）
//   - "dark"：标准深色外观（NSAppearanceNameDarkAqua）
//   - "system"（或任何其他值）：移除覆盖，跟随系统偏好
//
// 内部通过 dispatch_async 派发到主线程执行，安全可在任意 goroutine 调用。
// 非 darwin 平台此函数为空实现（见 window_appearance_other.go）。
func SetWindowAppearance(mode string) {
	cMode := C.CString(mode)
	defer C.free(unsafe.Pointer(cMode))
	C.setWindowAppearance(cMode)
}
