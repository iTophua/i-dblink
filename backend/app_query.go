package backend

import (
	"encoding/json"

	"idblink/backend/models"
)

// ==================== 查询与 DDL ====================

// ExecuteQuery 执行 SQL 查询。useTransaction 显式传 false 时绕过活跃事务
// 走自动提交（nil/true 保持默认：该连接有活跃事务则进事务）。
func (a *App) ExecuteQuery(connectionID string, sql string, database *string, useTransaction *bool) (models.QueryResult, error) {
	a.queryStarted()
	defer a.queryFinished()
	return a.executeQuery(connectionID, sql, database, useTransaction, nil)
}

// ExecuteQueryLimited 执行 SQL 查询并限制返回行数（MCP 等自动化调用方使用，
// 防止无界 SELECT 撑爆调用方上下文）。maxRows <= 0 表示不限制；
// 达到上限时结果携带 truncated=true 且不再继续扫描。
func (a *App) ExecuteQueryLimited(connectionID string, sql string, database *string, maxRows int) (models.QueryResult, error) {
	a.queryStarted()
	defer a.queryFinished()
	return a.executeQuery(connectionID, sql, database, nil, &maxRows)
}

func (a *App) executeQuery(connectionID string, sql string, database *string, useTransaction *bool, maxRows *int) (models.QueryResult, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.QueryResult{}, err
	}

	req := models.QueryRequest{
		ConnectionID:   connectionID,
		SQL:            sql,
		Database:       "",
		UseTransaction: useTransaction,
		MaxRows:        maxRows,
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
	a.queryStarted()
	defer a.queryFinished()
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
