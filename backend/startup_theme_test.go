package backend

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestStartupThemeRoundTrip(t *testing.T) {
	dataDir := t.TempDir()
	st, err := NewStorage(dataDir)
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	app := &App{storage: st}
	if err := app.SaveStartupTheme("#FAFCFB", "#1B1E22", "dark"); err != nil {
		t.Fatalf("save: %v", err)
	}
	_ = st.Close()

	// 启动时读到的是上次运行写下的值（重开一次库，不靠内存里的状态）
	reopened, err := NewStorage(dataDir)
	if err != nil {
		t.Fatalf("reopen storage: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	got := reopened.StartupTheme()
	want := StartupTheme{LightBackground: "#FAFCFB", DarkBackground: "#1B1E22", NativeMode: "dark"}
	if got != want {
		t.Fatalf("expected %+v, got %+v", want, got)
	}
}

// 入口是绑定方法，格式不能只靠前端约束
func TestSaveStartupThemeRejectsInvalid(t *testing.T) {
	st, err := NewStorage(t.TempDir())
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	app := &App{storage: st}

	for name, args := range map[string][3]string{
		"light not hex": {"F2F3F8", "#101118", "dark"},
		"dark not hex":  {"#F2F3F8", "#10111", "dark"},
		"unknown mode":  {"#F2F3F8", "#101118", "blue"},
		"empty mode":    {"#F2F3F8", "#101118", ""},
		"with alpha":    {"#F2F3F8FF", "#101118", "dark"},
		"css var":       {"var(--background)", "#101118", "dark"},
	} {
		if err := app.SaveStartupTheme(args[0], args[1], args[2]); err == nil {
			t.Errorf("%s: expected error, got nil", name)
		}
	}
	// 被拒绝的值没有落库
	if _, found, err := st.GetAppConfig(startupThemeKey); err != nil || found {
		t.Fatalf("rejected values must not be stored, found=%v err=%v", found, err)
	}
}

func TestStartupThemeFallsBackToDefault(t *testing.T) {
	cases := map[string]string{
		"not json":           "light",
		"bad hex":            `{"light_background":"red","dark_background":"#101118","native_mode":"dark"}`,
		"bad mode":           `{"light_background":"#F2F3F8","dark_background":"#101118","native_mode":"blue"}`,
		"missing dark color": `{"light_background":"#F2F3F8","native_mode":"dark"}`,
	}
	for name, raw := range cases {
		st, err := NewStorage(t.TempDir())
		if err != nil {
			t.Fatalf("%s: new storage: %v", name, err)
		}
		if err := st.SetAppConfig(startupThemeKey, raw); err != nil {
			t.Fatalf("%s: seed: %v", name, err)
		}
		if got := st.StartupTheme(); got != defaultStartupTheme {
			t.Errorf("%s: expected default %+v, got %+v", name, defaultStartupTheme, got)
		}
		_ = st.Close()
	}

	// 没存过（升级后的第一次启动）
	fresh, err := NewStorage(filepath.Join(t.TempDir(), "fresh"))
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	t.Cleanup(func() { _ = fresh.Close() })
	if got := fresh.StartupTheme(); got != defaultStartupTheme {
		t.Fatalf("expected default when nothing stored, got %+v", got)
	}
}

func TestStartupThemeBackgroundColor(t *testing.T) {
	theme := StartupTheme{LightBackground: "#F2F3F8", DarkBackground: "#101118", NativeMode: "system"}
	cases := []struct {
		name       string
		mode       string
		systemDark bool
		want       [3]uint8
	}{
		{"system on dark system", "system", true, [3]uint8{0x10, 0x11, 0x18}},
		{"system on light system", "system", false, [3]uint8{0xF2, 0xF3, 0xF8}},
		{"explicit dark ignores light system", "dark", false, [3]uint8{0x10, 0x11, 0x18}},
		{"explicit light ignores dark system", "light", true, [3]uint8{0xF2, 0xF3, 0xF8}},
	}
	for _, c := range cases {
		theme.NativeMode = c.mode
		r, g, b, ok := theme.BackgroundColor(c.systemDark)
		if !ok || [3]uint8{r, g, b} != c.want {
			t.Errorf("%s: expected %v, got %v ok=%v", c.name, c.want, [3]uint8{r, g, b}, ok)
		}
	}

	// 没经过 StartupTheme() 校验的值（空串、短一截）不能 panic，只报不可用
	for _, bad := range []StartupTheme{
		{},
		{LightBackground: "#", DarkBackground: "#101118", NativeMode: "light"},
	} {
		if _, _, _, ok := bad.BackgroundColor(false); ok {
			t.Errorf("%+v: expected ok=false", bad)
		}
	}
}

// main 靠这个回调赶在窗口创建前给主窗口定原生底色：存储一打开就得通知到，晚于窗口创建就没用了
func TestServiceStartupNotifiesStorageReady(t *testing.T) {
	// 数据目录在 ~/.idblink 下，测试里把 HOME 指到临时目录，不碰真实数据
	t.Setenv("HOME", t.TempDir())

	app := NewApp()
	var ready *Storage
	app.SetStorageReadyCallback(func(st *Storage) { ready = st })

	if err := app.ServiceStartup(context.Background(), application.ServiceOptions{}); err != nil {
		t.Fatalf("ServiceStartup: %v", err)
	}
	if ready == nil {
		t.Fatal("storage ready callback was not called")
	}
	t.Cleanup(func() { _ = ready.Close() })

	// 没存过主题：拿到的是默认值，不是零值
	if got := ready.StartupTheme(); got != defaultStartupTheme {
		t.Fatalf("expected default startup theme, got %+v", got)
	}
	// 回调拿到的就是应用后来用的那个存储：这里能读到前端写进来的值
	if err := app.SaveStartupTheme("#F2F3F8", "#101118", "dark"); err != nil {
		t.Fatalf("save: %v", err)
	}
	if got := ready.StartupTheme(); got.NativeMode != "dark" {
		t.Fatalf("expected dark mode saved through the app's storage, got %+v", got)
	}
}

// 结果弹窗的原生底色跟着主题走：深色用户打开弹窗时，加载期间露出来的不能是浅色
func TestPopupWindowBackgroundFollowsTheme(t *testing.T) {
	st, err := NewStorage(t.TempDir())
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	app := &App{storage: st}

	// 只测显式选择的两种外观：跟随系统的取色取决于跑测试那台机器的系统外观
	for _, c := range []struct {
		mode string
		want application.RGBA
	}{
		{"dark", application.NewRGB(0x10, 0x11, 0x18)},
		{"light", application.NewRGB(0xF2, 0xF3, 0xF8)},
	} {
		if err := app.SaveStartupTheme("#F2F3F8", "#101118", c.mode); err != nil {
			t.Fatalf("save %s: %v", c.mode, err)
		}
		if got := app.popupWindowBackground(); got != c.want {
			t.Errorf("%s: expected %v, got %v", c.mode, c.want, got)
		}
	}
}
