package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"idblink-backend/db"
	"idblink-backend/models"
)

// DDLRequest DDL 执行请求
type DDLRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	SQL          string `json:"sql"`
}

// TableOperationRequest 表操作请求
type TableOperationRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	TableName    string `json:"table_name"`
}

// RenameTableRequest 重命名表请求
type RenameTableRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	OldName      string `json:"old_name"`
	NewName      string `json:"new_name"`
}

// ExecuteDDL 执行 DDL 语句（CREATE/ALTER/DROP 等）
func (h *Handler) ExecuteDDL(w http.ResponseWriter, r *http.Request) {
	var req DDLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	if req.SQL == "" {
		writeJSONError(w, "sql is required")
		return
	}

	exec, err := h.getConn(req.ConnectionID, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, req.SQL)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(models.GenericResponse{Error: err.Error()})
		return
	}
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// TruncateTable 清空表
func (h *Handler) TruncateTable(w http.ResponseWriter, r *http.Request) {
	var req TableOperationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var sqlStr string
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		// PostgreSQL 风格
		if req.Database != "" {
			sqlStr = fmt.Sprintf("TRUNCATE TABLE %s.%s RESTART IDENTITY CASCADE", escapeIdentifier(req.Database, dbType), escapeIdentifier(req.TableName, dbType))
		} else {
			sqlStr = fmt.Sprintf("TRUNCATE TABLE %s RESTART IDENTITY CASCADE", escapeIdentifier(req.TableName, dbType))
		}
	case "sqlite":
		// SQLite 不支持 TRUNCATE，使用 DELETE
		sqlStr = fmt.Sprintf("DELETE FROM %s", escapeIdentifier(req.TableName, dbType))
	default:
		// MySQL / MariaDB / SQL Server / Oracle / 达梦 等
		if req.Database != "" {
			sqlStr = fmt.Sprintf("TRUNCATE TABLE %s.%s", escapeIdentifier(req.Database, dbType), escapeIdentifier(req.TableName, dbType))
		} else {
			sqlStr = fmt.Sprintf("TRUNCATE TABLE %s", escapeIdentifier(req.TableName, dbType))
		}
	}

	_, err = exec.ExecContext(ctx, sqlStr)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(models.GenericResponse{Error: err.Error()})
		return
	}
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// DropTable 删除表
func (h *Handler) DropTable(w http.ResponseWriter, r *http.Request) {
	var req TableOperationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var sqlStr string
	if req.Database != "" {
		sqlStr = fmt.Sprintf("DROP TABLE IF EXISTS %s.%s", escapeIdentifier(req.Database, dbType), escapeIdentifier(req.TableName, dbType))
	} else {
		sqlStr = fmt.Sprintf("DROP TABLE IF EXISTS %s", escapeIdentifier(req.TableName, dbType))
	}

	_, err = exec.ExecContext(ctx, sqlStr)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(models.GenericResponse{Error: err.Error()})
		return
	}
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// DropView 删除视图
func (h *Handler) DropView(w http.ResponseWriter, r *http.Request) {
	var req TableOperationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var sqlStr string
	if req.Database != "" {
		sqlStr = fmt.Sprintf("DROP VIEW IF EXISTS %s.%s", escapeIdentifier(req.Database, dbType), escapeIdentifier(req.TableName, dbType))
	} else {
		sqlStr = fmt.Sprintf("DROP VIEW IF EXISTS %s", escapeIdentifier(req.TableName, dbType))
	}

	_, err = exec.ExecContext(ctx, sqlStr)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(models.GenericResponse{Error: err.Error()})
		return
	}
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// RenameTable 重命名表
func (h *Handler) RenameTable(w http.ResponseWriter, r *http.Request) {
	var req RenameTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var sqlStr string
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		sqlStr = fmt.Sprintf("ALTER TABLE %s RENAME TO %s",
			escapeIdentifier(req.OldName, dbType),
			escapeIdentifier(req.NewName, dbType))
	case "oracle", "dameng":
		// Oracle / 达梦 使用 RENAME
		sqlStr = fmt.Sprintf("RENAME %s TO %s",
			escapeIdentifier(req.OldName, dbType),
			escapeIdentifier(req.NewName, dbType))
	case "sqlite":
		// SQLite 不支持直接重命名表
		writeJSONError(w, "SQLite does not support renaming tables via this API")
		return
	default:
		// MySQL / MariaDB / SQL Server
		if req.Database != "" {
			sqlStr = fmt.Sprintf("RENAME TABLE %s.%s TO %s.%s",
				escapeIdentifier(req.Database, dbType), escapeIdentifier(req.OldName, dbType),
				escapeIdentifier(req.Database, dbType), escapeIdentifier(req.NewName, dbType))
		} else {
			sqlStr = fmt.Sprintf("RENAME TABLE %s TO %s",
				escapeIdentifier(req.OldName, dbType),
				escapeIdentifier(req.NewName, dbType))
		}
	}

	_, err = exec.ExecContext(ctx, sqlStr)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(models.GenericResponse{Error: err.Error()})
		return
	}
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// getConn 获取执行器（支持指定数据库，优先返回活跃事务）
func (h *Handler) getConn(connectionID string, database string) (db.Executor, error) {
	return h.mgr.GetExecutor(connectionID, database)
}

// getConnAndType 获取执行器和数据库类型（优先返回活跃事务）
func (h *Handler) getConnAndType(connectionID string) (db.Executor, string, error) {
	dbType, err := h.mgr.GetDBType(connectionID)
	if err != nil {
		return nil, "", err
	}
	exec, err := h.mgr.GetExecutor(connectionID, "")
	if err != nil {
		return nil, "", err
	}
	return exec, dbType, nil
}

// escapeIdentifier SQL 标识符转义
func escapeIdentifier(name string, dbType string) string {
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		return fmt.Sprintf("\"%s\"", name)
	case "oracle", "dameng":
		return fmt.Sprintf("\"%s\"", name)
	case "sqlserver":
		return fmt.Sprintf("[%s]", name)
	default:
		// mysql, mariadb, sqlite
		return fmt.Sprintf("`%s`", name)
	}
}
