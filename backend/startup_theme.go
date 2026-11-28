package backend

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strconv"
)

// StartupTheme 上次应用的主题里，原生窗口在启动早期要用到的那部分。
//
// 主窗口一创建、前端还没画出第一帧时，露出来的是原生底色（webview 是透明的）。深色用户不想
// 先闪一下浅色，就得在窗口创建前知道主题；而主题设置存在 webview 的 localStorage 里，Go 这边
// 读不到——由前端每次应用主题时把结果写过来（SaveStartupTheme），下次启动在存储打开后取用
// （main.go 的 SetStorageReadyCallback）。
type StartupTheme struct {
	LightBackground string `json:"light_background"` // 浅色下的窗口底色，#RRGGBB
	DarkBackground  string `json:"dark_background"`  // 深色下的窗口底色
	NativeMode      string `json:"native_mode"`      // light / dark / system
}

// startupThemeKey app_config 里存它的键
const startupThemeKey = "startup_theme"

// defaultStartupTheme 没存过时（刚安装、或升级到带这个机制的版本之后第一次启动）的取值：
// 跟随系统，底色取默认预设两种外观下的窗口底色（和 theme.ts 的 default 预设一致）
var defaultStartupTheme = StartupTheme{
	LightBackground: "#F2F3F8",
	DarkBackground:  "#101118",
	NativeMode:      "system",
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func validNativeMode(mode string) bool {
	return mode == "light" || mode == "dark" || mode == "system"
}

func (t StartupTheme) valid() bool {
	return hexColor.MatchString(t.LightBackground) &&
		hexColor.MatchString(t.DarkBackground) &&
		validNativeMode(t.NativeMode)
}

// SaveStartupTheme 记录当前主题，下次启动时给原生窗口定底色和外观（见 StartupTheme）。
func (a *App) SaveStartupTheme(lightBackground, darkBackground, nativeMode string) error {
	theme := StartupTheme{
		LightBackground: lightBackground,
		DarkBackground:  darkBackground,
		NativeMode:      nativeMode,
	}
	if !theme.valid() {
		return errors.New("invalid startup theme: backgrounds must be #RRGGBB, mode one of light/dark/system")
	}
	raw, err := json.Marshal(theme)
	if err != nil {
		return fmt.Errorf("failed to encode startup theme: %w", err)
	}
	if err := a.storage.SetAppConfig(startupThemeKey, string(raw)); err != nil {
		return fmt.Errorf("failed to save startup theme: %w", err)
	}
	return nil
}

// StartupTheme 读上次存的主题。没存过、读不出来、内容不合法都退回默认值——启动早期的事，
// 一个缓存值不能挡住启动
func (s *Storage) StartupTheme() StartupTheme {
	raw, found, err := s.GetAppConfig(startupThemeKey)
	if err != nil {
		slog.Warn("Failed to read startup theme", "error", err)
		return defaultStartupTheme
	}
	if !found {
		return defaultStartupTheme
	}
	var theme StartupTheme
	if err := json.Unmarshal([]byte(raw), &theme); err != nil || !theme.valid() {
		return defaultStartupTheme
	}
	return theme
}

// BackgroundColor 按外观取窗口底色。存的是两种外观下的底色，不是上次实际用的那一个：
// system 模式下系统在两次启动之间切换了深浅，这里仍然取得对
func (t StartupTheme) BackgroundColor(systemDark bool) (r, g, b uint8, ok bool) {
	hex := t.LightBackground
	if t.NativeMode == "dark" || (t.NativeMode == "system" && systemDark) {
		hex = t.DarkBackground
	}
	if !hexColor.MatchString(hex) {
		return 0, 0, 0, false
	}
	v, err := strconv.ParseUint(hex[1:], 16, 32)
	if err != nil {
		return 0, 0, 0, false
	}
	return uint8(v >> 16), uint8(v >> 8), uint8(v), true
}
