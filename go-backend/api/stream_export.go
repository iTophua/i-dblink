package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"idblink-backend/db"
	"idblink-backend/models"
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

	// 根据数据库类型选择标识符引号
	quote := "`"
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase", "oracle", "dameng":
		quote = `"`
	case "sqlserver":
		quote = `[` // SQL Server 使用方括号，关闭时用 ]
	}

	// 构建表引用（带数据库/Schema 限定）
	tableRef := req.TableName
	if req.Database != "" {
		if dbType == "sqlserver" {
			tableRef = fmt.Sprintf("[%s].[%s]", req.Database, req.TableName)
		} else if dbType == "postgresql" || dbType == "kingbase" || dbType == "highgo" || dbType == "vastbase" || dbType == "oracle" || dbType == "dameng" {
			tableRef = fmt.Sprintf("\"%s\".\"%s\"", req.Database, req.TableName)
		} else {
			tableRef = fmt.Sprintf("`%s`.`%s`", req.Database, req.TableName)
		}
	} else {
		tableRef = fmt.Sprintf("%s%s%s", quote, req.TableName, quote)
		if dbType == "sqlserver" {
			tableRef = fmt.Sprintf("[%s]", req.TableName)
		}
	}

	// 构建查询语句（不带 LIMIT）
	sql := fmt.Sprintf("SELECT * FROM %s", tableRef)

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

	// 分批查询数据
	batchSize := req.BatchSize
	if batchSize <= 0 {
		batchSize = 1000
	}

	totalCount := 0
	offset := 0

	for {
		// 构建带分页的查询
		pagedSQL := fmt.Sprintf("SELECT * FROM %s LIMIT %d OFFSET %d", tableRef, batchSize, offset)

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
