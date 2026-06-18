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
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"idblink/backend/api"
	"idblink/backend/db"
	"idblink/backend/localdb"
	"idblink/backend/models"
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

// ==================== 连接管理 ====================

// TestConnection 测试数据库连接
func (a *App) TestConnection(input ConnectionInput) error {
	connectArgs := db.ConnectArgs{
		DbType:   input.DbType,
		Host:     input.Host,
		Port:     input.Port,
		Username: input.Username,
		Password: "",
		Database: "",
		SSL: db.SSLArgs{
			Enabled:    input.SSLEnabled,
			CAPath:     strVal(input.SSLCAPath),
			CertPath:   strVal(input.SSLCertPath),
			KeyPath:    strVal(input.SSLKeyPath),
			SkipVerify: input.SSLSkipVerify,
		},
	}

	if input.Password != nil {
		connectArgs.Password = *input.Password
	}
	if input.Database != nil {
		connectArgs.Database = *input.Database
	}

	// SSH 隧道
	if input.SSHEnabled && input.SSHHost != nil && *input.SSHHost != "" {
		sshPort := 22
		if input.SSHPort != nil {
			sshPort = *input.SSHPort
		}
		tunnel, err := a.tunnel.StartTunnel(
			"test-"+input.Name,
			*input.SSHHost,
			sshPort,
			strVal(input.SSHUsername),
			strVal(input.SSHAuthMethod),
			strVal(input.SSHPassword),
			strVal(input.SSHPrivateKeyPath),
			strVal(input.SSHPassphrase),
			input.Host,
			input.Port,
		)
		if err != nil {
			return fmt.Errorf("SSH tunnel failed: %w", err)
		}
		defer a.tunnel.StopTunnel("test-" + input.Name)
		connectArgs.Host = "127.0.0.1"
		connectArgs.Port = tunnel.LocalPort()
	}

	tmpMgr := db.NewManager()
	defer tmpMgr.Disconnect("test-" + input.Name)

	err := tmpMgr.Connect("test-"+input.Name, connectArgs)
	if err != nil {
		return err
	}
	return nil
}

// ConnectDatabase 连接到数据库（建立并保持连接）
func (a *App) ConnectDatabase(connectionID string) error {
	if a.isActiveConn(connectionID) {
		return nil
	}

	conn, password, err := a.storage.GetConnectionWithPassword(connectionID)
	if err != nil {
		return fmt.Errorf("failed to get connection: %w", err)
	}
	if conn == nil {
		return fmt.Errorf("connection not found")
	}

	connectArgs := db.ConnectArgs{
		DbType:   conn.DbType,
		Host:     conn.Host,
		Port:     conn.Port,
		Username: conn.Username,
		Password: "",
		Database: "",
		SSL: db.SSLArgs{
			Enabled:    conn.SSLEnabled != nil && *conn.SSLEnabled == "true",
			CAPath:     strVal(conn.SSLCAPath),
			CertPath:   strVal(conn.SSLCertPath),
			KeyPath:    strVal(conn.SSLKeyPath),
			SkipVerify: conn.SSLSkipVerify != nil && *conn.SSLSkipVerify == "true",
		},
	}

	if password != nil {
		connectArgs.Password = *password
	}
	if conn.Database != nil {
		connectArgs.Database = *conn.Database
	}

	// SSH 隧道
	sshTunnelStarted := false
	if conn.SSHHost != nil && *conn.SSHHost != "" {
		sshPort := 22
		if conn.SSHPort != nil {
			if p, err := strconv.Atoi(*conn.SSHPort); err == nil {
				sshPort = p
			}
		}
		// SSH 凭据：从 connection_ssh_credentials 表获取（与 DB 密码分开加密存储）
		sshPassword, sshPassphrase, _ := a.storage.GetSSHCredentials(connectionID)
		tunnel, err := a.tunnel.StartTunnel(
			connectionID,
			*conn.SSHHost,
			sshPort,
			strVal(conn.SSHUsername),
			strVal(conn.SSHAuthMethod),
			sshPassword,
			strVal(conn.SSHPrivateKeyPath),
			sshPassphrase,
			conn.Host,
			conn.Port,
		)
		if err != nil {
			return fmt.Errorf("SSH tunnel failed: %w", err)
		}
		sshTunnelStarted = true
		connectArgs.Host = "127.0.0.1"
		connectArgs.Port = tunnel.LocalPort()
	}

	err = a.dbManager.Connect(connectionID, connectArgs)
	if err != nil {
		// DB 连接失败后清理已建立的 SSH 隧道，避免泄漏
		if sshTunnelStarted {
			_ = a.tunnel.StopTunnel(connectionID)
		}
		// 检测密码错误
		errStr := err.Error()
		if strings.Contains(strings.ToLower(errStr), "password") ||
			strings.Contains(strings.ToLower(errStr), "auth") ||
			strings.Contains(errStr, "1045") ||
			strings.Contains(errStr, "28000") {
			return fmt.Errorf("PASSWORD_REQUIRED")
		}
		return err
	}

	a.setActiveConn(connectionID, true)
	_ = a.storage.RecordHistory(connectionID, "connect", true, "")
	return nil
}

