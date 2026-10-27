package main

import (
	"embed"
	"fmt"
	"log"
	"os"
	gos "runtime"

	"github.com/wailsapp/wails/v3/pkg/application"

	"idblink/backend"
	"idblink/backend/mcpserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func emitMenuEvent(action string) {
	if app := application.Get(); app != nil {
		app.Event.Emit("menu-action", action)
	}
}

func callback(action string) func(*application.Context) {
	return func(*application.Context) {
		emitMenuEvent(action)
	}
}

func createFileMenu() *application.Menu {
	m := application.NewMenu()
	m.Add("新建连接").SetAccelerator("CmdOrCtrl+n").OnClick(callback("new-connection"))
	m.Add("打开连接").SetAccelerator("CmdOrCtrl+o").OnClick(callback("open-connection"))
	m.AddSeparator()
	m.Add("保存").SetAccelerator("CmdOrCtrl+s").OnClick(callback("save"))
	m.Add("另存为...").SetAccelerator("Shift+CmdOrCtrl+s").OnClick(callback("save-as"))
	m.AddSeparator()
	m.Add("导入连接配置...").SetAccelerator("CmdOrCtrl+i").OnClick(callback("import-connections"))
	m.Add("导出连接配置...").SetAccelerator("CmdOrCtrl+e").OnClick(callback("export-connections"))
	return m
}

func createEditMenu() *application.Menu {
	m := application.NewMenu()
	// 非 macOS 平台的编辑菜单（macOS 使用 EditMenu 角色菜单）
	m.Add("撤销").OnClick(callback("undo"))
	m.Add("重做").OnClick(callback("redo"))
	m.AddSeparator()
	m.Add("剪切").OnClick(callback("cut"))
	m.Add("复制").OnClick(callback("copy"))
	m.Add("粘贴").OnClick(callback("paste"))
	m.Add("全选").OnClick(callback("select-all"))
	m.AddSeparator()
	m.Add("查找/替换...").SetAccelerator("CmdOrCtrl+f").OnClick(callback("find"))
	return m
}

func createViewMenu() *application.Menu {
	m := application.NewMenu()
	m.Add("刷新").SetAccelerator("f5").OnClick(callback("refresh"))
	m.AddSeparator()
	m.Add("放大").SetAccelerator("CmdOrCtrl+plus").OnClick(callback("zoom-in"))
	m.Add("缩小").SetAccelerator("CmdOrCtrl+-").OnClick(callback("zoom-out"))
	m.Add("实际大小").SetAccelerator("CmdOrCtrl+0").OnClick(callback("zoom-reset"))
	m.AddSeparator()
	m.Add("全屏切换").SetAccelerator("f11").OnClick(callback("fullscreen"))
	return m
}

func createConnectionMenu() *application.Menu {
	m := application.NewMenu()
	m.Add("连接所选").SetAccelerator("Shift+CmdOrCtrl+c").OnClick(callback("connect-selected"))
	m.Add("断开连接").OnClick(callback("disconnect"))
	m.AddSeparator()
	m.Add("新建查询").SetAccelerator("CmdOrCtrl+q").OnClick(callback("new-query"))
	m.Add("执行查询").SetAccelerator("CmdOrCtrl+enter").OnClick(callback("execute-query"))
	m.AddSeparator()
	m.Add("关闭所有连接").OnClick(callback("close-all"))
	return m
}

func createToolsMenu() *application.Menu {
	m := application.NewMenu()
	m.Add("选项/设置...").SetAccelerator("CmdOrCtrl+,").OnClick(callback("options"))
	m.Add("操作日志").OnClick(callback("operation-log"))
	m.Add("数据迁移...").OnClick(callback("data-migration"))
	m.Add("数据同步...").OnClick(callback("data-sync"))
	m.AddSeparator()
	m.Add("备份数据库...").OnClick(callback("backup"))
	m.Add("恢复数据库...").OnClick(callback("restore"))
	m.AddSeparator()
	m.Add("模型设计器...").OnClick(callback("model-designer"))
	return m
}

