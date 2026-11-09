package backend

import (
	"encoding/json"
	"time"

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

// ExecuteQueryLimited 执行 SQL 查询并限制返回行数（编辑器传设置里的最大行数，
// 防止 SELECT 把整表拉回本地；MCP 等自动化调用方同样使用）。
// maxRows <= 0 表示不限制；达到上限时结果携带 truncated=true 且不再继续扫描。
// useTransaction 语义与 ExecuteQuery 相同（显式 false 绕过活跃事务）。
func (a *App) ExecuteQueryLimited(connectionID string, sql string, database *string, useTransaction *bool, maxRows int) (models.QueryResult, error) {
	a.queryStarted()
	defer a.queryFinished()
	return a.executeQuery(connectionID, sql, database, useTransaction, &maxRows)
}

func (a *App) executeQuery(connectionID string, sql string, database *string, useTransaction *bool, maxRows *int) (models.QueryResult, error) {
	result, err := a.executeQueryCore(connectionID, sql, database, useTransaction, maxRows)
	if err != nil {
		return result, err
	}
	errMsg := ""
	if result.Error != "" {
		errMsg = result.Error
	}
	_ = a.storage.RecordHistory(connectionID, "query", result.Error == "", errMsg)
	return result, nil
}

// executeQueryCore 不写历史的查询执行体（ExecuteScriptBatch 逐语句复用，
// 整个脚本只记一条历史，避免逐语句 SQLite 提交的 fsync 开销）。
func (a *App) executeQueryCore(connectionID string, sql string, database *string, useTransaction *bool, maxRows *int) (models.QueryResult, error) {
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
	// 查询成功即证明连接可用，刷新存活时间戳（TTL 内后续查询跳过 Ping）；
	// 出错则标记可疑：若是连接类错误，下一次 ensureConnected 仍走 Ping → 重连自愈
	if result.Error == "" {
		a.markConnAlive(connectionID)
	} else {
		a.markConnSuspect(connectionID)
	}
	return result, nil
}

// ExecuteScriptBatch 批量顺序执行整个脚本（编辑器多语句执行）：
// 一次绑定调用执行全部语句，省去逐语句 IPC 往返与逐语句历史提交。
// 语句出错不中断（与既有逐条执行语义一致）；逐语句结果在 results 中，
// 单语句耗时在 results[i].execution_time_ms。
// cancelToken 非空时，CancelScriptBatch(cancelToken) 置位后在语句间提前停止。
func (a *App) ExecuteScriptBatch(connectionID string, statements []string, database *string, useTransaction *bool, maxRows int, cancelToken string) (models.ScriptResult, error) {
	a.queryStarted()
	defer a.queryFinished()
	if cancelToken != "" {
		defer a.scriptCancels.Delete(cancelToken)
	}

	start := time.Now()
	result := models.ScriptResult{Results: make([]models.QueryResult, 0, len(statements))}
	var maxRowsPtr *int
	if maxRows > 0 {
		maxRowsPtr = &maxRows
	}
	allOK := true
	firstErr := ""

	for _, stmt := range statements {
		if cancelToken != "" {
			if _, cancelled := a.scriptCancels.Load(cancelToken); cancelled {
				result.Cancelled = true
				break
			}
		}
		res, err := a.executeQueryCore(connectionID, stmt, database, useTransaction, maxRowsPtr)
		if err != nil {
			res = models.QueryResult{Error: err.Error()}
		}
		if res.Error != "" {
			allOK = false
			if firstErr == "" {
				firstErr = res.Error
			}
		}
		result.Results = append(result.Results, res)
	}

	result.TotalTimeMs = time.Since(start).Milliseconds()
	_ = a.storage.RecordHistory(connectionID, "query", allOK, firstErr)
	return result, nil
}

// CancelScriptBatch 请求中止指定 token 的脚本批量执行（语句间生效）。
func (a *App) CancelScriptBatch(cancelToken string) {
	if cancelToken != "" {
		a.scriptCancels.Store(cancelToken, true)
	}
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
