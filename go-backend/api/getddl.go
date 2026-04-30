package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"idblink-backend/db"
	"idblink-backend/models"
)

// GetTableDDLRequest 获取建表语句请求
type GetTableDDLRequest struct {
	ConnectionID string `json:"connection_id"`
	TableName    string `json:"table_name"`
	Database     string `json:"database,omitempty"`
}

// GetTableDDL 获取表的完整建表语句
func (h *Handler) GetTableDDL(w http.ResponseWriter, r *http.Request) {
	var req GetTableDDLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	pool, err := h.mgr.GetPool(req.ConnectionID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("connection not found: %v", err))
		return
	}

	ddls, err := getTableDDL(pool, req.TableName, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ddls": ddls,
	})
}

// getTableDDL 根据数据库类型获取建表语句
func getTableDDL(pool *db.DBPool, tableName string, database string) ([]string, error) {
	var ddls []string
	db := pool.DB()

	switch pool.DbType {
	case "mysql", "mariadb":
		escapedDb := strings.ReplaceAll(database, "`", "``")
		escapedTable := strings.ReplaceAll(tableName, "`", "``")
		rows, err := db.Query(fmt.Sprintf("SHOW CREATE TABLE `%s`.`%s`", escapedDb, escapedTable))
		if err != nil {
			return nil, fmt.Errorf("show create table failed: %v", err)
		}
		defer rows.Close()

		for rows.Next() {
			var tn, createTable string
			if err := rows.Scan(&tn, &createTable); err == nil {
				ddls = append(ddls, createTable)
			}
		}

	case "postgresql", "highgo", "vastbase":
		var createSQL string
		err := db.QueryRow(
			"SELECT pg_get_viewdef($1::text, true)",
			fmt.Sprintf("%s.%s", database, tableName),
		).Scan(&createSQL)
		if err == nil && createSQL != "" {
			ddls = append(ddls, createSQL)
		} else {
			// 尝试作为表获取
			var tableDef string
			err = db.QueryRow(
				"SELECT 'CREATE TABLE ' || quote_ident($1) || '.' || quote_ident($2) || ' (' || array_to_string(array_agg(column_def::text), ', ') || ');'"+
					" FROM ("+
					"   SELECT column_name || ' ' || data_type || case when character_maximum_length is not null then '(' || character_maximum_length::text || ')' else '' end"+
					"   FROM information_schema.columns"+
					"   WHERE table_schema = $1 AND table_name = $2"+
					"   ORDER BY ordinal_position"+
					" ) AS cols",
				database, tableName,
			).Scan(&tableDef)
			if err == nil && tableDef != "" {
				ddls = append(ddls, tableDef)
			}
		}

	case "sqlite":
		rows, err := db.Query("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", tableName)
		if err != nil {
			return nil, fmt.Errorf("get table ddl failed: %v", err)
		}
		defer rows.Close()

		for rows.Next() {
			var sql string
			if err := rows.Scan(&sql); err == nil && sql != "" {
				ddls = append(ddls, sql+";")
			}
		}

	case "dameng", "kingbase":
		var viewDef string
		err := db.QueryRow(
			"SELECT text FROM all_views WHERE schema_name=? AND view_name=?",
			database, tableName,
		).Scan(&viewDef)
		if err == nil && viewDef != "" {
			ddls = append(ddls, viewDef)
		} else {
			// 尝试获取表定义
			var tableSQL string
			err = db.QueryRow(
				"SELECT 'CREATE TABLE ' || ? || ' (' || array_to_string(array_agg(col_def), ', ') || ');'"+
					" FROM ("+
					"   SELECT column_name || ' ' || data_type"+
					"   FROM user_tables_columns WHERE table_name = ?"+
					"   ORDER BY column_id"+
					" ) AS cols",
				tableName, tableName,
			).Scan(&tableSQL)
			if err == nil && tableSQL != "" {
				ddls = append(ddls, tableSQL)
			}
		}

	default:
		return nil, fmt.Errorf("unsupported database type: %s", pool.DbType)
	}

	if len(ddls) == 0 {
		return nil, fmt.Errorf("no DDL found for table: %s", tableName)
	}

	return ddls, nil
}
