package backend

import (
	"context"
	"errors"
	"strings"
	"time"

	"idblink/backend/api"
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
	ctx, cancel := context.WithTimeout(context.Background(), api.LongOpTimeout)
	defer cancel()
	result, err := a.executeQueryCore(ctx, connectionID, sql, database, useTransaction, maxRows)
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
// 走 ExecuteQueryDirect 直通路径：不经 callHandler 的 JSON 编解码，
// 大结果集省两次全量序列化。ctx 控制本条语句的超时与取消。
func (a *App) executeQueryCore(ctx context.Context, connectionID string, sql string, database *string, useTransaction *bool, maxRows *int) (models.QueryResult, error) {
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

	result := a.handler.ExecuteQueryDirect(ctx, &req)
	// 查询成功即证明连接可用，刷新存活时间戳（TTL 内后续查询跳过 Ping）；
	// 出错则标记可疑：若是连接类错误，下一次 ensureConnected 仍走 Ping → 重连自愈
	if result.Error == "" {
		a.markConnAlive(connectionID)
	} else {
		a.markConnSuspect(connectionID)
	}
	return *result, nil
}

// ExecuteScriptBatch 批量顺序执行整个脚本（编辑器多语句与单语句执行共用）：
// 一次绑定调用执行全部语句，省去逐语句 IPC 往返与逐语句历史提交。
// 语句出错不中断（与既有逐条执行语义一致）；逐语句结果在 results 中，
// 单语句耗时在 results[i].execution_time_ms。
// cancelToken 非空时注册到取消表：CancelScriptBatch(token) 取消脚本级 ctx，
// 正在执行的语句经驱动 ctx 监视器立即中断，未开始的语句在语句间跳过，
// 结果携带 cancelled=true。
func (a *App) ExecuteScriptBatch(connectionID string, statements []string, database *string, useTransaction *bool, maxRows int, cancelToken string) (models.ScriptResult, error) {
	a.queryStarted()
	defer a.queryFinished()

	// 脚本级 ctx：无总超时（语句数 × 单句上限由各语句自行约束），
	// 取消是唯一的全局停止阀
	scriptCtx := context.Background()
	var cancelScript context.CancelFunc
	if cancelToken != "" {
		scriptCtx, cancelScript = context.WithCancel(context.Background())
		defer cancelScript()
		defer a.scriptCancels.Delete(cancelToken)
		a.scriptCancels.Store(cancelToken, cancelScript)
	}

	start := time.Now()
	result := models.ScriptResult{Results: make([]models.QueryResult, 0, len(statements))}
	var maxRowsPtr *int
	if maxRows > 0 {
		maxRowsPtr = &maxRows
	}
	allOK := true
	firstErr := ""

	stopped := false
	for _, stmt := range statements {
		// 语句间取消检查：未开始的语句直接跳过
		if scriptCtx.Err() != nil {
			stopped = true
			break
		}

		// 单语句超时从脚本 ctx 派生：取消向上传播、超时各自独立
		stmtCtx, cancelStmt := context.WithTimeout(scriptCtx, api.LongOpTimeout)
		res, err := a.executeQueryCore(stmtCtx, connectionID, stmt, database, useTransaction, maxRowsPtr)
		cancelStmt()
		if err != nil {
			res = models.QueryResult{Error: err.Error()}
		}
		// 用户取消导致本条中断：不计为失败，也不追加半截结果
		if isContextCanceled(scriptCtx, res.Error) {
			stopped = true
			break
		}
		if res.Error != "" {
			allOK = false
			if firstErr == "" {
				firstErr = res.Error
			}
		}
		result.Results = append(result.Results, res)
	}
	if stopped {
		result.Cancelled = true
	}

	result.TotalTimeMs = time.Since(start).Milliseconds()
	_ = a.storage.RecordHistory(connectionID, "query", allOK && !stopped, firstErr)
	return result, nil
}

// isContextCanceled 判断语句错误是否源于脚本被用户取消
// （驱动/scan 返回 "context canceled"，可能带包装前缀；需与超时
// "context deadline exceeded" 区分——只有 Cancel 才算用户主动停止）。
func isContextCanceled(scriptCtx context.Context, errMsg string) bool {
	if scriptCtx == nil || !errors.Is(scriptCtx.Err(), context.Canceled) {
		return false
	}
	return errMsg == "context canceled" || strings.HasSuffix(errMsg, ": context canceled")
}

// CancelScriptBatch 中止指定 token 的脚本执行：
// 取消脚本级 ctx——正在执行的语句立即中断（驱动 ctx 监视器关闭查询），
// 未开始的语句在语句间跳过。幂等：token 不存在或已结束时为 no-op。
func (a *App) CancelScriptBatch(cancelToken string) {
	if cancelToken == "" {
		return
	}
	if v, ok := a.scriptCancels.LoadAndDelete(cancelToken); ok {
		if cancel, ok := v.(context.CancelFunc); ok {
			cancel()
		}
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