// DisconnectDatabase 断开数据库连接
func (a *App) DisconnectDatabase(connectionID string) error {
	_ = a.tunnel.StopTunnel(connectionID)
	err := a.dbManager.Disconnect(connectionID)
	a.setActiveConn(connectionID, false)
	_ = a.storage.RecordHistory(connectionID, "disconnect", err == nil, "")
	if err != nil {
		return fmt.Errorf("connection %s not found or already disconnected", connectionID)
	}
	return nil
}

// GetConnections 获取所有连接
func (a *App) GetConnections() ([]ConnectionOutput, error) {
	conns, err := a.storage.GetConnections()
	if err != nil {
		return nil, fmt.Errorf("failed to get connections: %w", err)
	}

	result := make([]ConnectionOutput, len(conns))
	for i, conn := range conns {
		result[i] = ConnectionOutput{
			ID:         conn.ID,
			Name:       conn.Name,
			DbType:     conn.DbType,
			Host:       conn.Host,
			Port:       conn.Port,
			Username:   conn.Username,
			Database:   conn.Database,
			GroupID:    conn.GroupID,
			Color:      conn.Color,
			Status:     "disconnected",
			SSHEnabled: conn.SSHHost != nil,
			SSLEnabled: conn.SSLEnabled != nil && *conn.SSLEnabled == "true",
		}
		if a.isActiveConn(conn.ID) {
			result[i].Status = "connected"
		}
	}
	return result, nil
}

// SaveConnection 保存连接
func (a *App) SaveConnection(input ConnectionInput) (ConnectionOutput, error) {
	conn := &localdb.DbConnection{
		Name:     input.Name,
		DbType:   input.DbType,
		Host:     input.Host,
		Port:     input.Port,
		Username: input.Username,
		Database: input.Database,
		GroupID:  input.GroupID,
		Color:    input.Color,
	}

	if input.SSHEnabled {
		conn.SSHHost = input.SSHHost
		if input.SSHPort != nil {
			p := fmt.Sprintf("%d", *input.SSHPort)
			conn.SSHPort = &p
		}
		conn.SSHUsername = input.SSHUsername
		conn.SSHAuthMethod = input.SSHAuthMethod
		conn.SSHPrivateKeyPath = input.SSHPrivateKeyPath
	}

	sslEnabled := fmt.Sprintf("%t", input.SSLEnabled)
	conn.SSLEnabled = &sslEnabled
	conn.SSLCAPath = input.SSLCAPath
	conn.SSLCertPath = input.SSLCertPath
	conn.SSLKeyPath = input.SSLKeyPath
	sslSkipVerify := fmt.Sprintf("%t", input.SSLSkipVerify)
	conn.SSLSkipVerify = &sslSkipVerify

	var output ConnectionOutput
	if input.ID != "" {
		conn.ID = input.ID
		err := a.storage.UpdateConnection(input.ID, conn, input.Password)
		if err != nil {
			return output, fmt.Errorf("failed to update connection: %w", err)
		}
	} else {
		err := a.storage.SaveConnection(conn, input.Password)
		if err != nil {
			return output, fmt.Errorf("failed to save connection: %w", err)
		}
	}

	// 持久化 SSH 凭据（与 DB 密码分开加密存储）
	if input.SSHEnabled {
		sshPass := ""
		sshPhrase := ""
		if input.SSHPassword != nil {
			sshPass = *input.SSHPassword
		}
		if input.SSHPassphrase != nil {
			sshPhrase = *input.SSHPassphrase
		}
		if err := a.storage.SaveSSHCredentials(conn.ID, sshPass, sshPhrase); err != nil {
			return output, fmt.Errorf("failed to save ssh credentials: %w", err)
		}
	}

	output = ConnectionOutput{
		ID:         conn.ID,
		Name:       conn.Name,
		DbType:     conn.DbType,
		Host:       conn.Host,
		Port:       conn.Port,
		Username:   conn.Username,
		Database:   conn.Database,
		GroupID:    conn.GroupID,
		Color:      conn.Color,
		Status:     "disconnected",
		SSHEnabled: conn.SSHHost != nil,
		SSLEnabled: conn.SSLEnabled != nil && *conn.SSLEnabled == "true",
	}
	return output, nil
}

