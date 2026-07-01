package backend

import (
	"encoding/json"

	"idblink/backend/api"
)

// ==================== 事务控制 ====================

// BeginTransaction 开启事务
func (a *App) BeginTransaction(connectionID string) error {
	req := api.TransactionRequest{ConnectionID: connectionID}
	_, err := callHandler(a.handler.BeginTransaction, req)
	return err
}

// CommitTransaction 提交事务
func (a *App) CommitTransaction(connectionID string) error {
	req := api.TransactionRequest{ConnectionID: connectionID}
	_, err := callHandler(a.handler.CommitTransaction, req)
	return err
}

// RollbackTransaction 回滚事务
func (a *App) RollbackTransaction(connectionID string) error {
	req := api.TransactionRequest{ConnectionID: connectionID}
	_, err := callHandler(a.handler.RollbackTransaction, req)
	return err
}

// GetTransactionStatus 获取事务状态
func (a *App) GetTransactionStatus(connectionID string) (bool, error) {
	req := api.TransactionRequest{ConnectionID: connectionID}
	respBytes, err := callHandler(a.handler.GetTransactionStatus, req)
	if err != nil {
		return false, err
	}

	var result struct {
		Active bool `json:"active"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return false, err
	}
	return result.Active, nil
}
