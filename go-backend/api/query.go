package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
	"unicode/utf8"

	"idblink-backend/db"
	"idblink-backend/models"
)

var debugEnabled = os.Getenv("IDBLINK_DEBUG") == "1" || os.Getenv("IDBLINK_DEBUG") == "true"

func debugLog(format string, args ...interface{}) {
	if debugEnabled {
		fmt.Fprintf(os.Stderr, "[DEBUG] "+format+"\n", args...)
	}
}

// Query 执行 SQL 查询
func (h *Handler) Query(w http.ResponseWriter, r *http.Request) {
	var req models.QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	debugLog("Query: connectionID=%s, database=%s, sql=%s", req.ConnectionID, req.Database, req.SQL)

	startTime := time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	exec, err := h.mgr.GetExecutor(req.ConnectionID, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	// 检查是否需要流式传输（大数据集）
	streamEnabled := r.URL.Query().Get("stream") == "true" || req.StreamResults

	if streamEnabled {
		// 流式传输模式
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Transfer-Encoding", "chunked")
		
		// 发送初始响应
		initialResp := models.QueryResult{
			Streaming: true,
			Columns:   []string{},
			Rows:      nil,
			Error:     "",
		}
		if err := json.NewEncoder(w).Encode(initialResp); err != nil {
			writeJSONError(w, "failed to send initial response")
			return
		}

		// 执行查询并流式传输结果
		if err := streamQueryResults(w, ctx, exec, req.SQL); err != nil {
			// 发送错误响应
			errorResp := models.QueryResult{
				Streaming: true,
				Error:     err.Error(),
			}
			json.NewEncoder(w).Encode(errorResp)
			return
		}

		executionTimeMs := time.Since(startTime).Milliseconds()
		// 发送执行时间
		timeResp := models.QueryResult{
			Streaming:      true,
			ExecutionTimeMs: executionTimeMs,
		}
		json.NewEncoder(w).Encode(timeResp)
	} else {
		// 传统模式 - 一次性加载所有数据
		result, err := executeSQL(ctx, exec, req.SQL)

		executionTimeMs := time.Since(startTime).Milliseconds()

		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			json.NewEncoder(w).Encode(models.QueryResult{
				Error:           err.Error(),
				ExecutionTimeMs: executionTimeMs,
			})
			return
		}
		result.ExecutionTimeMs = executionTimeMs
		json.NewEncoder(w).Encode(result)
	}
}

// streamQueryResults 流式传输查询结果
func streamQueryResults(w http.ResponseWriter, ctx context.Context, exec db.Executor, sqlStr string) error {
	rows, err := exec.QueryContext(ctx, sqlStr)
	if err != nil {
		return fmt.Errorf("query execution failed: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil {
			debugLog("rows.Close error: %v", closeErr)
		}
	}()

	// 获取列信息
	columns, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("failed to get columns: %w", err)
	}

	// 发送列信息
	columnsResp := models.QueryResult{
		Streaming: true,
		Columns:   columns,
	}
	if err := json.NewEncoder(w).Encode(columnsResp); err != nil {
		return fmt.Errorf("failed to send columns: %w", err)
	}

	// 发送行数据
	rowCount := 0
	for rows.Next() {
		row := make([]interface{}, len(columns))
		rowPtrs := make([]interface{}, len(columns))
		for i := range row {
			rowPtrs[i] = &row[i]
		}

		if err := rows.Scan(rowPtrs...); err != nil {
			return fmt.Errorf("row scan failed at row %d: %w", rowCount, err)
		}

		// 转换值为 JSON 友好类型
		jsonRow := make([]interface{}, len(columns))
		for i, v := range row {
			jsonRow[i] = convertValue(v)
		}

		// 发送行数据
		rowResp := models.QueryResult{
			Streaming: true,
			Rows:      [][]interface{}{jsonRow},
		}
		if err := json.NewEncoder(w).Encode(rowResp); err != nil {
			return fmt.Errorf("failed to send row %d: %w", rowCount, err)
		}

		rowCount++
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("rows iteration error: %w", err)
	}

	return nil
}

func executeSQL(ctx context.Context, exec db.Executor, sqlStr string) (*models.QueryResult, error) {
	debugLog("executeSQL start: sql=%s", sqlStr)

	rows, err := exec.QueryContext(ctx, sqlStr)
	if err != nil {
		debugLog("QueryContext error: %v", err)
		return nil, err
	}
	// 确保rows在关闭前不为nil
	if rows != nil {
		defer func() {
			if closeErr := rows.Close(); closeErr != nil {
				debugLog("rows.Close error: %v", closeErr)
			}
		}()
	}
	debugLog("QueryContext success")

	columns, err := rows.Columns()
	if err != nil {
		debugLog("rows.Columns error: %v", err)
		return nil, err
	}
	debugLog("columns=%v", columns)

	result := &models.QueryResult{
		Columns: columns,
		Rows:    make([][]interface{}, 0),
	}

	rowCount := 0
	for rows.Next() {
		row := make([]interface{}, len(columns))
		rowPtrs := make([]interface{}, len(columns))
		for i := range row {
			rowPtrs[i] = &row[i]
		}

		if err := rows.Scan(rowPtrs...); err != nil {
			debugLog("rows.Scan error at row %d: %v", rowCount, err)
			return nil, err
		}

		// 转换值为 JSON 友好类型
		jsonRow := make([]interface{}, len(columns))
		for i, v := range row {
			jsonRow[i] = convertValue(v)
		}
		result.Rows = append(result.Rows, jsonRow)
		rowCount++
	}
	debugLog("rows scanned: %d", rowCount)

	if err := rows.Err(); err != nil {
		debugLog("rows.Err: %v", err)
		return nil, err
	}

	// 尝试获取 RowsAffected（仅适用于无结果集的语句）
	if len(result.Rows) == 0 {
		// 如果 rows.Next() 没有进入，说明可能是 INSERT/UPDATE/DELETE
		// 但 database/sql 的 Query 不支持 RowsAffected
		// 这里返回 nil，让前端不显示
		result.RowsAffected = nil
	}

	debugLog("executeSQL end")
	return result, nil
}

// convertValue 将数据库原始值转换为 JSON 友好的类型
func convertValue(v interface{}) interface{} {
	switch val := v.(type) {
	case nil:
		return nil
	case int64:
		return val
	case int32:
		return int64(val)
	case int:
		return int64(val)
	case float64:
		return val
	case float32:
		return float64(val)
	case bool:
		return val
	case string:
		return val
	case []byte:
		// 尝试作为 UTF-8 字符串解码，成功则返回字符串
		if str := string(val); isValidUTF8(str) {
			return str
		}
		// 真正的二进制数据才显示为 BLOB
		return fmt.Sprintf("[BLOB: %d bytes]", len(val))
	case time.Time:
		return val.Format("2006-01-02 15:04:05")
	default:
		// 其他类型尝试转字符串
		return fmt.Sprintf("%v", val)
	}
}

// isValidUTF8 检查字符串是否为有效的 UTF-8
func isValidUTF8(s string) bool {
	return utf8.ValidString(s)
}