// DeleteConnection 删除连接
func (a *App) DeleteConnection(id string) error {
	return a.storage.DeleteConnection(id)
}

// BatchDeleteConnections 批量删除连接
func (a *App) BatchDeleteConnections(ids []string) error {
	for _, id := range ids {
		if err := a.storage.DeleteConnection(id); err != nil {
			return fmt.Errorf("failed to delete connection %s: %w", id, err)
		}
	}
	return nil
}

// ReorderConnections 重新排列连接顺序
func (a *App) ReorderConnections(orders map[string]int) error {
	return a.storage.UpdateSortOrders(orders)
}

// UpdateConnectionPassword 更新连接密码
func (a *App) UpdateConnectionPassword(connectionID string, password string) error {
	return a.storage.UpdateConnectionPassword(connectionID, password)
}

// GetGroups 获取所有分组
func (a *App) GetGroups() ([]GroupOutput, error) {
	groups, err := a.storage.GetGroups()
	if err != nil {
		return nil, fmt.Errorf("failed to get groups: %w", err)
	}

	result := make([]GroupOutput, len(groups))
	for i, g := range groups {
		result[i] = GroupOutput{
			ID:       g.ID,
			Name:     g.Name,
			Icon:     g.Icon,
			Color:    g.Color,
			ParentID: g.ParentID,
		}
	}
	return result, nil
}

// SaveGroup 保存分组
func (a *App) SaveGroup(input GroupInput) (GroupOutput, error) {
	group := &localdb.ConnectionGroup{
		ID:       input.ID,
		Name:     input.Name,
		Icon:     input.Icon,
		Color:    input.Color,
		ParentID: input.ParentID,
	}

	if group.ID == "" {
		group.ID = uuid.New().String()
	}

	err := a.storage.SaveGroup(group)
	if err != nil {
		return GroupOutput{}, fmt.Errorf("failed to save group: %w", err)
	}

	return GroupOutput{
		ID:       group.ID,
		Name:     group.Name,
		Icon:     group.Icon,
		Color:    group.Color,
		ParentID: group.ParentID,
	}, nil
}

// DeleteGroup 删除分组
func (a *App) DeleteGroup(id string) error {
	if id == "default" {
		return fmt.Errorf("cannot delete default group")
	}
	return a.storage.DeleteGroup(id)
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

// ensureConnected 确保指定连接已建立
func (a *App) ensureConnected(connectionID string) error {
	if a.isActiveConn(connectionID) {
		return nil
	}
	return a.ConnectDatabase(connectionID)
}

// ==================== 数据库元数据 ====================

// GetDatabases 获取数据库列表
func (a *App) GetDatabases(connectionID string) ([]string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID}
	respBytes, err := callHandler(a.handler.GetDatabases, req)
	if err != nil {
		return nil, err
	}

	var result []string
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTables 获取表列表
func (a *App) GetTables(connectionID string, database *string) ([]models.TableInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandler(a.handler.GetTables, req)
	if err != nil {
		return nil, err
	}

	var result []models.TableInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTablesCategorized 获取分类的表和视图
func (a *App) GetTablesCategorized(connectionID string, database *string, search *string) (models.TablesResult, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.TablesResult{}, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, Search: search}
	respBytes, err := callHandler(a.handler.GetTablesCategorized, req)
	if err != nil {
		return models.TablesResult{}, err
	}

	var result models.TablesResult
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.TablesResult{}, err
	}
	return result, nil
}

