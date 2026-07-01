package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"idblink/backend/db"
)

// ServerStatusRequest 服务器状态请求
type ServerStatusRequest struct {
	ConnectionID string `json:"connection_id"`
}

// ServerStatus 综合服务器状态
type ServerStatus struct {
	Version     string            `json:"version"`
	Uptime      string            `json:"uptime"`
	Connections ConnectionStats   `json:"connections"`
	Memory      MemoryStats       `json:"memory,omitempty"`
	Variables   map[string]string `json:"variables,omitempty"`
	Error       string            `json:"error,omitempty"`
}

// ConnectionStats 连接统计
type ConnectionStats struct {
	Current int `json:"current"`
	Max     int `json:"max"`
	Active  int `json:"active"`
	Idle    int `json:"idle"`
}

// MemoryStats 内存统计
type MemoryStats struct {
	Used       string  `json:"used"`
	Total      string  `json:"total"`
	BufferPool *string `json:"bufferPool,omitempty"`
}

// GetServerStatus 获取综合服务器状态
func (h *Handler) GetServerStatus(w http.ResponseWriter, r *http.Request) {
	var req ServerStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var status ServerStatus
	switch dbType {
	case "mysql", "mariadb":
		status, err = mysqlGetServerStatus(ctx, exec)
	case "postgresql", "kingbase", "highgo", "vastbase":
		status, err = postgresGetServerStatus(ctx, exec)
	case "sqlserver":
		status, err = sqlserverGetServerStatus(ctx, exec)
	case "oracle":
		status, err = oracleGetServerStatus(ctx, exec)
	case "dameng":
		status, err = damengGetServerStatus(ctx, exec)
	case "sqlite":
		status = sqliteGetServerStatus()
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(status)
}

// ─── MySQL / MariaDB ───

func mysqlGetServerStatus(ctx context.Context, dbConn db.Executor) (ServerStatus, error) {
	var status ServerStatus
	status.Variables = make(map[string]string)

	// 获取 SHOW STATUS 中的关键指标
	rows, err := dbConn.QueryContext(ctx, "SHOW GLOBAL STATUS")
	if err != nil {
		return status, fmt.Errorf("failed to get global status: %w", err)
	}
	defer rows.Close()

	statusMap := make(map[string]string)
	for rows.Next() {
		var name, value string
		if err := rows.Scan(&name, &value); err != nil {
			continue
		}
		statusMap[name] = value
	}
	if err := rows.Err(); err != nil {
		return status, fmt.Errorf("failed to iterate global status: %w", err)
	}

	// 获取 SHOW VARIABLES 中的关键指标
	varRows, err := dbConn.QueryContext(ctx, "SHOW GLOBAL VARIABLES WHERE Variable_name IN ('version', 'max_connections', 'innodb_buffer_pool_size', 'character_set_server', 'collation_server', 'datadir')")
	if err != nil {
		return status, fmt.Errorf("failed to get global variables: %w", err)
	}
	defer varRows.Close()

	varMap := make(map[string]string)
	for varRows.Next() {
		var name, value string
		if err := varRows.Scan(&name, &value); err != nil {
			continue
		}
		varMap[name] = value
	}
	if err := varRows.Err(); err != nil {
		return status, fmt.Errorf("failed to iterate global variables: %w", err)
	}

	// 组装版本
	if v, ok := varMap["version"]; ok {
		status.Version = v
	}

	// Uptime
	if v, ok := statusMap["Uptime"]; ok {
		status.Uptime = formatUptime(v)
	}

	// 连接统计
	status.Connections.Max = parseIntVal(varMap["max_connections"])
	status.Connections.Current = parseIntVal(statusMap["Threads_connected"])
	status.Connections.Active = parseIntVal(statusMap["Threads_running"])
	status.Connections.Idle = status.Connections.Current - status.Connections.Active

	// 内存 - innodb_buffer_pool_size
	if v, ok := varMap["innodb_buffer_pool_size"]; ok {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			status.Memory.BufferPool = formatBytes(sql.NullInt64{Int64: n, Valid: true})
		}
	}

	// 内存总量（MySQL 8.0+ Global_memory_total/used）
	if v, ok := statusMap["Global_memory_total"]; ok {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			if s := formatBytes(sql.NullInt64{Int64: n, Valid: true}); s != nil {
				status.Memory.Total = *s
			}
		}
	}
	if v, ok := statusMap["Global_memory_used"]; ok {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			if s := formatBytes(sql.NullInt64{Int64: n, Valid: true}); s != nil {
				status.Memory.Used = *s
			}
		}
	}

	// 收集其余变量（排除已提取到顶级字段的 key）
	excluded := map[string]bool{
		"version": true, "max_connections": true, "innodb_buffer_pool_size": true,
		"character_set_server": true, "collation_server": true, "datadir": true,
	}
	for k, v := range varMap {
		if !excluded[k] {
			status.Variables[k] = v
		}
	}

	return status, nil
}

// ─── PostgreSQL ───

