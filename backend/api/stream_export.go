package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"idblink/backend/models"
)

// StreamExport 流式导出完整表数据（分批查询）
func (h *Handler) StreamExport(w http.ResponseWriter, r *http.Request) {
	var req models.StreamExportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	exec, err := h.mgr.GetExecutor(req.ConnectionID, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	dbType, _ := h.mgr.GetDBType(req.ConnectionID)

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	// 构建表引用（用 quoteIdent 正确转义，避免注入）
	tableRef := buildTableRef(req.TableName, req.Database, dbType)

	// 仅查列名，不加载全表数据（避免大表锁定/内存占用）
	sql := fmt.Sprintf("SELECT * FROM %s WHERE 1=0", tableRef)

	rows, err := exec.QueryContext(ctx, sql)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	// 设置响应头
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	encoder := json.NewEncoder(w)

	// 发送列信息
	_ = encoder.Encode(map[string]interface{}{
		"type":    "columns",
		"columns": columns,
	})

	// 分批查询数据（基于真实数据查询 SQL，而非 metadata 查询）
	dataSQL := fmt.Sprintf("SELECT * FROM %s", tableRef)
	if req.WhereClause != "" {
		dataSQL += " WHERE " + req.WhereClause
	}

	batchSize := req.BatchSize
	if batchSize <= 0 {
		batchSize = 1000
	}

	totalCount := 0
	offset := 0

	for {
		// 根据数据库类型构建带分页的查询
		pagedSQL := buildPagedQuery(dataSQL, dbType, batchSize, offset)

		pagedRows, err := exec.QueryContext(ctx, pagedSQL)
		if err != nil {
			_ = encoder.Encode(map[string]interface{}{
				"type":  "error",
				"error": err.Error(),
			})
			return
		}

		batchRows := make([][]interface{}, 0)

		for pagedRows.Next() {
			row := make([]interface{}, len(columns))
			rowPtrs := make([]interface{}, len(columns))
			for i := range row {
				rowPtrs[i] = &row[i]
			}

			if err := pagedRows.Scan(rowPtrs...); err != nil {
				pagedRows.Close()
				_ = encoder.Encode(map[string]interface{}{
					"type":  "error",
					"error": err.Error(),
				})
				return
			}

			// 转换值为 JSON 友好类型
			jsonRow := make([]interface{}, len(columns))
			for i, v := range row {
				jsonRow[i] = convertValue(v)
			}
			batchRows = append(batchRows, jsonRow)
			totalCount++
		}

		pagedRows.Close()

		if len(batchRows) == 0 {
			// 发送完成消息
			_ = encoder.Encode(map[string]interface{}{
				"type":       "complete",
				"total_rows": totalCount,
			})
			break
		}

		// 发送批次数据
		_ = encoder.Encode(map[string]interface{}{
			"type":   "batch",
			"rows":   batchRows,
			"offset": offset,
		})

		offset += batchSize
	}
}

// buildPagedQuery 根据数据库类型构建分页查询
func buildPagedQuery(baseSQL string, dbType string, limit int, offset int) string {
	switch dbType {
	case "sqlserver":
		// SQL Server 2012+ 使用 OFFSET FETCH
		// 注意：需要 ORDER BY，这里假设使用默认排序
		return fmt.Sprintf("%s ORDER BY (SELECT NULL) OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", baseSQL, offset, limit)
	case "oracle", "dameng":
		// Oracle 12c+ 使用 OFFSET FETCH
		return fmt.Sprintf("%s OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", baseSQL, offset, limit)
	case "mysql", "mariadb", "postgresql", "kingbase", "highgo", "vastbase", "sqlite":
		// 这些数据库支持 LIMIT/OFFSET
		return fmt.Sprintf("%s LIMIT %d OFFSET %d", baseSQL, limit, offset)
	default:
		// 默认使用 LIMIT/OFFSET
		return fmt.Sprintf("%s LIMIT %d OFFSET %d", baseSQL, limit, offset)
	}
}
