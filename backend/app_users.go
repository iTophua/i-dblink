package backend

import (
	"encoding/json"

	"idblink/backend/api"
	"idblink/backend/models"
)

// ==================== 用户权限管理 ====================

// GetUsers 获取用户列表
func (a *App) GetUsers(connectionID string, database *string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := models.MetadataRequest{ConnectionID: connectionID}
	if database != nil {
		db := *database
		req.Database = &db
	}

	respBytes, err := callHandler(a.handler.GetUsers, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetUserPrivileges 获取用户权限
func (a *App) GetUserPrivileges(connectionID string, username string, host string, database *string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.GetUserPrivilegesRequest{
		ConnectionID: connectionID,
		Username:     username,
		Host:         host,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetPrivileges, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTablePrivileges 获取表级权限
func (a *App) GetTablePrivileges(connectionID string, username string, host string, database *string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.GetUserPrivilegesRequest{
		ConnectionID: connectionID,
		Username:     username,
		Host:         host,
	}
	if database != nil {
		req.Database = *database
	}

	respBytes, err := callHandler(a.handler.GetTablePrivileges, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// CreateUser 创建用户
func (a *App) CreateUser(connectionID string, username string, password string, host string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := api.CreateUserRequest{
		ConnectionID: connectionID,
		Username:     username,
		Password:     password,
		Host:         host,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.CreateUser, req)
	return err
}

// DropUser 删除用户
func (a *App) DropUser(connectionID string, username string, host string, database *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := api.DropUserRequest{
		ConnectionID: connectionID,
		Username:     username,
		Host:         host,
	}
	if database != nil {
		req.Database = *database
	}

	_, err := callHandler(a.handler.DropUser, req)
	return err
}

// GrantPrivilege 授予权限
func (a *App) GrantPrivilege(connectionID string, username string, host string, privileges []string, databaseAll bool, database *string, table *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := api.GrantRequest{
		ConnectionID: connectionID,
		Username:     username,
		Host:         host,
		Privileges:   privileges,
		DatabaseAll:  databaseAll,
	}
	if database != nil {
		req.Database = *database
	}
	if table != nil {
		req.Table = *table
	}

	_, err := callHandler(a.handler.GrantPrivilege, req)
	return err
}

// RevokePrivilege 撤销权限
func (a *App) RevokePrivilege(connectionID string, username string, host string, privileges []string, databaseAll bool, database *string, table *string) error {
	if err := a.ensureConnected(connectionID); err != nil {
		return err
	}

	req := api.RevokeRequest{
		ConnectionID: connectionID,
		Username:     username,
		Host:         host,
		Privileges:   privileges,
		DatabaseAll:  databaseAll,
	}
	if database != nil {
		req.Database = *database
	}
	if table != nil {
		req.Table = *table
	}

	_, err := callHandler(a.handler.RevokePrivilege, req)
	return err
}
