package backend

import (
	"fmt"
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"
)

var popupWindowSeq atomic.Uint32

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
		// 与主窗口一致：webview 透明 + 米色底，避免启动白闪
		BackgroundType:   application.BackgroundTypeTransparent,
		BackgroundColour: application.NewRGB(242, 241, 237),
	})
	return id, nil
}
