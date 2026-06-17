package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"idblink/backend/db"
)

// GetDatabaseDDLRequest 获取建库语句请求
type GetDatabaseDDLRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database"`
}

// GetDatabaseDDL 获取数据库的建库语句
func (h *Handler) GetDatabaseDDL(w http.ResponseWriter, r *http.Request) {
	var req GetDatabaseDDLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	pool, err := h.mgr.GetPool(req.ConnectionID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("connection not found: %v", err))
		return
	}

	ddl, err := getDatabaseDDL(pool, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ddl": ddl,
	})
}

// getDatabaseDDL 根据数据库类型获取建库语句
func getDatabaseDDL(pool *db.DBPool, database string) (string, error) {
	db := pool.DB()

	switch pool.DbType {
	case "mysql", "mariadb":
		escapedDb := strings.ReplaceAll(database, "`", "``")
		rows, err := db.Query(fmt.Sprintf("SHOW CREATE DATABASE `%s`", escapedDb))
		if err != nil {
			return "", fmt.Errorf("show create database failed: %v", err)
		}
		defer rows.Close()

		if rows.Next() {
			var dbName, createSQL string
			if err := rows.Scan(&dbName, &createSQL); err == nil {
				return createSQL + ";", nil
			}
		}
		return "", fmt.Errorf("no DDL found for database: %s", database)

	case "postgresql", "highgo", "vastbase":
		ddl := fmt.Sprintf("CREATE DATABASE %s;", quoteIdentPG(database))
		return ddl, nil

	case "sqlite":
		ddl := fmt.Sprintf("-- SQLite database: %s\n-- ATTACH DATABASE '%s' AS %s;", database, database, quoteIdentSQLite(database))
		return ddl, nil

	case "sqlserver":
		ddl := fmt.Sprintf("CREATE DATABASE [%s];", database)
		return ddl, nil

	case "dameng", "kingbase":
		ddl := fmt.Sprintf("CREATE DATABASE \"%s\";", database)
		return ddl, nil

	case "oracle":
		ddl := fmt.Sprintf("-- Oracle database: %s\n-- CREATE DATABASE is typically managed by DBA.", database)
		return ddl, nil

	default:
		return "", fmt.Errorf("unsupported database type: %s", pool.DbType)
	}
}

func quoteIdentPG(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func quoteIdentSQLite(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}
