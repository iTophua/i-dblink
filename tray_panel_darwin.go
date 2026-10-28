//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c -mmacosx-version-min=10.13
#cgo LDFLAGS: -framework Cocoa

#import <Cocoa/Cocoa.h>

extern void goHideTrayPanel();

// 面板窗口（常驻仅隐藏，进程生命周期内有效，无需 retain）
static void* g_panelWindow = NULL;
// 面板本次可见的起始时间（秒）。0 = 不可见。
// 由 5Hz 可见性轮询（panelVisibilityTick）维护 —— 不能靠 monitor 事件
// 的首次观察来推断：显示与下一次点击之间可能没有任何事件，
// 宽限期会被错误地锚定到"关闭点击"本身。
static NSTimeInterval g_visibleSince = 0;

static BOOL panelOutsideClick(NSWindow* win) {
	if (g_panelWindow == NULL) return NO;
	if (win == nil || ![win isVisible]) return NO;
	if (g_visibleSince == 0) return NO; // 通知未及，保守放行
	NSTimeInterval now = [NSDate timeIntervalSinceReferenceDate];
	if (now - g_visibleSince < 0.3) return NO;
	// 点击点（全局屏幕坐标，左下原点）是否在面板 frame 外
	NSPoint p = [NSEvent mouseLocation];
	NSRect f = [win frame];
	return !NSMouseInRect(p, f, NO);
}

static void hideViaGo() {
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
		goHideTrayPanel();
	});
}

static id g_globalMonitor = nil;
static id g_localMonitor = nil;
static NSTimer* g_visTimer = nil;

// 5Hz 跟踪面板可见性迁移：显示瞬间打点宽限起点，隐藏清零。
// （OrderOn/OffScreen 通知名为私有常量，故用轮询代替）
static void panelVisibilityTick(NSTimer* t) {
	NSWindow* win = (NSWindow*)g_panelWindow;
	BOOL vis = (win != nil && [win isVisible]);
	if (vis && g_visibleSince == 0) {
		g_visibleSince = [NSDate timeIntervalSinceReferenceDate];
	} else if (!vis && g_visibleSince != 0) {
		g_visibleSince = 0;
	}
}

static void installTrayPanelMonitorsOnMain(void* nsWindow) {
	if (g_globalMonitor) return;
	g_panelWindow = nsWindow;
	// 其他 app 的鼠标按下（global monitor 只观察不消费，无需辅助功能权限）
	g_globalMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDown
		handler:^void(NSEvent* e) {
			@autoreleasepool {
				if (panelOutsideClick((NSWindow*)g_panelWindow)) hideViaGo();
			}
		}];
	// 本 app 内的鼠标按下（点击主窗口等），事件原样放行
	g_localMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDown
		handler:^NSEvent*(NSEvent* e) {
			@autoreleasepool {
				if (panelOutsideClick((NSWindow*)g_panelWindow)) hideViaGo();
			}
			return e;
		}];
	g_visTimer = [NSTimer scheduledTimerWithTimeInterval:0.2 repeats:YES
		block:^(NSTimer* t) { panelVisibilityTick(t); }];
}

// NSEvent monitor / NSTimer 必须在主线程创建；调用方均为 wails 事件的
// goroutine 回调（非主线程），dispatch_sync 安全且天然串行化重复安装。
static void installTrayPanelMonitors(void* nsWindow) {
	dispatch_sync(dispatch_get_main_queue(), ^{
		installTrayPanelMonitorsOnMain(nsWindow);
	});
}
*/
import "C"

import (
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// trayPanelWindow 在 runGUI 中赋值，供 monitor 回调读取。
var trayPanelWindow application.Window

//export goHideTrayPanel
func goHideTrayPanel() {
	if trayPanelWindow != nil && trayPanelWindow.IsVisible() {
		trayPanelWindow.Hide()
	}
}

// installTrayPanelOutsideClickMonitor 注册面板外的鼠标按下监听：
// 点击面板窗口之外（任意 app / 本 app 其他窗口）时隐藏面板。
// 这覆盖了 wails HideOnFocusLost 的盲区 —— app 未激活时面板可见，
// 点击别处不会有任何 focus/resign 事件，只能靠全局监听兜底。
func installTrayPanelOutsideClickMonitor(nativeWindow unsafe.Pointer) {
	C.installTrayPanelMonitors(nativeWindow)
}
