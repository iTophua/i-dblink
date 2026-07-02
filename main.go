package main

import (
	"context"
	"embed"
	"os"
	gos "runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"idblink/backend"
)

//go:embed all:frontend/dist
var assets embed.FS

func emitMenuEvent(ctx context.Context, action string) {
	runtime.EventsEmit(ctx, "menu-action", action)
}

func callback(app *backend.App, action string) func(*menu.CallbackData) {
	return func(_ *menu.CallbackData) {
		ctx := app.Context()
		if ctx == nil {
			return
		}
		emitMenuEvent(ctx, action)
	}
}

func createFileMenu(app *backend.App) *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.Text("新建连接", keys.CmdOrCtrl("n"), callback(app, "new-connection")))
	m.Append(menu.Text("打开连接", keys.CmdOrCtrl("o"), callback(app, "open-connection")))
	m.Append(menu.Separator())
	m.Append(menu.Text("保存", keys.CmdOrCtrl("s"), callback(app, "save")))
	m.Append(menu.Text("另存为...", keys.CmdOrCtrl("shift-s"), callback(app, "save-as")))
	m.Append(menu.Separator())
	m.Append(menu.Text("导入连接配置...", keys.CmdOrCtrl("i"), callback(app, "import-connections")))
	m.Append(menu.Text("导出连接配置...", keys.CmdOrCtrl("e"), callback(app, "export-connections")))
	return m
}

func createEditMenu(app *backend.App) *menu.Menu {
	m := menu.NewMenu()
	// 非 macOS 平台的编辑菜单（macOS 使用 menu.EditMenu() 角色菜单）
	m.Append(menu.Text("撤销", nil, callback(app, "undo")))
	m.Append(menu.Text("重做", nil, callback(app, "redo")))
	m.Append(menu.Separator())
	m.Append(menu.Text("剪切", nil, callback(app, "cut")))
	m.Append(menu.Text("复制", nil, callback(app, "copy")))
	m.Append(menu.Text("粘贴", nil, callback(app, "paste")))
	m.Append(menu.Text("全选", nil, callback(app, "select-all")))
	m.Append(menu.Separator())
	m.Append(menu.Text("查找/替换...", keys.CmdOrCtrl("f"), callback(app, "find")))
	return m
}

func createViewMenu(app *backend.App) *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.Text("刷新", keys.Key("f5"), callback(app, "refresh")))
	m.Append(menu.Separator())
	m.Append(menu.Text("放大", keys.CmdOrCtrl("+"), callback(app, "zoom-in")))
	m.Append(menu.Text("缩小", keys.CmdOrCtrl("-"), callback(app, "zoom-out")))
	m.Append(menu.Text("实际大小", keys.CmdOrCtrl("0"), callback(app, "zoom-reset")))
	m.Append(menu.Separator())
	m.Append(menu.Text("全屏切换", keys.Key("f11"), callback(app, "fullscreen")))
	return m
}

func createConnectionMenu(app *backend.App) *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.Text("连接所选", keys.CmdOrCtrl("shift-c"), callback(app, "connect-selected")))
	m.Append(menu.Text("断开连接", nil, callback(app, "disconnect")))
	m.Append(menu.Separator())
	m.Append(menu.Text("新建查询", keys.CmdOrCtrl("q"), callback(app, "new-query")))
	m.Append(menu.Text("执行查询", keys.CmdOrCtrl("enter"), callback(app, "execute-query")))
	m.Append(menu.Separator())
	m.Append(menu.Text("关闭所有连接", nil, callback(app, "close-all")))
	return m
}

func createToolsMenu(app *backend.App) *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.Text("选项/设置...", keys.CmdOrCtrl(","), callback(app, "options")))
	m.Append(menu.Text("操作日志", nil, callback(app, "operation-log")))
	m.Append(menu.Text("数据迁移...", nil, callback(app, "data-migration")))
	m.Append(menu.Text("数据同步...", nil, callback(app, "data-sync")))
	m.Append(menu.Separator())
	m.Append(menu.Text("备份数据库...", nil, callback(app, "backup")))
	m.Append(menu.Text("恢复数据库...", nil, callback(app, "restore")))
	m.Append(menu.Separator())
	m.Append(menu.Text("模型设计器...", nil, callback(app, "model-designer")))
	return m
}

func createWindowMenu(app *backend.App) *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.Text("新建标签页", keys.CmdOrCtrl("t"), callback(app, "new-tab")))
	m.Append(menu.Text("关闭标签页", keys.CmdOrCtrl("w"), callback(app, "close-tab")))
	m.Append(menu.Separator())
	m.Append(menu.Text("切换到下一个标签页", keys.CmdOrCtrl("tab"), callback(app, "next-tab")))
	m.Append(menu.Text("切换到上一个标签页", keys.CmdOrCtrl("shift-tab"), callback(app, "previous-tab")))
	m.Append(menu.Separator())
	m.Append(menu.Text("层叠", nil, callback(app, "cascade")))
	m.Append(menu.Text("水平平铺", nil, callback(app, "tile-horizontally")))
	m.Append(menu.Text("垂直平铺", nil, callback(app, "tile-vertically")))
	return m
}

func createHelpMenu(app *backend.App) *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.Text("文档", keys.Key("f1"), callback(app, "documentation")))
	m.Append(menu.Text("搜索...", nil, callback(app, "search")))
	m.Append(menu.Separator())
	m.Append(menu.Text("检查更新...", nil, callback(app, "check-update")))

	m.Append(menu.Separator())
	m.Append(menu.Text("开发者工具", keys.Key("f12"), func(_ *menu.CallbackData) {
		app.ShowDevTools()
	}))
	return m
}

func createMenu(app *backend.App) *menu.Menu {
	items := []*menu.MenuItem{
		menu.AppMenu(),
		menu.SubMenu("文件", createFileMenu(app)),
	}

	if gos.GOOS == "darwin" {
		// macOS: 使用 EditMenu 角色菜单，系统会自动将 Cmd+C/V/X/Z/A 转发给 WebView
		items = append(items, menu.EditMenu())
	} else {
		items = append(items, menu.SubMenu("编辑", createEditMenu(app)))
	}

	items = append(items,
		menu.SubMenu("查看", createViewMenu(app)),
		menu.SubMenu("连接", createConnectionMenu(app)),
		menu.SubMenu("工具", createToolsMenu(app)),
		menu.SubMenu("窗口", createWindowMenu(app)),
		menu.SubMenu("帮助", createHelpMenu(app)),
	)

	return menu.NewMenuFromItems(items[0], items[1:]...)
}

func main() {
	app := backend.NewApp()

		err := wails.Run(&options.App{
		Title:     "iDBLink",
		Width:     1400,
		Height:    900,
		MinWidth:  1000,
		MinHeight: 700,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Menu:       createMenu(app),
		OnStartup:  app.Startup,
		OnShutdown: app.Shutdown,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			BackdropType:         windows.Mica,
		},
		Mac: &mac.Options{
			// 使用标准 macOS 标题栏（可拖动，有红绿灯按钮，显示标题）
			// 替代之前的 TitleBarHiddenInset + 自定义 React TitleBar 组件
			TitleBar:             mac.TitleBarDefault(),
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			About: &mac.AboutInfo{
				Title:   "iDBLink",
				Message: "A cross-platform database management tool",
			},
		},
		Linux: &linux.Options{},
	})

	if err != nil {
		os.Stderr.WriteString(err.Error())
		os.Exit(1)
	}
}
