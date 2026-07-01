package backend

import (
	"encoding/json"

	"idblink/backend/models"
)

// ==================== 流式导出 ====================

// StreamExportTable 流式导出完整表数据
func (a *App) StreamExportTable(connectionID string, tableName string, database *string, batchSize *int) (map[string]interface{}, error) {
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
