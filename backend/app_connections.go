package backend

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"idblink/backend/db"
	"idblink/backend/localdb"
)

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

// ConnectDatabase 连接到数据库（建立并保持连接）。
// 单飞（single-flight）：树展开/双击、查询 Tab 自动连接等可能并发触发同一连接，
// 后续调用等待首次尝试的结果复用，避免撞上 Manager.Connect 的 already exists 报错
// （此前表现为：第一次连接报错，重试立刻成功）。
func (a *App) ConnectDatabase(connectionID string) error {
	// 已持写锁，直接读 map（isActiveConn 会再抢 RLock，形成自死锁）
	a.connMu.Lock()
	if a.activeConns[connectionID] {
		a.connMu.Unlock()
		return nil
	}
	if flight, ok := a.connectFlights[connectionID]; ok {
		a.connMu.Unlock()
		<-flight.done
		// 首次尝试已把连接置为活跃则视为成功；否则返回首次的错误
		if flight.err == nil && a.isActiveConn(connectionID) {
			return nil
		}
		return flight.err
	}
	flight := &connectFlight{done: make(chan struct{})}
	a.connectFlights[connectionID] = flight
	a.connMu.Unlock()

	err := a.doConnectDatabase(connectionID)
	flight.err = err
	close(flight.done)

	a.connMu.Lock()
	if a.connectFlights[connectionID] == flight {
		delete(a.connectFlights, connectionID)
	}
	a.connMu.Unlock()
	return err
}

// doConnectDatabase 执行真正的连接流程（调用方保证同一连接只有一条在途）
func (a *App) doConnectDatabase(connectionID string) error {
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
		sshPassword, sshPassphrase, sshErr := a.storage.GetSSHCredentials(connectionID)
		if sshErr != nil {
			runtime.LogWarningf(a.ctx, "failed to load ssh credentials for %s: %v", connectionID, sshErr)
		}
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
		// 记录失败原因到操作日志（含错误信息），便于排查"首次连接失败"类问题
		_ = a.storage.RecordHistory(connectionID, "connect", false, err.Error())
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

// CancelDatabaseConnect 取消进行中的连接（或断开刚完成的连接）。
// 网络不通时拨号会长时间等待，前端提供取消入口调用此方法立即中止。
func (a *App) CancelDatabaseConnect(connectionID string) error {
	_ = a.tunnel.StopTunnel(connectionID)
	a.setActiveConn(connectionID, false)
	return a.dbManager.CancelConnect(connectionID)
}

// GetConnectionPassword 获取连接的已存密码明文（供编辑时回显）。
// 仅在用户主动编辑某个连接时调用，列表接口 GetConnections 仍不返回密码。
// 密码以加密形式存储，此处解密后返回明文。
func (a *App) GetConnectionPassword(connectionID string) (string, error) {
	_, password, err := a.storage.GetConnectionWithPassword(connectionID)
	if err != nil {
		return "", fmt.Errorf("failed to get connection password: %w", err)
	}
	if password == nil {
		return "", nil
	}
	return *password, nil
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

	// 运行时去重：按 db_type+host+port+username 分组，合并 MCP 旧版 create_connection
	// 不做去重留下的历史脏数据（同一服务器一条"全量"、一条"固定"）。
	// 保留策略：优先保留 database 非空的"固定库"连接（信息更具体），
	// 同组内若多条都有 database 或都无 database，取第一条（按原顺序）。
	result = dedupeConnections(result)

	return result, nil
}

// dedupeConnections 按 db_type+host+port+username 去重连接列表。
// 保留优先级：database 非空 > database 空；同优先级取第一条（保持原顺序）。
func dedupeConnections(conns []ConnectionOutput) []ConnectionOutput {
	type groupKey struct {
		DbType   string
		Host     string
		Port     int
		Username string
	}
	// firstIdx: 该组第一个出现的位置（保持顺序）；hasDBSeen: 该组是否已有带 database 的
	firstIdx := make(map[groupKey]int)
	hasDBSeen := make(map[groupKey]bool)
	out := make([]ConnectionOutput, 0, len(conns))

	for _, c := range conns {
		key := groupKey{DbType: c.DbType, Host: c.Host, Port: c.Port, Username: c.Username}
		hasDB := c.Database != nil && *c.Database != ""
		idx, seen := firstIdx[key]
		if !seen {
			// 首次出现：加入结果
			firstIdx[key] = len(out)
			hasDBSeen[key] = hasDB
			out = append(out, c)
			continue
		}
		// 已有同组：若新条目有 database 而旧条目无，替换旧条目（优先固定库）
		if hasDB && !hasDBSeen[key] {
			out[idx] = c
			hasDBSeen[key] = true
		}
	}
	return out
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

// ensureConnected 确保指定连接已建立（含自动 ping + 重连）
func (a *App) ensureConnected(connectionID string) error {
	if a.isActiveConn(connectionID) {
		// 连接标记为活跃，但需验证实际连通性
		pingErr := a.dbManager.Ping(connectionID)
		if pingErr == nil {
			return nil
		}
		// Ping 失败，尝试断开后重连
		runtime.LogWarningf(a.ctx, "connection %s ping failed, attempting reconnect: %v", connectionID, pingErr)
		_ = a.dbManager.Disconnect(connectionID)
		a.setActiveConn(connectionID, false)
	}
	return a.ConnectDatabase(connectionID)
}
