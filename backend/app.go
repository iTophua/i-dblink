package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	goruntime "runtime"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"idblink/backend/ai"
	"idblink/backend/api"
	"idblink/backend/db"
)

// ConnectionInput 前端传输的连接对象（包含密码字段）
type ConnectionInput struct {
	ID                string  `json:"id,omitempty"`
	Name              string  `json:"name"`
	DbType            string  `json:"db_type"`
	Host              string  `json:"host"`
	Port              int     `json:"port"`
	Username          string  `json:"username"`
	Password          *string `json:"password,omitempty"`
	Database          *string `json:"database,omitempty"`
	GroupID           *string `json:"group_id,omitempty"`
	Color             *string `json:"color,omitempty"`
	SSHEnabled        bool    `json:"ssh_enabled"`
	SSHHost           *string `json:"ssh_host,omitempty"`
	SSHPort           *int    `json:"ssh_port,omitempty"`
	SSHUsername       *string `json:"ssh_username,omitempty"`
	SSHAuthMethod     *string `json:"ssh_auth_method,omitempty"`
	SSHPassword       *string `json:"ssh_password,omitempty"`
	SSHPrivateKeyPath *string `json:"ssh_private_key_path,omitempty"`
	SSHPassphrase     *string `json:"ssh_passphrase,omitempty"`
	SSLEnabled        bool    `json:"ssl_enabled"`
	SSLCAPath         *string `json:"ssl_ca_path,omitempty"`
	SSLCertPath       *string `json:"ssl_cert_path,omitempty"`
	SSLKeyPath        *string `json:"ssl_key_path,omitempty"`
	SSLSkipVerify     bool    `json:"ssl_skip_verify"`
}

// ConnectionOutput 返回给前端的连接对象（不包含密码）
type ConnectionOutput struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	DbType     string  `json:"db_type"`
	Host       string  `json:"host"`
	Port       int     `json:"port"`
	Username   string  `json:"username"`
	Database   *string `json:"database,omitempty"`
	GroupID    *string `json:"group_id,omitempty"`
	Color      *string `json:"color,omitempty"`
	Status     string  `json:"status"`
	SSHEnabled bool    `json:"ssh_enabled"`
	SSLEnabled bool    `json:"ssl_enabled"`
}

// GroupInput 分组输入
type GroupInput struct {
	ID       string  `json:"id,omitempty"`
	Name     string  `json:"name"`
	Icon     string  `json:"icon"`
	Color    string  `json:"color"`
	ParentID *string `json:"parent_id,omitempty"`
}

// GroupOutput 分组输出
type GroupOutput struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Icon     string  `json:"icon"`
	Color    string  `json:"color"`
	ParentID *string `json:"parent_id,omitempty"`
}

// ServerInfo 服务器信息响应
type ServerInfo struct {
	Version        string `json:"version,omitempty"`
	ServerType     string `json:"server_type,omitempty"`
	CharacterSet   string `json:"character_set,omitempty"`
	Collation      string `json:"collation,omitempty"`
	Uptime         string `json:"uptime,omitempty"`
	MaxConnections *int   `json:"max_connections,omitempty"`
	Error          string `json:"error,omitempty"`
}

// App Wails 应用结构
type App struct {
	ctx       context.Context
	storage   *Storage
	dbManager *db.Manager
	tunnel    *api.TunnelManager
	handler   *api.Handler
	aiManager *ai.ProviderManager
	activeConns map[string]bool
	connMu    sync.RWMutex // 保护 activeConns 的并发访问
}

// NewApp 创建新应用
func NewApp() *App {
	return &App{
		activeConns: make(map[string]bool),
	}
}

// isActiveConn / setActiveConn / clearActiveConn 封装对 activeConns 的并发安全访问
func (a *App) isActiveConn(connID string) bool {
	a.connMu.RLock()
	defer a.connMu.RUnlock()
	return a.activeConns[connID]
}

func (a *App) setActiveConn(connID string, active bool) {
	a.connMu.Lock()
	if active {
		a.activeConns[connID] = true
	} else {
		delete(a.activeConns, connID)
	}
	a.connMu.Unlock()
}

func (a *App) snapshotActiveConns() []string {
	a.connMu.RLock()
	defer a.connMu.RUnlock()
	ids := make([]string, 0, len(a.activeConns))
	for id := range a.activeConns {
		ids = append(ids, id)
	}
	return ids
}

// Startup 应用启动时调用（Wails 生命周期）
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx

	// 初始化存储
	dataDir := a.getDataDir()
	storage, err := NewStorage(dataDir)
	if err != nil {
		runtime.LogErrorf(ctx, "Failed to initialize storage: %v", err)
		return
	}
	a.storage = storage

	// 初始化数据库管理器
	a.dbManager = db.NewManager()

	// 初始化 SSH 隧道管理器
	a.tunnel = api.NewTunnelManager()

	// 初始化 API handler
	a.handler = api.NewHandler(a.dbManager, a.tunnel)

	// 初始化 AI Provider 管理器（从存储加载配置，若已配置则创建 Provider）
	a.aiManager = ai.NewProviderManager()
	if err := a.aiManager.ReloadFromConfig(a.storage); err != nil {
		runtime.LogWarningf(ctx, "Failed to init AI manager: %v", err)
	}
}