// GetTableStructure 获取完整的表结构
func (a *App) GetTableStructure(connectionID string, tableName string, database *string) (models.TableStructure, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.TableStructure{}, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, TableName: &tableName}
	respBytes, err := callHandler(a.handler.GetTableStructure, req)
	if err != nil {
		return models.TableStructure{}, err
	}

	var result models.TableStructure
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.TableStructure{}, err
	}
	return result, nil
}

// GetColumns 获取列信息
func (a *App) GetColumns(connectionID string, tableName string, database *string) ([]models.ColumnInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, TableName: &tableName}
	respBytes, err := callHandlerRaw(a.handler.GetColumns, req)
	if err != nil {
		return nil, err
	}

	// 检查错误：向上传递，而非吞成空数组（否则前端误以为无数据）
	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return nil, fmt.Errorf("%s", errResp.Error)
	}

	var result []models.ColumnInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse columns response: %w", err)
	}
	return result, nil
}

// GetAllColumns 批量获取所有表的列信息
func (a *App) GetAllColumns(connectionID string, database *string) (models.AllColumnsResult, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandlerRaw(a.handler.GetAllColumns, req)
	if err != nil {
		return models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}, fmt.Errorf("%s", errResp.Error)
	}

	var result models.AllColumnsResult
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}, fmt.Errorf("failed to parse all columns response: %w", err)
	}
	if result.Tables == nil {
		result.Tables = make(map[string][]models.ColumnInfo)
	}
	return result, nil
}

// GetIndexes 获取索引信息
func (a *App) GetIndexes(connectionID string, tableName string, database *string) ([]models.IndexInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, TableName: &tableName}
	respBytes, err := callHandlerRaw(a.handler.GetIndexes, req)
	if err != nil {
		return nil, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return nil, fmt.Errorf("%s", errResp.Error)
	}

	var result []models.IndexInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse indexes response: %w", err)
	}
	return result, nil
}

// GetForeignKeys 获取外键信息
func (a *App) GetForeignKeys(connectionID string, tableName string, database *string) ([]models.ForeignKeyInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, TableName: &tableName}
	respBytes, err := callHandlerRaw(a.handler.GetForeignKeys, req)
	if err != nil {
		return nil, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return nil, fmt.Errorf("%s", errResp.Error)
	}

	var result []models.ForeignKeyInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse foreign keys response: %w", err)
	}
	return result, nil
}

// GetProcedures 获取存储过程列表
func (a *App) GetProcedures(connectionID string, database *string) ([]string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandler(a.handler.GetProcedures, req)
	if err != nil {
		return nil, err
	}

	var result []string
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetFunctions 获取函数列表
func (a *App) GetFunctions(connectionID string, database *string) ([]string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandler(a.handler.GetFunctions, req)
	if err != nil {
		return nil, err
	}

	var result []string
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetProcedureBody 获取存储过程定义
func (a *App) GetProcedureBody(connectionID string, procedureName string, database *string) (string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return "", err
	}

	req := struct {
		ConnectionID  string `json:"connection_id"`
		ProcedureName string `json:"procedure_name"`
		Database      string `json:"database,omitempty"`
	}{
		ConnectionID:  connectionID,
		ProcedureName: procedureName,
		Database:      strVal(database),
	}
	respBytes, err := callHandler(a.handler.GetProcedureBody, req)
	if err != nil {
		return "", err
	}

	var result struct {
		Body string `json:"body"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}
	return result.Body, nil
}

// GetFunctionBody 获取函数定义
func (a *App) GetFunctionBody(connectionID string, functionName string, database *string) (string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return "", err
	}

	req := struct {
		ConnectionID string `json:"connection_id"`
		FunctionName string `json:"function_name"`
		Database     string `json:"database,omitempty"`
	}{
		ConnectionID: connectionID,
		FunctionName: functionName,
		Database:     strVal(database),
	}
	respBytes, err := callHandler(a.handler.GetFunctionBody, req)
	if err != nil {
		return "", err
	}

	var result struct {
		Body string `json:"body"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}
	return result.Body, nil
}

// GetRoutines 获取存储过程和函数列表
func (a *App) GetRoutines(connectionID string, database *string) (models.RoutinesResult, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.RoutinesResult{}, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandler(a.handler.GetRoutines, req)
	if err != nil {
		return models.RoutinesResult{}, err
	}

	var result models.RoutinesResult
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.RoutinesResult{}, err
	}
	return result, nil
}