func postgresGetServerStatus(ctx context.Context, dbConn db.Executor) (ServerStatus, error) {
	var status ServerStatus
	status.Variables = make(map[string]string)

	// 版本 & 启动时间
	var pgStartTime string
	err := dbConn.QueryRowContext(ctx,
		`SELECT version(), (now() - pg_postmaster_start_time())::text, pg_postmaster_start_time()::text`,
	).Scan(&status.Version, &status.Uptime, &pgStartTime)
	if err != nil {
		// 降级查询
		err2 := dbConn.QueryRowContext(ctx, "SELECT version()").Scan(&status.Version)
		if err2 != nil {
			return status, fmt.Errorf("failed to get version: %w", err2)
		}
		status.Uptime = "N/A"
	}

	// 连接统计
	var current, maxConns, active, idle int
	err = dbConn.QueryRowContext(ctx, `
		SELECT 
			(SELECT count(*) FROM pg_stat_activity) AS current,
			(SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_conn,
			(SELECT count(*) FROM pg_stat_activity WHERE state = 'active') AS active,
			(SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') AS idle
	`).Scan(&current, &maxConns, &active, &idle)
	if err != nil {
		return status, fmt.Errorf("failed to get connection stats: %w", err)
	}
	status.Connections = ConnectionStats{
		Current: current,
		Max:     maxConns,
		Active:  active,
		Idle:    idle,
	}

	// 内存 - shared_buffers
	var sharedBuffers string
	err = dbConn.QueryRowContext(ctx, `SELECT setting FROM pg_settings WHERE name = 'shared_buffers'`).Scan(&sharedBuffers)
	if err == nil {
		status.Memory.BufferPool = &sharedBuffers
	}

	// 关键变量
	varRows, err := dbConn.QueryContext(ctx, `
		SELECT name, setting FROM pg_settings 
		WHERE name IN ('work_mem', 'maintenance_work_mem', 
			'effective_cache_size', 'wal_buffers', 'max_wal_size', 'data_directory', 'server_encoding')
		ORDER BY name
	`)
	if err != nil {
		return status, nil // 非致命错误
	}
	defer varRows.Close()

	for varRows.Next() {
		var name, value string
		if err := varRows.Scan(&name, &value); err != nil {
			continue
		}
		status.Variables[name] = value
	}

	return status, nil
}

// ─── SQL Server ───

func sqlserverGetServerStatus(ctx context.Context, dbConn db.Executor) (ServerStatus, error) {
	var status ServerStatus
	status.Variables = make(map[string]string)

	// 版本 & 启动时间 & 连接数
	query := `
		SELECT 
			@@VERSION AS version,
			(SELECT CONVERT(VARCHAR(30), sqlserver_start_time, 120) FROM sys.dm_os_sys_info) AS start_time,
			(SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS current_conns,
			(SELECT @@MAX_CONNECTIONS) AS max_conns,
			(SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1 AND status = 'running') AS active,
			(SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1 AND status = 'sleeping') AS idle
	`
	var version string
	var startTime sql.NullString
	var current, maxConns, active, idle int

	err := dbConn.QueryRowContext(ctx, query).Scan(&version, &startTime, &current, &maxConns, &active, &idle)
	if err != nil {
		return status, fmt.Errorf("failed to get server status: %w", err)
	}

	status.Version = version
	if startTime.Valid {
		status.Uptime = startTime.String
	}
	status.Connections = ConnectionStats{
		Current: current,
		Max:     maxConns,
		Active:  active,
		Idle:    idle,
	}

	// 内存
	var totalMemKB, availMemKB sql.NullInt64
	err = dbConn.QueryRowContext(ctx, `
		SELECT 
			total_physical_memory_kb,
			available_physical_memory_kb
		FROM sys.dm_os_sys_memory
	`).Scan(&totalMemKB, &availMemKB)
	if err == nil {
		if totalMemKB.Valid {
			if s := formatBytes(sql.NullInt64{Int64: totalMemKB.Int64 * 1024, Valid: true}); s != nil {
				status.Memory.Total = *s
			}
		}
		if totalMemKB.Valid && availMemKB.Valid {
			usedKB := totalMemKB.Int64 - availMemKB.Int64
			if s := formatBytes(sql.NullInt64{Int64: usedKB * 1024, Valid: true}); s != nil {
				status.Memory.Used = *s
			}
		}
	}

	// 关键变量
	var serverName string
	if err := dbConn.QueryRowContext(ctx, "SELECT @@SERVERNAME").Scan(&serverName); err == nil {
		status.Variables["server_name"] = serverName
	}

	var collation string
	if err := dbConn.QueryRowContext(ctx, "SELECT SERVERPROPERTY('Collation')").Scan(&collation); err == nil {
		status.Variables["collation"] = collation
	}

	var edition string
	if err := dbConn.QueryRowContext(ctx, "SELECT SERVERPROPERTY('Edition')").Scan(&edition); err == nil {
		status.Variables["edition"] = edition
	}

	return status, nil
}

// ─── Oracle ───