// InitStandalone 在无 Wails 环境下初始化（供 MCP sidecar 等 CLI 场景使用）。
// 与 Startup 逻辑一致，但不依赖 Wails ctx——用 context.Background() 代替。
func (a *App) InitStandalone() error {
	a.ctx = context.Background()

	dataDir := a.getDataDir()
	storage, err := NewStorage(dataDir)
	if err != nil {
		return fmt.Errorf("failed to init storage: %w", err)
	}
	a.storage = storage

	a.dbManager = db.NewManager()
	a.tunnel = api.NewTunnelManager()
	a.handler = api.NewHandler(a.dbManager, a.tunnel)

	a.aiManager = ai.NewProviderManager()
	if err := a.aiManager.ReloadFromConfig(a.storage); err != nil {
		// AI 初始化失败不影响 MCP 核心，仅记录
		fmt.Fprintf(os.Stderr, "[mcp] AI manager init warning: %v\n", err)
	}
	return nil
}

// Context 返回 Wails 上下文（供菜单和事件使用）
func (a *App) Context() context.Context {
	return a.ctx
}

// Shutdown 应用关闭时调用
func (a *App) Shutdown(ctx context.Context) {
	// 关闭所有 SSH 隧道（避免 goroutine / sshClient 泄漏）
	if a.tunnel != nil {
		a.tunnel.CloseAll()
	}
	if a.dbManager != nil {
		for _, connID := range a.snapshotActiveConns() {
			_ = a.dbManager.Disconnect(connID)
		}
	}
	if a.storage != nil {
		a.storage.Close()
	}
}

// ShowDevTools 打开开发者工具（仅在 dev 模式下有效）
func (a *App) ShowDevTools() {
	if a.ctx == nil {
		return
	}
	if a.isDevMode() {
		runtime.WindowExecJS(a.ctx, `window.WailsInvoke("wails:openInspector")`)
	} else {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.InfoDialog,
			Title:   "开发者工具",
			Message: "开发者工具仅在开发模式下可用。请使用 wails dev 启动应用。",
		})
	}
}

// isDevMode 检查是否为开发模式
func isDevMode() bool {
	if os.Getenv("WAILS_DEV") == "1" {
		return true
	}

	// wails dev 编译的可执行文件通常位于 build/bin/ 下
	exe, err := os.Executable()
	if err == nil && strings.Contains(exe, "build/bin") {
		return true
	}

	return false
}

func (a *App) isDevMode() bool { return isDevMode() }

// getDataDir 获取数据目录
func (a *App) getDataDir() string {
	// 统一使用用户主目录下的固定位置，避免工作目录变化导致数据丢失
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}

	if a.isDevMode() {
		// 开发模式使用独立子目录，避免覆盖生产数据
		return filepath.Join(home, ".idblink", "dev-data")
	}

	// 生产模式使用系统应用数据目录
	return filepath.Join(home, ".idblink", "data")
}

// Greet 测试方法
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello, %s! Welcome to iDBLink!", name)
}

// ==================== 辅助函数 ====================

func strVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// callHandler 通过 httptest 调用 api.Handler 方法
func callHandler(handlerFunc func(http.ResponseWriter, *http.Request), reqBody interface{}) ([]byte, error) {
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request failed: %w", err)
	}

	if isDevMode() {
		name := trimHandlerName(goruntime.FuncForPC(reflect.ValueOf(handlerFunc).Pointer()).Name())
		bodyStr := string(body)
		if len(bodyStr) > 500 {
			bodyStr = bodyStr[:500] + "..."
		}
		fmt.Printf("[API] %s → %s\n", name, bodyStr)
	}

	req := httptest.NewRequest("POST", "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	handlerFunc(rr, req)

	respBody := rr.Body.Bytes()

	if isDevMode() {
		name := trimHandlerName(goruntime.FuncForPC(reflect.ValueOf(handlerFunc).Pointer()).Name())
		respStr := string(respBody)
		if len(respStr) > 500 {
			respStr = respStr[:500] + "..."
		}
		fmt.Printf("[API] %s ← %s\n", name, respStr)
	}

	// 检查响应中是否包含 error 字段
	var genericResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBody, &genericResp); err == nil && genericResp.Error != "" {
		return nil, fmt.Errorf("%s", genericResp.Error)
	}

	return respBody, nil
}

func trimHandlerName(name string) string {
	if idx := strings.LastIndex(name, "."); idx >= 0 {
		name = name[idx+1:]
	}
	return strings.TrimSuffix(name, "-fm")
}

// callHandlerRaw 调用 handler 并返回原始响应（不检查 error 字段）
func callHandlerRaw(handlerFunc func(http.ResponseWriter, *http.Request), reqBody interface{}) ([]byte, error) {
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request failed: %w", err)
	}

	req := httptest.NewRequest("POST", "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	handlerFunc(rr, req)

	return rr.Body.Bytes(), nil
}

// ==================== 应用控制 ====================

// QuitApp 退出应用
func (a *App) QuitApp() {
	runtime.Quit(a.ctx)
}

// GetConnectionHistory 获取操作历史
func (a *App) GetConnectionHistory(limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 100
	}
	return a.storage.GetRecentHistory(limit)
}

// ClearConnectionHistory 清空操作历史
func (a *App) ClearConnectionHistory() error {
	return a.storage.ClearHistory()
}