// ==================== 查询与 DDL ====================

// ExecuteQuery 执行 SQL 查询
func (a *App) ExecuteQuery(connectionID string, sql string, database *string) (models.QueryResult, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.QueryResult{}, err
	}

	req := models.QueryRequest{
		ConnectionID: connectionID,
		SQL:          sql,
		Database:     "",
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.Query, req)
	if err != nil {
		return models.QueryResult{}, err
	}

	var result models.QueryResult
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.QueryResult{}, err
	}
	errMsg := ""
	if result.Error != "" {
		errMsg = result.Error
	}
	_ = a.storage.RecordHistory(connectionID, "query", result.Error == "", errMsg)
	return result, nil
}

// ExecuteDDL 执行 DDL 语句
func (a *App) ExecuteDDL(connectionID string, sql string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.ExecuteDDLRequest{
		ConnectionID: connectionID,
		SQL:          sql,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.ExecuteDDL, req)
	return err
}

// TruncateTable 清空表
func (a *App) TruncateTable(connectionID string, tableName string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.TableOperationRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.TruncateTable, req)
	return err
}

// DropTable 删除表
func (a *App) DropTable(connectionID string, tableName string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.TableOperationRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.DropTable, req)
	return err
}

// DropView 删除视图
func (a *App) DropView(connectionID string, viewName string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.TableOperationRequest{
		ConnectionID: connectionID,
		ViewName:     viewName,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.DropView, req)
	return err
}

// RenameTable 重命名表
func (a *App) RenameTable(connectionID string, oldName string, newName string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.RenameTableRequest{
		ConnectionID: connectionID,
		OldName:      oldName,
		NewName:      newName,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.RenameTable, req)
	return err
}

// MaintainTable 表维护操作
func (a *App) MaintainTable(connectionID string, tableName string, operation string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.TableMaintenanceRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
		Operation:    operation,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.MaintainTable, req)
	return err
}

// ==================== 事务控制 ====================

// BeginTransaction 开启事务
func (a *App) BeginTransaction(connectionID string) error {
	req := api.TransactionRequest{ConnectionID: connectionID}
	_, err := callHandler(a.handler.BeginTransaction, req)
	return err
}

// CommitTransaction 提交事务
func (a *App) CommitTransaction(connectionID string) error {
	req := api.TransactionRequest{ConnectionID: connectionID}
	_, err := callHandler(a.handler.CommitTransaction, req)
	return err
}

// RollbackTransaction 回滚事务
func (a *App) RollbackTransaction(connectionID string) error {
	req := api.TransactionRequest{ConnectionID: connectionID}
	_, err := callHandler(a.handler.RollbackTransaction, req)
	return err
}

