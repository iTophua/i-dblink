package backend

import (
	"encoding/json"

	"idblink/backend/api"
	"idblink/backend/models"
)

// ==================== 结构比较与批量导入 ====================

// CompareSchema 比较数据库/表结构
func (a *App) CompareSchema(sourceConnectionID string, sourceDatabase string, targetConnectionID string, targetDatabase string, tableName *string) (map[string]interface{}, error) {
	if err := a.ensureConnected(sourceConnectionID); err != nil {
		return nil, err
	}
	if err := a.ensureConnected(targetConnectionID); err != nil {
		return nil, err
	}

	req := api.CompareSchemaRequest{
		SourceConnID: sourceConnectionID,
		SourceDB:     sourceDatabase,
		TargetConnID: targetConnectionID,
		TargetDB:     targetDatabase,
	}
	if tableName != nil {
		req.TableName = *tableName
	}

	respBytes, err := callHandler(a.handler.CompareSchema, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// BatchImport 批量导入数据
func (a *App) BatchImport(connectionID string, database *string, tableName string, mode string, primaryKey *string, rows []map[string]interface{}) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := models.BatchImportRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
		Mode:         mode,
		Rows:         rows,
	}
	if database != nil {
		req.Database = *database
	}
	if primaryKey != nil {
		req.PrimaryKey = *primaryKey
	}

	respBytes, err := callHandler(a.handler.BatchImport, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}
