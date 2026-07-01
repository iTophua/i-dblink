package backend

import (
	"encoding/json"

	"idblink/backend/models"
)

// ==================== 查询与 DDL ====================

// ExecuteQuery 执行 SQL 查询
func (a *App) ExecuteQuery(connectionID string, sql string, database *string) (models.QueryResult, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.QueryResult{}, err
	}

	req := models.QueryRequest{
		ConnectionID: connectionID,
		SQL:          sql,
		Database:     "",
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.Query, req)
	if err != nil {
		return models.QueryResult{}, err
	}

	var result models.QueryResult
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.QueryResult{}, err
	}
	errMsg := ""
	if result.Error != "" {
		errMsg = result.Error
	}
	_ = a.storage.RecordHistory(connectionID, "query", result.Error == "", errMsg)
	return result, nil
}

// ExecuteDDL 执行 DDL 语句
func (a *App) ExecuteDDL(connectionID string, sql string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.ExecuteDDLRequest{
		ConnectionID: connectionID,
		SQL:          sql,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.ExecuteDDL, req)
	return err
}

// TruncateTable 清空表
func (a *App) TruncateTable(connectionID string, tableName string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.TableOperationRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.TruncateTable, req)
	return err
}

// DropTable 删除表
func (a *App) DropTable(connectionID string, tableName string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.TableOperationRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.DropTable, req)
	return err
}

// DropView 删除视图
func (a *App) DropView(connectionID string, viewName string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.TableOperationRequest{
		ConnectionID: connectionID,
		ViewName:     viewName,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.DropView, req)
	return err
}

// RenameTable 重命名表
func (a *App) RenameTable(connectionID string, oldName string, newName string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.RenameTableRequest{
		ConnectionID: connectionID,
		OldName:      oldName,
		NewName:      newName,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.RenameTable, req)
	return err
}

// MaintainTable 表维护操作
func (a *App) MaintainTable(connectionID string, tableName string, operation string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := models.TableMaintenanceRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
		Operation:    operation,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.MaintainTable, req)
	return err
}