func createWindowMenu() *application.Menu {
	m := application.NewMenu()
	m.Add("新建标签页").SetAccelerator("CmdOrCtrl+t").OnClick(callback("new-tab"))
	m.Add("关闭标签页").SetAccelerator("CmdOrCtrl+w").OnClick(callback("close-tab"))
	m.AddSeparator()
	m.Add("切换到下一个标签页").SetAccelerator("CmdOrCtrl+tab").OnClick(callback("next-tab"))
	m.Add("切换到上一个标签页").SetAccelerator("Shift+CmdOrCtrl+tab").OnClick(callback("previous-tab"))
	m.AddSeparator()
	m.Add("层叠").OnClick(callback("cascade"))
	m.Add("水平平铺").OnClick(callback("tile-horizontally"))
	m.Add("垂直平铺").OnClick(callback("tile-vertically"))
	return m
}

func createHelpMenu(app *backend.App) *application.Menu {
	m := application.NewMenu()
	m.Add("文档").SetAccelerator("f1").OnClick(callback("documentation"))
	m.Add("搜索...").OnClick(callback("search"))
	m.AddSeparator()
	m.Add("检查更新...").OnClick(callback("check-update"))

	m.AddSeparator()
	m.Add("开发者工具").SetAccelerator("f12").OnClick(func(*application.Context) {
		app.ShowDevTools()
	})
	return m
}

func createMenu(app *backend.App) *application.Menu {
	menu := application.NewMenu()

	if gos.GOOS == "darwin" {
		// macOS: AppMenu 角色菜单（关于/服务/隐藏/退出），EditMenu 角色菜单
		// 系统会自动将 Cmd+C/V/X/Z/A 转发给 WebView
		menu.AddRole(application.AppMenu)
		menu.AddSubmenu("文件").Append(createFileMenu())
		menu.AddRole(application.EditMenu)
	} else {
		menu.AddSubmenu("文件").Append(createFileMenu())
		menu.AddSubmenu("编辑").Append(createEditMenu())
	}

	menu.AddSubmenu("查看").Append(createViewMenu())
	menu.AddSubmenu("连接").Append(createConnectionMenu())
	menu.AddSubmenu("工具").Append(createToolsMenu())
	menu.AddSubmenu("窗口").Append(createWindowMenu())
	menu.AddSubmenu("帮助").Append(createHelpMenu(app))

	return menu
}

func main() {
	// MCP sidecar 模式：iDBLink --mcp [--stdio]
	if len(os.Args) >= 2 && os.Args[1] == "--mcp" {
		runMCP()
		return
	}
	runGUI()
}

// runMCP 以 MCP Server 模式启动（不启动 GUI）。
// 外部 AI 客户端（Claude Desktop / Cursor）以子进程方式拉起此进程，
// 通过 stdin/stdout 进行 MCP 协议通信。
func runMCP() {
	app := backend.NewApp()
	if err := app.InitStandalone(); err != nil {
		fmt.Fprintf(os.Stderr, "[mcp] init failed: %v\n", err)
		os.Exit(1)
	}

	srv := mcpserver.New(app)
	if err := srv.ServeStdio(); err != nil {
		fmt.Fprintf(os.Stderr, "[mcp] server error: %v\n", err)
		os.Exit(1)
	}
}

// runGUI 以 Wails GUI 模式启动（默认）。
func runGUI() {
	app := backend.NewApp()

	wailsApp := application.New(application.Options{
		Name:        "iDBLink",
		Description: "A cross-platform database management tool",
		Services: []application.Service{
			application.NewService(app),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			// 关闭最后一个窗口时退出应用（与 v2 行为一致）
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	wailsApp.Menu.Set(createMenu(app))

	wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:               "main",
		Title:              "iDBLink",
		Width:              1400,
		Height:             900,
		MinWidth:           1000,
		MinHeight:          700,
		UseApplicationMenu: true,
		// 初始窗口背景色（webview 透明时作为底色显示）
		// 取 light 默认背景 #F2F1ED（护眼米色），前端主题加载后由 Window.SetBackgroundColour 同步覆盖。
		// 选浅色而非深色：深色用户启动闪浅色 → 立即被覆盖，比浅色用户闪黑更可接受。
		BackgroundType:   application.BackgroundTypeTransparent,
		BackgroundColour: application.NewRGB(242, 241, 237),
		Mac: application.MacWindow{
			// 隐藏标题栏：内容延伸到窗口顶部，红绿灯按钮保留在左上角。
			// 配合前端 Toolbar 的 -webkit-app-region: drag 实现窗口拖动。
			// Webview 透明（BackgroundTypeTransparent），窗口 BackgroundColour 作为底色
			// （由前端在主题切换时通过 Window.SetBackgroundColour 同步，消除启动白屏）
			TitleBar: application.MacTitleBarHidden,
		},
	})

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