// GetTransactionStatus 获取事务状态
func (a *App) GetTransactionStatus(connectionID string) (bool, error) {
	req := api.TransactionRequest{ConnectionID: connectionID}
	respBytes, err := callHandler(a.handler.GetTransactionStatus, req)
	if err != nil {
		return false, err
	}

	var result struct {
		Active bool `json:"active"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return false, err
	}
	return result.Active, nil
}

// ==================== 服务器信息与元数据 ====================

// GetServerInfo 获取数据库服务器信息
func (a *App) GetServerInfo(connectionID string, database *string) (ServerInfo, error) {
	req := api.ServerInfoRequest{
		ConnectionID: connectionID,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetServerInfo, req)
	if err != nil {
		return ServerInfo{}, err
	}

	var result ServerInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return ServerInfo{}, err
	}
	return result, nil
}

// GetTableDDL 获取建表语句
func (a *App) GetTableDDL(connectionID string, tableName string, database *string) ([]string, error) {
	req := api.GetTableDDLRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetTableDDL, req)
	if err != nil {
		return nil, err
	}

	var result struct {
		DDLs []string `json:"ddls"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result.DDLs, nil
}

// GetDatabaseDDL 获取建库语句
func (a *App) GetDatabaseDDL(connectionID string, database string) (string, error) {
	req := api.GetDatabaseDDLRequest{
		ConnectionID: connectionID,
		Database:     database,
	}

	respBytes, err := callHandler(a.handler.GetDatabaseDDL, req)
	if err != nil {
		return "", err
	}

	var result struct {
		DDL string `json:"ddl"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}
	return result.DDL, nil
}

// GetTriggers 获取触发器列表
func (a *App) GetTriggers(connectionID string, database *string) ([]map[string]interface{}, error) {
	req := api.GetTriggersRequest{
		ConnectionID: connectionID,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetTriggers, req)
	if err != nil {
		return nil, err
	}

	var result struct {
		Triggers []map[string]interface{} `json:"triggers"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result.Triggers, nil
}

// GetEvents 获取事件列表
func (a *App) GetEvents(connectionID string, database *string) ([]map[string]interface{}, error) {
	req := api.GetEventsRequest{
		ConnectionID: connectionID,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetEvents, req)
	if err != nil {
		return nil, err
	}

	var result struct {
		Events []map[string]interface{} `json:"events"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result.Events, nil
}

// ==================== 流式导出 ====================

// StreamExportTable 流式导出完整表数据
func (a *App) StreamExportTable(connectionID string, tableName string, database *string, batchSize *int) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := models.StreamExportRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
		BatchSize:    1000,
	}
	if database != nil {
		req.Database = *database
	}
	if batchSize != nil {
		req.BatchSize = *batchSize
	}

	respBytes, err := callHandler(a.handler.StreamExport, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ==================== 备份恢复 ====================

// CheckBackupTool 检测备份工具
func (a *App) CheckBackupTool(dbType string) (map[string]interface{}, error) {
	req := api.BackupToolCheckRequest{DbType: dbType}
	respBytes, err := callHandler(a.handler.CheckBackupTool, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// BackupDatabase 备份数据库
func (a *App) BackupDatabase(connectionID string, database string, tables []string, includeStructure bool, includeData bool, filePath string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.BackupRequest{
		ConnectionID:     connectionID,
		Database:         database,
		Tables:           tables,
		IncludeStructure: includeStructure,
		IncludeData:      includeData,
		FilePath:         filePath,
	}

	respBytes, err := callHandler(a.handler.Backup, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// RestoreDatabase 恢复数据库
func (a *App) RestoreDatabase(connectionID string, database string, filePath string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.RestoreRequest{
		ConnectionID: connectionID,
		Database:     database,
		FilePath:     filePath,
	}

	respBytes, err := callHandler(a.handler.Restore, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ==================== 用户权限管理 ====================

// GetUsers 获取用户列表
func (a *App) GetUsers(connectionID string, database *string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := models.MetadataRequest{ConnectionID: connectionID}
	if database != nil {
		db := *database
		req.Database = &db
	}

	respBytes, err := callHandler(a.handler.GetUsers, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetUserPrivileges 获取用户权限
func (a *App) GetUserPrivileges(connectionID string, username string, host string, database *string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.GetUserPrivilegesRequest{
		ConnectionID: connectionID,
		Username:     username,
		Host:         host,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetPrivileges, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTablePrivileges 获取表级权限
func (a *App) GetTablePrivileges(connectionID string, username string, host string, database *string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.GetUserPrivilegesRequest{
		ConnectionID: connectionID,
		Username:     username,
		Host:         host,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetTablePrivileges, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// CreateUser 创建用户
func (a *App) CreateUser(connectionID string, username string, password string, host string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := api.CreateUserRequest{
		ConnectionID: connectionID,
		Username:     username,
		Password:     password,
		Host:         host,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.CreateUser, req)
	return err
}

// DropUser 删除用户
func (a *App) DropUser(connectionID string, username string, host string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := api.DropUserRequest{
		ConnectionID: connectionID,
		Username:     username,
		Host:         host,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.DropUser, req)
	return err
}

// GrantPrivilege 授予权限
func (a *App) GrantPrivilege(connectionID string, username string, host string, privileges []string, databaseAll bool, database *string, table *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := api.GrantRequest{
		ConnectionID: connectionID,
		Username:     username,
		Host:         host,
		Privileges:   privileges,
		DatabaseAll:  databaseAll,
	}
	if database != nil {
		req.Database = *database
	}
	if table != nil {
		req.Table = *table
	}

	_, err := callHandler(a.handler.GrantPrivilege, req)
	return err
}

// RevokePrivilege 撤销权限
func (a *App) RevokePrivilege(connectionID string, username string, host string, privileges []string, databaseAll bool, database *string, table *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := api.RevokeRequest{
		ConnectionID: connectionID,
		Username:     username,
		Host:         host,
		Privileges:   privileges,
		DatabaseAll:  databaseAll,
	}
	if database != nil {
		req.Database = *database
	}
	if table != nil {
		req.Table = *table
	}

	_, err := callHandler(a.handler.RevokePrivilege, req)
	return err
}

// ==================== 结构比较与批量导入 ====================

// CompareSchema 比较数据库/表结构
func (a *App) CompareSchema(sourceConnectionID string, sourceDatabase string, targetConnectionID string, targetDatabase string, tableName *string) (map[string]interface{}, error) {
	if err := a.ensureConnected(sourceConnectionID); err != nil {
		return nil, err
	}
	if err := a.ensureConnected(targetConnectionID); err != nil {
		return nil, err
	}

	req := api.CompareSchemaRequest{
		SourceConnID: sourceConnectionID,
		SourceDB:     sourceDatabase,
		TargetConnID: targetConnectionID,
		TargetDB:     targetDatabase,
	}
	if tableName != nil {
		req.TableName = *tableName
	}

	respBytes, err := callHandler(a.handler.CompareSchema, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// BatchImport 批量导入数据
func (a *App) BatchImport(connectionID string, database *string, tableName string, mode string, primaryKey *string, rows []map[string]interface{}) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := models.BatchImportRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
		Mode:         mode,
		Rows:         rows,
	}
	if database != nil {
		req.Database = *database
	}
	if primaryKey != nil {
		req.PrimaryKey = *primaryKey
	}

	respBytes, err := callHandler(a.handler.BatchImport, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ==================== 代码片段 ====================

// SaveSnippet 保存代码片段
func (a *App) SaveSnippet(id *string, name string, sqlText string, dbType *string, category *string, tags *string, isPrivate bool) (string, error) {
	snippet := &localdb.Snippet{
		Name:      name,
		SQLText:   sqlText,
		IsPrivate: isPrivate,
	}
	if dbType != nil {
		snippet.DbType = dbType
	}
	if category != nil {
		snippet.Category = category
	}
	if tags != nil {
		snippet.Tags = tags
	}

	if id != nil && *id != "" {
		snippet.ID = *id
		existing, err := a.storage.GetSnippets()
		if err != nil {
			return "", err
		}
		for _, s := range existing {
			if s.ID == *id {
				snippet.CreatedAt = s.CreatedAt
				break
			}
		}
	}

	err := a.storage.SaveSnippet(snippet)
	if err != nil {
		return "", err
	}
	return snippet.ID, nil
}

// GetSnippets 获取所有代码片段
func (a *App) GetSnippets() ([]localdb.Snippet, error) {
	snippets, err := a.storage.GetSnippets()
	if err != nil {
		return nil, err
	}

	result := make([]localdb.Snippet, len(snippets))
	for i, s := range snippets {
		result[i] = *s
	}
	return result, nil
}

// DeleteSnippet 删除代码片段
func (a *App) DeleteSnippet(id string) error {
	return a.storage.DeleteSnippet(id)
}

// ==================== 收藏夹 ====================

// SaveFavorite 保存收藏
func (a *App) SaveFavorite(id string, favType string, name string, connectionID *string, database *string, tableName *string, sqlText *string, tags string) (string, error) {
	fav := &localdb.Favorite{
		Type:         favType,
		Name:         name,
		ConnectionID: connectionID,
		Database:     database,
		TableName:    tableName,
		SqlText:      sqlText,
		Tags:         tags,
	}
	if id != "" {
		fav.ID = id
		existing, err := a.storage.GetFavorites()
		if err != nil {
			return "", err
		}
		for _, f := range existing {
			if f.ID == id {
				fav.CreatedAt = f.CreatedAt
				break
			}
		}
	}

	err := a.storage.SaveFavorite(fav)
	if err != nil {
		return "", err
	}
	return fav.ID, nil
}

// GetFavorites 获取所有收藏
func (a *App) GetFavorites() ([]localdb.Favorite, error) {
	favorites, err := a.storage.GetFavorites()
	if err != nil {
		return nil, err
	}

	result := make([]localdb.Favorite, len(favorites))
	for i, f := range favorites {
		result[i] = *f
	}
	return result, nil
}

// DeleteFavorite 删除收藏
func (a *App) DeleteFavorite(id string) error {
	return a.storage.DeleteFavorite(id)
}

// ==================== 连接导入导出 ====================

// ExportConnections 导出所有连接和分组为JSON（不含密码）
func (a *App) ExportConnections() (string, error) {
	conns, err := a.storage.GetConnections()
	if err != nil {
		return "", fmt.Errorf("failed to get connections: %w", err)
	}

	groups, err := a.storage.GetGroups()
	if err != nil {
		return "", fmt.Errorf("failed to get groups: %w", err)
	}

	return marshalExportData(conns, groups)
}

// ExportConnectionsByID 按连接 ID 导出指定连接
func (a *App) ExportConnectionsByID(ids []string) (string, error) {
	allConns, err := a.storage.GetConnections()
	if err != nil {
		return "", fmt.Errorf("failed to get connections: %w", err)
	}

	idSet := make(map[string]bool, len(ids))
	for _, id := range ids {
		idSet[id] = true
	}

	conns := make([]*localdb.DbConnection, 0, len(ids))
	for _, c := range allConns {
		if idSet[c.ID] {
			conns = append(conns, c)
		}
	}

	groups, err := a.storage.GetGroups()
	if err != nil {
		return "", fmt.Errorf("failed to get groups: %w", err)
	}

	return marshalExportData(conns, groups)
}

func marshalExportData(conns []*localdb.DbConnection, groups []*localdb.ConnectionGroup) (string, error) {
	type ExportData struct {
		Version     string                     `json:"version"`
		ExportedAt  string                     `json:"exported_at"`
		Connections []*localdb.DbConnection    `json:"connections"`
		Groups      []*localdb.ConnectionGroup `json:"groups"`
	}

	data := ExportData{
		Version:     "1.0",
		ExportedAt:  time.Now().UTC().Format(time.RFC3339),
		Connections: conns,
		Groups:      groups,
	}

	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal export data: %w", err)
	}
	return string(jsonBytes), nil
}

// ImportConnections 从JSON导入连接和分组，返回导入的连接数和分组数
func (a *App) ImportConnections(jsonStr string, overwrite bool) (int, int, error) {
	type ImportData struct {
		Version     string                     `json:"version"`
		Connections []*localdb.DbConnection    `json:"connections"`
		Groups      []*localdb.ConnectionGroup `json:"groups"`
	}

	var data ImportData
	if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
		return 0, 0, fmt.Errorf("invalid JSON format: %w", err)
	}

	importedConns := 0
	importedGroups := 0

	for _, group := range data.Groups {
		if err := a.storage.SaveGroup(group); err != nil {
			continue
		}
		importedGroups++
	}

	for _, conn := range data.Connections {
		if !overwrite {
			existing, _, err := a.storage.GetConnectionWithPassword(conn.ID)
			if err == nil && existing != nil {
				continue
			}
		}
		if err := a.storage.SaveConnection(conn, nil); err != nil {
			continue
		}
		importedConns++
	}

	return importedConns, importedGroups, nil
}

// ImportNavicatConnections 从 Navicat NCX 文件导入连接
func (a *App) ImportNavicatConnections(ncxContent string, overwrite bool) (int, error) {
	ncx, err := parseNCX(ncxContent)
	if err != nil {
		return 0, err
	}

	imported := 0
	for _, nc := range ncx.Connections {
		conn, password, err := ncxToDbConnection(nc)
		if err != nil {
			continue
		}

		if !overwrite {
			existing, _, err := a.storage.GetConnectionWithPassword(conn.ID)
			if err == nil && existing != nil {
				continue
			}
		}

		if err := a.storage.SaveConnection(conn, password); err != nil {
			continue
		}
		imported++
	}

	return imported, nil
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
