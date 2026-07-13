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

	// 开发模式下用 wails dev 编译的临时可执行文件路径
	isDev := a.isDevMode()

	// macOS 生产模式，路径标准化为 .app 内的可执行文件
	displayPath := exePath
	if runtime.GOOS == "darwin" && !isDev {
		// os.Executable() 可能返回 .app/Contents/MacOS/iDBLink，已经是正确路径
		displayPath = exePath
	}

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

	tools := strings.Join([]string{
		"list_connections", "create_connection", "update_connection",
		"delete_connection", "test_connection",
		"list_databases", "list_tables", "describe_table", "get_table_ddl",
		"execute_query", "execute_update",
	}, ", ")

	return MCPConfigInfo{
		ExecutablePath: displayPath,
		Platform:       runtime.GOOS,
		IsDev:          isDev,
		ConfigJSON:     configJSON,
		ConfigPath:     configFilePath,
		Tools:          tools,
	}, nil
}
