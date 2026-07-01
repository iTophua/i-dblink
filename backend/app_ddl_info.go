package backend

import (
	"encoding/json"
	"fmt"

	"idblink/backend/api"
)

// ==================== 服务器信息与元数据 ====================

// GetServerInfo 获取数据库服务器信息
func (a *App) GetServerInfo(connectionID string, database *string) (ServerInfo, error) {
	req := api.ServerInfoRequest{
		ConnectionID: connectionID,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetServerInfo, req)
	if err != nil {
		return ServerInfo{}, err
	}

	var result ServerInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return ServerInfo{}, err
	}
	return result, nil
}

// GetTableDDL 获取建表语句
func (a *App) GetTableDDL(connectionID string, tableName string, database *string) ([]string, error) {
	req := api.GetTableDDLRequest{
		ConnectionID: connectionID,
		TableName:    tableName,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetTableDDL, req)
	if err != nil {
		return nil, err
	}

	var result struct {
		DDLs []string `json:"ddls"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result.DDLs, nil
}

// GetServerStatus 获取综合服务器状态
func (a *App) GetServerStatus(connectionID string) (api.ServerStatus, error) {
	req := api.ServerStatusRequest{
		ConnectionID: connectionID,
	}

	respBytes, err := callHandlerRaw(a.handler.GetServerStatus, req)
	if err != nil {
		return api.ServerStatus{}, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return api.ServerStatus{}, fmt.Errorf("%s", errResp.Error)
	}

	var result api.ServerStatus
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return api.ServerStatus{}, fmt.Errorf("failed to parse server status response: %w", err)
	}
	return result, nil
}

// GetDatabaseDDL 获取建库语句
func (a *App) GetDatabaseDDL(connectionID string, database string) (string, error) {
	req := api.GetDatabaseDDLRequest{
		ConnectionID: connectionID,
		Database:     database,
	}

	respBytes, err := callHandler(a.handler.GetDatabaseDDL, req)
	if err != nil {
		return "", err
	}

	var result struct {
		DDL string `json:"ddl"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}
	return result.DDL, nil
}

// GetTriggers 获取触发器列表
func (a *App) GetTriggers(connectionID string, database *string) ([]map[string]interface{}, error) {
	req := api.GetTriggersRequest{
		ConnectionID: connectionID,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetTriggers, req)
	if err != nil {
		return nil, err
	}

	var result struct {
		Triggers []map[string]interface{} `json:"triggers"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result.Triggers, nil
}

// GetEvents 获取事件列表
func (a *App) GetEvents(connectionID string, database *string) ([]map[string]interface{}, error) {
	req := api.GetEventsRequest{
		ConnectionID: connectionID,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetEvents, req)
	if err != nil {
		return nil, err
	}

	var result struct {
		Events []map[string]interface{} `json:"events"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result.Events, nil
}
