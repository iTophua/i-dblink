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
	"idblink/backend/models"
)

// ProcessInfo 进程信息
type ProcessInfo struct {
	ID        string  `json:"id"`
	User      string  `json:"user"`
	Host      *string `json:"host,omitempty"`
	Database  *string `json:"database,omitempty"`
	Command   *string `json:"command,omitempty"`
	State     *string `json:"state,omitempty"`
	Info      *string `json:"info,omitempty"`
	Time      *string `json:"time,omitempty"`
	StartTime *string `json:"start_time,omitempty"`
	Duration  *string `json:"duration,omitempty"`
	Serial    *string `json:"serial,omitempty"`
}

// ProcessListRequest 进程列表请求
type ProcessListRequest struct {
	ConnectionID string  `json:"connection_id"`
	Database     *string `json:"database,omitempty"`
}

// KillProcessRequest 终止进程请求
type KillProcessRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database"`
	ProcessID    string `json:"process_id"`
	Serial       string `json:"serial,omitempty"`
}

// GetProcessList 获取数据库进程列表
func (h *Handler) GetProcessList(w http.ResponseWriter, r *http.Request) {
	var req ProcessListRequest
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

	var processes []ProcessInfo
	switch dbType {
	case "mysql":
		processes, err = mysqlGetProcessList(ctx, exec)
	case "postgresql", "kingbase", "highgo", "vastbase":
		processes, err = postgresGetProcessList(ctx, exec)
	case "sqlserver":
		processes, err = sqlserverGetProcessList(ctx, exec)
	case "oracle":
		processes, err = oracleGetProcessList(ctx, exec)
	case "dameng":
		processes, err = oracleGetProcessList(ctx, exec)
	case "sqlite":
		processes = []ProcessInfo{}
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	if processes == nil {
		processes = []ProcessInfo{}
	}
	json.NewEncoder(w).Encode(processes)
}

// KillProcess 终止数据库进程
func (h *Handler) KillProcess(w http.ResponseWriter, r *http.Request) {
	var req KillProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	// 验证 ProcessID 必须为数字（防止 SQL 注入）
	if _, convErr := strconv.Atoi(req.ProcessID); convErr != nil {
		writeJSONError(w, "invalid process_id: must be numeric")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch dbType {
	case "mysql":
		_, err = exec.ExecContext(ctx, fmt.Sprintf("KILL %s", req.ProcessID))
	case "postgresql", "kingbase", "highgo", "vastbase":
		_, err = exec.ExecContext(ctx, fmt.Sprintf("SELECT pg_terminate_backend(%s)", req.ProcessID))
	case "sqlserver":
		_, err = exec.ExecContext(ctx, fmt.Sprintf("KILL %s", req.ProcessID))
	case "oracle", "dameng":
		if req.Serial == "" {
			err = fmt.Errorf("serial# is required for Oracle/DM kill session")
			break
		}
		if _, convErr := strconv.Atoi(req.Serial); convErr != nil {
			writeJSONError(w, "invalid serial: must be numeric")
			return
		}
		_, err = exec.ExecContext(ctx, fmt.Sprintf("ALTER SYSTEM KILL SESSION '%s,%s' IMMEDIATE", req.ProcessID, req.Serial))
	case "sqlite":
		err = fmt.Errorf("SQLite does not support process management")
	default:
		err = fmt.Errorf("unsupported db type: %s", dbType)
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// ─── MySQL ───

func mysqlGetProcessList(ctx context.Context, dbConn db.Executor) ([]ProcessInfo, error) {
	rows, err := dbConn.QueryContext(ctx, "SHOW PROCESSLIST")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ProcessInfo
	for rows.Next() {
		var p ProcessInfo
		var id int64
		var user, host, db, command, state sql.NullString
		var info sql.NullString
		var t sql.NullInt64

		if err := rows.Scan(&id, &user, &host, &db, &command, &t, &state, &info); err != nil {
			return nil, err
		}
		p.ID = fmt.Sprintf("%d", id)
		p.User = user.String
		if host.Valid {
			p.Host = &host.String
		}
		if db.Valid {
			p.Database = &db.String
		}
		if command.Valid {
			p.Command = &command.String
		}
		if state.Valid {
			p.State = &state.String
		}
		if info.Valid {
			p.Info = &info.String
		}
		if t.Valid {
			s := fmt.Sprintf("%d", t.Int64)
			p.Time = &s
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

// ─── PostgreSQL ───

func postgresGetProcessList(ctx context.Context, dbConn db.Executor) ([]ProcessInfo, error) {
	query := `
		SELECT pid::text,
			COALESCE(usename, '') AS usename,
			COALESCE(client_addr::text, '') AS client_addr,
			COALESCE(datname, '') AS datname,
			COALESCE(state, '') AS state,
			COALESCE(query, '') AS query,
			COALESCE(query_start::text, '') AS query_start,
			COALESCE(now() - query_start, interval '0')::text AS duration
		FROM pg_stat_activity
		WHERE state IS NOT NULL
		ORDER BY query_start DESC
	`
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ProcessInfo
	for rows.Next() {
		var p ProcessInfo
		var pid, usename, clientAddr, datname, state, queryText, startTime, duration string
		if err := rows.Scan(&pid, &usename, &clientAddr, &datname, &state, &queryText, &startTime, &duration); err != nil {
			return nil, err
		}
		p.ID = pid
		p.User = usename
		if clientAddr != "" {
			p.Host = &clientAddr
		}
		if datname != "" {
			p.Database = &datname
		}
		if state != "" {
			p.State = &state
		}
		if queryText != "" {
			p.Info = &queryText
		}
		if startTime != "" {
			p.StartTime = &startTime
		}
		if duration != "" {
			p.Duration = &duration
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

// ─── SQL Server ───

func sqlserverGetProcessList(ctx context.Context, dbConn db.Executor) ([]ProcessInfo, error) {
	query := `
		SELECT
			CAST(r.session_id AS VARCHAR(20)) AS session_id,
			COALESCE(s.login_name, '') AS login_name,
			COALESCE(s.host_name, '') AS host_name,
			COALESCE(DB_NAME(r.database_id), '') AS database_name,
			COALESCE(r.status, '') AS status,
			COALESCE(r.command, '') AS command,
			COALESCE(CAST(r.cpu_time AS VARCHAR(20)), '') AS cpu_time,
			COALESCE(CAST(r.total_elapsed_time AS VARCHAR(20)), '') AS total_elapsed_time,
			COALESCE(t.text, '') AS text
		FROM sys.dm_exec_requests r
		INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
		CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
		WHERE r.session_id > 50
		ORDER BY r.start_time DESC
	`
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ProcessInfo
	for rows.Next() {
		var p ProcessInfo
		var sessionID, loginName, hostName, dbName, status, command, cpuTime, elapsedTime, text string
		if err := rows.Scan(&sessionID, &loginName, &hostName, &dbName, &status, &command, &cpuTime, &elapsedTime, &text); err != nil {
			return nil, err
		}
		p.ID = sessionID
		p.User = loginName
		if hostName != "" {
			p.Host = &hostName
		}
		if dbName != "" {
			p.Database = &dbName
		}
		if status != "" {
			p.State = &status
		}
		if command != "" {
			p.Command = &command
		}
		if text != "" {
			p.Info = &text
		}
		if elapsedTime != "" {
			p.Duration = &elapsedTime
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

// ─── Oracle / 达梦 ───

func oracleGetProcessList(ctx context.Context, dbConn db.Executor) ([]ProcessInfo, error) {
	query := `
		SELECT TO_CHAR(s.sid) AS sid,
			TO_CHAR(s.serial#) AS serial#,
			COALESCE(s.username, '') AS username,
			COALESCE(s.status, '') AS status,
			COALESCE(s.machine, '') AS machine,
			COALESCE(q.sql_text, '') AS sql_text,
			TO_CHAR(s.last_call_et) AS last_call_et
		FROM v$session s
		LEFT JOIN v$sql q ON s.sql_id = q.sql_id
		WHERE s.type = 'USER'
	`
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ProcessInfo
	for rows.Next() {
		var p ProcessInfo
		var sid, serial, username, status, machine, sqlText, lastCallEt string
		if err := rows.Scan(&sid, &serial, &username, &status, &machine, &sqlText, &lastCallEt); err != nil {
			return nil, err
		}
		p.ID = sid
		p.User = username
		p.Serial = &serial
		if machine != "" {
			p.Host = &machine
		}
		if status != "" {
			p.State = &status
		}
		if sqlText != "" {
			p.Info = &sqlText
		}
		if lastCallEt != "" {
			p.Duration = &lastCallEt
		}
		result = append(result, p)
	}
	return result, rows.Err()
}
