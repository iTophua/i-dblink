package backend

import (
	"context"
	"encoding/json"
	"time"

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
	Rows int64 `json:"rows"`
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

	rows, err := api.StreamQueryResultToFile(ctx, exec, dbType, sql, format, path)
	if err != nil {
		return ExportQueryResultToFileResult{}, err
	}
	return ExportQueryResultToFileResult{Rows: rows}, nil
}
