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

// Query 执行 SQL 查询
func (h *Handler) Query(w http.ResponseWriter, r *http.Request) {
	var req models.QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	fmt.Printf("[DEBUG] Query: connectionID=%s, database=%s, sql=%s\n", req.ConnectionID, req.Database, req.SQL)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	exec, err := h.mgr.GetExecutor(req.ConnectionID, req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	result, err := executeSQL(ctx, exec, req.SQL)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(models.QueryResult{
			Error: err.Error(),
		})
		return
	}
	json.NewEncoder(w).Encode(result)
}

func executeSQL(ctx context.Context, exec db.Executor, sqlStr string) (*models.QueryResult, error) {
	fmt.Fprintf(os.Stderr, "[DEBUG] executeSQL start: sql=%s\n", sqlStr)

	rows, err := exec.QueryContext(ctx, sqlStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[DEBUG] QueryContext error: %v\n", err)
		return nil, err
	}
	defer rows.Close()
	fmt.Fprintf(os.Stderr, "[DEBUG] QueryContext success\n")

	columns, err := rows.Columns()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[DEBUG] rows.Columns error: %v\n", err)
		return nil, err
	}
	fmt.Fprintf(os.Stderr, "[DEBUG] columns=%v\n", columns)

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
			fmt.Fprintf(os.Stderr, "[DEBUG] rows.Scan error at row %d: %v\n", rowCount, err)
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
	fmt.Fprintf(os.Stderr, "[DEBUG] rows scanned: %d\n", rowCount)

	if err := rows.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "[DEBUG] rows.Err: %v\n", err)
		return nil, err
	}

	// 尝试获取 RowsAffected（仅适用于无结果集的语句）
	if len(result.Rows) == 0 {
		// 如果 rows.Next() 没有进入，说明可能是 INSERT/UPDATE/DELETE
		// 但 database/sql 的 Query 不支持 RowsAffected
		// 这里返回 nil，让前端不显示
		result.RowsAffected = nil
	}

	fmt.Fprintf(os.Stderr, "[DEBUG] executeSQL end\n")
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