func oracleGetServerStatus(ctx context.Context, dbConn db.Executor) (ServerStatus, error) {
	var status ServerStatus
	status.Variables = make(map[string]string)

	// 版本
	err := dbConn.QueryRowContext(ctx, "SELECT banner FROM v$version WHERE rownum = 1").Scan(&status.Version)
	if err != nil {
		return status, fmt.Errorf("failed to get version: %w", err)
	}

	// 启动时间
	var startupTime string
	err = dbConn.QueryRowContext(ctx, `SELECT TO_CHAR(startup_time, 'YYYY-MM-DD HH24:MI:SS') FROM v$instance`).Scan(&startupTime)
	if err == nil {
		status.Uptime = startupTime
	}

	// 连接统计
	var current, maxConns, active, idle int
	err = dbConn.QueryRowContext(ctx, `
		SELECT 
			(SELECT COUNT(*) FROM v$session WHERE type = 'USER') AS current_sessions,
			(SELECT TO_NUMBER(value) FROM v$parameter WHERE name = 'sessions') AS max_sessions,
			(SELECT COUNT(*) FROM v$session WHERE type = 'USER' AND status = 'ACTIVE') AS active_sessions,
			(SELECT COUNT(*) FROM v$session WHERE type = 'USER' AND status = 'INACTIVE') AS idle_sessions
		FROM dual
	`).Scan(&current, &maxConns, &active, &idle)
	if err == nil {
		status.Connections = ConnectionStats{
			Current: current,
			Max:     maxConns,
			Active:  active,
			Idle:    idle,
		}
	}

	// SGA 内存
	var sgaTotal sql.NullInt64
	err = dbConn.QueryRowContext(ctx, `SELECT SUM(value) FROM v$sga`).Scan(&sgaTotal)
	if err == nil && sgaTotal.Valid {
		if s := formatBytes(sql.NullInt64{Int64: sgaTotal.Int64, Valid: true}); s != nil {
			status.Memory.Total = *s
		}
	}

	// 关键变量
	varRows, err := dbConn.QueryContext(ctx, `
		SELECT name, value FROM v$parameter 
		WHERE name IN ('db_block_size', 'sga_max_size', 'pga_aggregate_target', 'db_name', 'instance_name')
	`)
	if err == nil {
		defer varRows.Close()
		for varRows.Next() {
			var name, value string
			if err := varRows.Scan(&name, &value); err != nil {
				continue
			}
			status.Variables[name] = value
		}
	}

	return status, nil
}

// ─── 达梦 ───

func damengGetServerStatus(ctx context.Context, dbConn db.Executor) (ServerStatus, error) {
	var status ServerStatus
	status.Variables = make(map[string]string)

	// 版本
	err := dbConn.QueryRowContext(ctx, "SELECT banner FROM v$version WHERE rownum = 1").Scan(&status.Version)
	if err != nil {
		return status, fmt.Errorf("failed to get version: %w", err)
	}

	// 启动时间
	var startupTime sql.NullString
	err = dbConn.QueryRowContext(ctx, "SELECT SV_START_TIME FROM V$INSTANCE").Scan(&startupTime)
	if err == nil && startupTime.Valid {
		status.Uptime = startupTime.String
	}

	// 连接统计 - 达梦使用 v$sessions
	var current, maxConns, active, idle int
	err = dbConn.QueryRowContext(ctx, `
		SELECT 
			(SELECT COUNT(*) FROM v$sessions) AS current_sessions,
			(SELECT MAX_SESSIONS FROM v$license) AS max_sessions,
			(SELECT COUNT(*) FROM v$sessions WHERE STATE = 'ACTIVE') AS active_sessions,
			(SELECT COUNT(*) FROM v$sessions WHERE STATE = 'IDLE') AS idle_sessions
		FROM dual
	`).Scan(&current, &maxConns, &active, &idle)
	if err == nil {
		status.Connections = ConnectionStats{
			Current: current,
			Max:     maxConns,
			Active:  active,
			Idle:    idle,
		}
	}

	// 内存
	var totalMem sql.NullInt64
	err = dbConn.QueryRowContext(ctx, "SELECT TOTAL_SIZE FROM V$BUFFERPOOL WHERE NAME = 'NORMAL'").Scan(&totalMem)
	if err == nil {
		status.Memory.BufferPool = formatBytes(totalMem)
	}

	return status, nil
}

// ─── SQLite ───

func sqliteGetServerStatus() ServerStatus {
	return ServerStatus{
		Version:     "SQLite",
		Uptime:      "N/A",
		Connections: ConnectionStats{},
		Variables:   map[string]string{"type": "embedded"},
	}
}

// ─── 工具函数 ───

func parseIntVal(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

// formatUptime 将秒数格式化为可读的运行时间
func formatUptime(seconds string) string {
	secs, _ := strconv.ParseInt(seconds, 10, 64)
	if secs <= 0 {
		return seconds + "s"
	}
	days := secs / 86400
	hours := (secs % 86400) / 3600
	minutes := (secs % 3600) / 60
	remainingSecs := secs % 60

	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm %ds", days, hours, minutes, remainingSecs)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh %dm %ds", hours, minutes, remainingSecs)
	}
	if minutes > 0 {
		return fmt.Sprintf("%dm %ds", minutes, remainingSecs)
	}
	return fmt.Sprintf("%ds", remainingSecs)
}
