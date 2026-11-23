package backend

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"idblink/backend/api"
	"idblink/backend/models"
)

// ==================== 流式导出 ====================

// StreamExportTable 流式导出完整表数据
func (a *App) StreamExportTable(connectionID string, tableName string, database *string, batchSize *int, whereClause *string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := models.StreamExportRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
		BatchSize:    1000,
	}
	if database != nil {
		req.Database = *database
	}
	if batchSize != nil {
		req.BatchSize = *batchSize
	}
	if whereClause != nil {
		req.WhereClause = *whereClause
	}

	respBytes, err := callHandler(a.handler.StreamExport, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ==================== 查询结果全量服务端导出 ====================

// ExportQueryResultToFileResult 服务端全量导出结果
type ExportQueryResultToFileResult struct {
	Rows    int64 `json:"rows"`
	Total   int64 `json:"total"`     // COUNT 预统计的总行数（-1 表示未知）
	Elapsed int64 `json:"elapsedMs"` // 导出阶段用时（毫秒，不含 COUNT）
}

// ExportQueryResultToFile 服务端全量导出：执行 SQL（不受编辑器最大行数限制），
// 流式写入指定文件。用于「查询只取回前 N 行、但要导全部匹配数据」的场景。
// 格式支持 csv/json/txt/xml/md/xlsx（xlsx 经 excelize 流式生成；超过 Excel
// 单表行数上限时报错并提示改用 CSV/JSON，不产生半截文件）。
// 超时 30 分钟：几十万行的导出通常秒级～分钟级，留足余量。
func (a *App) ExportQueryResultToFile(connectionID string, sql string, database string, format string, path string) (ExportQueryResultToFileResult, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return ExportQueryResultToFileResult{}, err
	}
	exec, err := a.dbManager.GetExecutor(connectionID, database)
	if err != nil {
		return ExportQueryResultToFileResult{}, err
	}
	dbType, err := a.dbManager.GetDBType(connectionID)
	if err != nil {
		return ExportQueryResultToFileResult{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	emitProgress := func(phase string, total, rows, elapsedMs int64) {
		if app := application.Get(); app != nil {
			app.Event.Emit("export-progress", map[string]interface{}{
				"path": path, "phase": phase, "total": total, "rows": rows, "elapsedMs": elapsedMs,
			})
		}
	}

	// 预统计总行数（失败降级为未知总量：进度条转不确定模式）
	q := strings.TrimSpace(sql)
	q = strings.TrimSuffix(q, ";")
	total := int64(-1)
	emitProgress("counting", -1, 0, 0)
	countSQL := "SELECT COUNT(*) FROM (" + q + ") __idblink_cnt__"
	cCtx, cCancel := context.WithTimeout(ctx, 5*time.Minute)
	var n int64
	if err := exec.QueryRowContext(cCtx, countSQL).Scan(&n); err == nil {
		total = n
	}
	cCancel()
	emitProgress("exporting", total, 0, 0)

	// 进度节流：行粒度 1000 已在底层控制，再按时间 ≥150ms 一帧防 IPC 洪泛
	start := time.Now()
	var lastEmit time.Time
	rows, err := api.StreamQueryResultToFile(ctx, exec, dbType, q, format, path, func(_, done int64) {
		now := time.Now()
		if now.Sub(lastEmit) < 150*time.Millisecond {
			return
		}
		lastEmit = now
		emitProgress("exporting", total, done, now.Sub(start).Milliseconds())
	})
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return ExportQueryResultToFileResult{}, err
	}
	return ExportQueryResultToFileResult{Rows: rows, Total: total, Elapsed: elapsed}, nil
}
