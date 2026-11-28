package backend

import (
	"fmt"
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"
)

var popupWindowSeq atomic.Uint32

// popupWindowBackground 结果弹窗的原生底色，和主窗口一样按上次的主题给（见 StartupTheme）。
// 新窗口的 webview 要加载一会儿才画出第一帧，这段时间露出来的是原生底色——写死浅色的话，
// 深色用户每开一次弹窗都先闪一下
func (a *App) popupWindowBackground() application.RGBA {
	// 主题里取不到颜色时退回原来的米色：颜色不对也比没有底色强
	if r, g, b, ok := a.storage.StartupTheme().BackgroundColor(SystemPrefersDark()); ok {
		return application.NewRGB(r, g, b)
	}
	return application.NewRGB(242, 241, 237)
}

// OpenResultPopup 创建独立的「查询结果」查看窗口并返回其 popupId。
// 前端根据 URL hash（/#popup/<popupId>）路由到精简结果视图，
// 并经 popup-result:request/data 事件从源编辑器取当前结果集快照。
// 支持多开（每次点击新窗口），便于双屏对比两组结果。
func (a *App) OpenResultPopup() (string, error) {
	app := application.Get()
	if app == nil {
		return "", fmt.Errorf("应用未运行")
	}
	id := fmt.Sprintf("result-%d", popupWindowSeq.Add(1))
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:  "popup-" + id,
		Title: "iDBLink · 查询结果",
		URL:   "/#popup/" + id,
		Width: 1000, Height: 640,
		MinWidth: 480, MinHeight: 320,
		// 与主窗口一致：webview 透明，底色按上次的主题给
		BackgroundType:   application.BackgroundTypeTransparent,
		BackgroundColour: a.popupWindowBackground(),
	})
	return id, nil
}
