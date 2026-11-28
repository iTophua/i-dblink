package backend

import (
	"encoding/json"
	"os"
	"runtime"
	"strings"
)

// MCPConfigInfo MCP 配置信息（返回给前端展示）
type MCPConfigInfo struct {
	ExecutablePath string `json:"executablePath"` // iDBLink 可执行文件路径
	Platform       string `json:"platform"`       // darwin / windows / linux
	IsDev          bool   `json:"isDev"`          // 是否开发模式
	ConfigJSON     string `json:"configJSON"`     // 预生成的 Claude Desktop 配置 JSON
	ConfigPath     string `json:"configPath"`     // 各平台 Claude Desktop 配置文件路径
	Tools          string `json:"tools"`          // 可用 tool 列表（描述）
}

// GetMCPConfig 获取 MCP Server 配置信息（供设置页展示和复制）
func (a *App) GetMCPConfig() (MCPConfigInfo, error) {
	exePath, _ := os.Executable()

	// 开发模式下 os.Executable() 指向 wails dev 编译的临时可执行文件，提示用户路径会变
	isDev := a.isDevMode()
	displayPath := exePath

	// 生成预填好的 Claude Desktop 配置
	config := map[string]any{
		"mcpServers": map[string]any{
			"idblink": map[string]any{
				"command": displayPath,
				"args":    []string{"--mcp", "--stdio"},
			},
		},
	}
	configBytes, _ := json.MarshalIndent(config, "", "  ")
	configJSON := string(configBytes)

	// 各平台 Claude Desktop 配置文件路径
	var configFilePath string
	switch runtime.GOOS {
	case "darwin":
		home, _ := os.UserHomeDir()
		configFilePath = home + "/Library/Application Support/Claude/claude_desktop_config.json"
	case "windows":
		configFilePath = `%APPDATA%\Claude\claude_desktop_config.json`
	default:
		home, _ := os.UserHomeDir()
		configFilePath = home + "/.config/claude/claude_desktop_config.json"
	}

	// 工具清单跟着注册走（main 注入 mcpserver.ToolNames）。此前是在这里手抄一份，
	// 加了 list_processes / kill_process 之后清单没跟上，设置页少显示两个工具
	var tools string
	if a.mcpToolNames != nil {
		tools = strings.Join(a.mcpToolNames(), ", ")
	}

	return MCPConfigInfo{
		ExecutablePath: displayPath,
		Platform:       runtime.GOOS,
		IsDev:          isDev,
		ConfigJSON:     configJSON,
		ConfigPath:     configFilePath,
		Tools:          tools,
	}, nil
}
