package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

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

// CompareTableData 按主键比对两张表的数据，并生成把目标表同步成源表的 SQL。
// 只做比对和生成，不执行任何写操作。
func (a *App) CompareTableData(req models.DataCompareRequest) (*models.DataCompareResult, error) {
	if err := a.ensureConnected(req.SourceConnectionID); err != nil {
		return nil, fmt.Errorf("source connection: %w", err)
	}
	if err := a.ensureConnected(req.TargetConnectionID); err != nil {
		return nil, fmt.Errorf("target connection: %w", err)
	}
	start := time.Now()
	result, err := a.handler.CompareTableData(context.Background(), &req)
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}
	logAPICall("CompareTableData", time.Since(start), errMsg)
	return result, err
}
