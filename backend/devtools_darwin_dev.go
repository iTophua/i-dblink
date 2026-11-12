//go:build darwin && !ios && (!production || devtools)

package backend

/*
#cgo CFLAGS: -x objective-c -mmacosx-version-min=10.13
#cgo LDFLAGS: -framework Cocoa -framework WebKit

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

// macOS 13.3+ 起 WKWebView 必须显式 inspectable；而仅设置公开的 inspectable
// 在部分系统上仍无法通过 _inspector 直接打开（Safari 能看到但不会弹窗）。
// 这里按 Neutralinojs/Wails issue 的通行做法补齐私有 _setInspectable: 与
// developerExtrasEnabled，再用 _inspector show 打开。
@interface WKWebView (IDBInspector)
- (id)_inspector;
- (void)_setInspectable:(BOOL)value;
@end

static WKWebView *IDBFindWebView(NSView *view) {
    if (view == nil) return nil;
    if ([view isKindOfClass:[WKWebView class]]) return (WKWebView *)view;
    for (NSView *child in [view subviews]) {
        WKWebView *found = IDBFindWebView(child);
        if (found) return found;
    }
    return nil;
}

// 返回 1 表示已调用 inspector show，0 表示找不到 webview 或私有 API 不可用
static int IDBOpenWebInspector(void) {
    @autoreleasepool {
        // 取面积最大的可见窗口（主窗口），避免误开快速连接浮窗的 inspector
        WKWebView *webView = nil;
        CGFloat bestArea = 0;
        for (NSWindow *window in [NSApp windows]) {
            if (![window isVisible]) continue;
            NSView *content = [window contentView];
            WKWebView *candidate = IDBFindWebView(content);
            if (!candidate) continue;
            NSRect frame = content.frame;
            CGFloat area = frame.size.width * frame.size.height;
            if (area > bestArea) {
                bestArea = area;
                webView = candidate;
            }
        }
        if (!webView) {
            NSLog(@"[iDBLink] DevTools: WKWebView not found");
            return 0;
        }

        @try {
            [webView.configuration.preferences setValue:@YES forKey:@"developerExtrasEnabled"];
        } @catch (NSException *exception) {
            NSLog(@"[iDBLink] DevTools: developerExtrasEnabled failed: %@", exception.reason);
        }

        if (@available(macOS 13.3, *)) {
            webView.inspectable = YES;
        }
        if ([webView respondsToSelector:@selector(_setInspectable:)]) {
            @try {
                [webView _setInspectable:YES];
            } @catch (NSException *exception) {
                NSLog(@"[iDBLink] DevTools: _setInspectable failed: %@", exception.reason);
            }
        }

        if ([webView respondsToSelector:@selector(_inspector)]) {
            @try {
                id inspector = [webView _inspector];
                if (inspector != nil && [inspector respondsToSelector:@selector(show)]) {
                    [inspector performSelector:@selector(show)];
                    return 1;
                }
            } @catch (NSException *exception) {
                NSLog(@"[iDBLink] DevTools: _inspector show failed: %@", exception.reason);
            }
        }

        NSLog(@"[iDBLink] DevTools: private inspector API unavailable");
        return 0;
    }
}

// 后端绑定调用可能不在主线程；AppKit/WebKit 的 UI 操作必须在主线程执行
static int IDBOpenWebInspectorOnMain(void) {
    if ([NSThread isMainThread]) {
        return IDBOpenWebInspector();
    }
    __block int result = 0;
    dispatch_sync(dispatch_get_main_queue(), ^{
        result = IDBOpenWebInspector();
    });
    return result;
}
*/
import "C"

// openNativeWebInspector 尝试用 WebKit 私有 API 打开 Web Inspector。
// 返回 false 时调用方可回退到 Wails 的 OpenDevTools。
func openNativeWebInspector() bool {
	return C.IDBOpenWebInspectorOnMain() != 0
}
