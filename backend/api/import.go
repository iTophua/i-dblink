package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"idblink/backend/db"
	"idblink/backend/models"
)

// importTxSession 导入专用事务会话：导入整体在一个事务里原子提交，
// 与任何查询 Tab / MCP 会话隔离，避免互相捕获语句。
const importTxSession = "__import__"

func (h *Handler) BatchImport(w http.ResponseWriter, r *http.Request) {
	var req models.BatchImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, err.Error())
		return
	}

	_, dbType, err := h.getConnAndType(req.ConnectionID)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	quoteChar := "`"
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase", "oracle", "dameng":
		quoteChar = "\""
	case "sqlserver":
		quoteChar = "["
	}

	// 转义标识符中的引号
	escapeIdentifier := func(name string) string {
		if quoteChar == "[" {
			return "[" + strings.ReplaceAll(name, "]", "]]") + "]"
		}
		return quoteChar + strings.ReplaceAll(name, quoteChar, quoteChar+quoteChar) + quoteChar
	}

	// 表引用：PG 系的限定部分是 schema（取自「schema.表」）。此前把库名拼成 "库"."表"，
	// PG 上导入一律报 schema 不存在，等于只有 MySQL 能导入
	tableName := quoteIdent(req.TableName, dbType)
	switch dbType {
	case "mysql", "mariadb", "postgresql", "kingbase", "highgo", "vastbase":
		tableName = buildTableRef(req.TableName, req.Database, dbType)
	}

	// 事务和语句落在哪个库的连接池上：PG 不能在连接上切库，必须按库；其余库用连接自己的池
	txDatabase := ""
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		txDatabase = req.Database
	}

	// 对于 replace 模式，先 TRUNCATE
	if req.Mode == "replace" {
		truncateSQL := fmt.Sprintf("TRUNCATE TABLE %s", tableName)
		exec, err := h.mgr.GetExecutorForSession(req.ConnectionID, txDatabase, importTxSession, false)
		if err != nil {
			writeJSONError(w, err.Error())
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := exec.ExecContext(ctx, truncateSQL); err != nil {
			writeJSONError(w, fmt.Sprintf("TRUNCATE failed: %v", err))
			return
		}
	}

	// 开始导入事务（私有会话，与其他会话隔离）；
	// ClickHouse/TDengine 无交互式事务，跳过包装直接逐句执行（各自原子提交）
	if db.SupportsTx(dbType) {
		if err := h.mgr.BeginTransaction(req.ConnectionID, importTxSession, txDatabase); err != nil {
			writeJSONError(w, fmt.Sprintf("begin transaction failed: %v", err))
			return
		}
	}

	var successCount, failedCount int
	var lastError string

	if req.Mode == "update" && req.PrimaryKey != "" {
		// 逐行 UPDATE
		for _, row := range req.Rows {
			pkValue := row[req.PrimaryKey]
			if pkValue == nil {
				continue
			}

			setClauses := make([]string, 0)
			for col, val := range row {
				if col == req.PrimaryKey {
					continue
				}
				setClauses = append(setClauses, fmt.Sprintf("%s = %s", escapeIdentifier(col), formatValue(val)))
			}

			if len(setClauses) > 0 {
				sql := fmt.Sprintf("UPDATE %s SET %s WHERE %s = %s",
					tableName,
					strings.Join(setClauses, ", "),
					escapeIdentifier(req.PrimaryKey),
					formatValue(pkValue))

				exec, err := h.mgr.GetExecutorForSession(req.ConnectionID, txDatabase, importTxSession, false)
				if err != nil {
					failedCount++
					lastError = err.Error()
					continue
				}
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				_, err = exec.ExecContext(ctx, sql)
				cancel()
				if err != nil {
					failedCount++
					lastError = err.Error()
				} else {
					successCount++
				}
			}
		}
	} else {
		// 批量 INSERT：每批 100 条
		batchSize := 100
		for i := 0; i < len(req.Rows); i += batchSize {
			end := i + batchSize
			if end > len(req.Rows) {
				end = len(req.Rows)
			}
			batch := req.Rows[i:end]

			if len(batch) == 0 {
				continue
			}

			// 获取列名（使用第一行的键）
			var cols []string
			for col := range batch[0] {
				cols = append(cols, escapeIdentifier(col))
			}

			// 构建 VALUES 子句
			var valueGroups []string
			for _, row := range batch {
				var vals []string
				for _, col := range cols {
					// 从原始列名（无引号）获取值
					originalCol := strings.Trim(col, quoteChar+"[]")
					// 处理双引号转义后的列名
					if quoteChar == `"` {
						originalCol = strings.ReplaceAll(originalCol, `""`, `"`)
					}
					vals = append(vals, formatValue(row[originalCol]))
				}
				valueGroups = append(valueGroups, "("+strings.Join(vals, ", ")+")")
			}

			sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES %s",
				tableName,
				strings.Join(cols, ", "),
				strings.Join(valueGroups, ", "))

			exec, err := h.mgr.GetExecutorForSession(req.ConnectionID, txDatabase, importTxSession, false)
			if err != nil {
				// 批量失败，回退到逐行执行
				for _, row := range batch {
					var vals []string
					for _, col := range cols {
						originalCol := strings.Trim(col, quoteChar+"[]")
						if quoteChar == `"` {
							originalCol = strings.ReplaceAll(originalCol, `""`, `"`)
						}
						vals = append(vals, formatValue(row[originalCol]))
					}
					singleSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
						tableName,
						strings.Join(cols, ", "),
						strings.Join(vals, ", "))

					exec2, err := h.mgr.GetExecutorForSession(req.ConnectionID, txDatabase, importTxSession, false)
					if err != nil {
						failedCount++
						lastError = err.Error()
						continue
					}
					ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
					_, err = exec2.ExecContext(ctx, singleSQL)
					cancel()
					if err != nil {
						failedCount++
						lastError = err.Error()
					} else {
						successCount++
					}
				}
				continue
			}

			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			_, err = exec.ExecContext(ctx, sql)
			cancel()
			if err != nil {
				// 批量失败，回退到逐行执行以获取具体失败行
				for _, row := range batch {
					var vals []string
					for _, col := range cols {
						originalCol := strings.Trim(col, quoteChar+"[]")
						if quoteChar == `"` {
							originalCol = strings.ReplaceAll(originalCol, `""`, `"`)
						}
						vals = append(vals, formatValue(row[originalCol]))
					}
					singleSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
						tableName,
						strings.Join(cols, ", "),
						strings.Join(vals, ", "))

					exec2, err := h.mgr.GetExecutorForSession(req.ConnectionID, txDatabase, importTxSession, false)
					if err != nil {
						failedCount++
						lastError = err.Error()
						continue
					}
					ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
					_, err = exec2.ExecContext(ctx2, singleSQL)
					cancel2()
					if err != nil {
						failedCount++
						lastError = err.Error()
					} else {
						successCount++
					}
				}
			} else {
				successCount += len(batch)
			}
		}
	}

	committed, err := h.mgr.CommitTransaction(req.ConnectionID, importTxSession)
	if db.SupportsTx(dbType) {
		if err != nil {
			// 提交失败，尝试回滚
			_, _ = h.mgr.RollbackTransaction(req.ConnectionID, importTxSession)
			writeJSONError(w, fmt.Sprintf("commit failed: %v", err))
			return
		}
		if !committed {
			// 没有等待提交的事务：它已被看门狗回收，前面的行随事务回滚、后面的语句被拒绝，
			// 一行都没导进去，不能按 successCount / failedCount 报成功
			writeJSONError(w, "the import transaction was rolled back by the inactivity timeout before it could be committed; no rows were imported")
			return
		}
	}

	resp := models.BatchImportResponse{
		SuccessCount: successCount,
		FailedCount:  failedCount,
		TotalCount:   len(req.Rows),
	}
	if failedCount > 0 {
		resp.LastError = lastError
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func formatValue(v interface{}) string {
	if v == nil {
		return "NULL"
	}
	switch val := v.(type) {
	case string:
		return fmt.Sprintf("'%s'", strings.ReplaceAll(strings.ReplaceAll(val, "\\", "\\\\"), "'", "''"))
	case bool:
		if val {
			return "TRUE"
		}
		return "FALSE"
	case float64:
		if val == float64(int64(val)) {
			return strconv.FormatInt(int64(val), 10)
		}
		return strconv.FormatFloat(val, 'f', -1, 64)
	case int:
		return strconv.Itoa(val)
	case int64:
		return strconv.FormatInt(val, 10)
	default:
		return fmt.Sprintf("'%v'", val)
	}
}
