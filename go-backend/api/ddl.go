package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"idblink-backend/models"
)

func quoteIdent(name string, dbType string) string {
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase", "oracle", "dameng":
		return fmt.Sprintf("\"%s\"", strings.ReplaceAll(name, "\"", "\"\""))
	case "sqlserver":
		return fmt.Sprintf("[%s]", strings.ReplaceAll(name, "]", "]]"))
	default:
		return fmt.Sprintf("`%s`", strings.ReplaceAll(name, "`", "``"))
	}
}

func buildTableRef(tableName, database, dbType string) string {
	if database != "" {
		db := quoteIdent(database, dbType)
		tbl := quoteIdent(tableName, dbType)
		if dbType == "sqlserver" {
			return fmt.Sprintf("[%s].[%s]", database, tableName)
		}
		return fmt.Sprintf("%s.%s", db, tbl)
	}
	return quoteIdent(tableName, dbType)
}

// ExecuteDDL 执行任意 DDL SQL 语句(CREATE/ALTER/DROP/TRUNCATE 等)
func (h *Handler) ExecuteDDL(w http.ResponseWriter, r *http.Request) {
	var req models.ExecuteDDLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, err := h.mgr.GetExecutor(req.ConnectionID, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, req.SQL)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// TruncateTable 清空表
func (h *Handler) TruncateTable(w http.ResponseWriter, r *http.Request) {
	var req models.TableOperationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	tableRef := buildTableRef(req.TableName, req.Database, dbType)

	var sql string
	switch dbType {
	case "sqlite":
		sql = fmt.Sprintf("DELETE FROM %s", tableRef)
	default:
		sql = fmt.Sprintf("TRUNCATE TABLE %s", tableRef)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, sql)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// DropTable 删除表
func (h *Handler) DropTable(w http.ResponseWriter, r *http.Request) {
	var req models.TableOperationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	tableRef := buildTableRef(req.TableName, req.Database, dbType)

	sql := fmt.Sprintf("DROP TABLE IF EXISTS %s", tableRef)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, sql)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// DropView 删除视图
func (h *Handler) DropView(w http.ResponseWriter, r *http.Request) {
	var req models.TableOperationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	tableRef := buildTableRef(req.ViewName, req.Database, dbType)

	sql := fmt.Sprintf("DROP VIEW IF EXISTS %s", tableRef)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, sql)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// RenameTable 重命名表
func (h *Handler) RenameTable(w http.ResponseWriter, r *http.Request) {
	var req models.RenameTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	oldRef := buildTableRef(req.OldName, req.Database, dbType)
	newRef := quoteIdent(req.NewName, dbType)

	var sql string
	switch dbType {
	case "mysql", "sqlite":
		sql = fmt.Sprintf("ALTER TABLE %s RENAME TO %s", oldRef, newRef)
	default:
		// PostgreSQL, Kingbase, Highgo, VastBase, Dameng, etc
		sql = fmt.Sprintf("ALTER TABLE %s RENAME TO %s", oldRef, newRef)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, sql)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GenericResponse{})
}

// MaintainTable 表维护操作(OPTIMIZE/ANALYZE/REPAIR)
func (h *Handler) MaintainTable(w http.ResponseWriter, r *http.Request) {
	var req models.TableMaintenanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	tableRef := buildTableRef(req.TableName, req.Database, dbType)

	var sql string
	opLower := strings.ToLower(req.Operation)

	switch opLower {
	case "optimize":
		switch dbType {
		case "mysql":
			sql = fmt.Sprintf("OPTIMIZE TABLE %s", tableRef)
		case "postgresql", "kingbase", "highgo", "vastbase":
			sql = fmt.Sprintf("VACUUM ANALYZE %s", tableRef)
		default:
			writeJSONError(w, fmt.Sprintf("OPTIMIZE 操作不支持 %s 数据库", dbType))
			return
		}
	case "analyze":
		switch dbType {
		case "mysql":
			sql = fmt.Sprintf("ANALYZE TABLE %s", tableRef)
		case "postgresql", "kingbase", "highgo", "vastbase":
			sql = fmt.Sprintf("ANALYZE %s", tableRef)
		case "sqlite":
			sql = fmt.Sprintf("ANALYZE %s", tableRef)
		case "dameng":
			sql = fmt.Sprintf("ANALYZE TABLE %s", tableRef)
		default:
			writeJSONError(w, fmt.Sprintf("ANALYZE 操作不支持 %s 数据库", dbType))
			return
		}
	case "repair":
		switch dbType {
		case "mysql":
			sql = fmt.Sprintf("REPAIR TABLE %s", tableRef)
		default:
			writeJSONError(w, fmt.Sprintf("REPAIR 操作不支持 %s 数据库", dbType))
			return
		}
	default:
		writeJSONError(w, fmt.Sprintf("不支持的操作: %s", req.Operation))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	_, err = exec.ExecContext(ctx, sql)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.GenericResponse{})
}
