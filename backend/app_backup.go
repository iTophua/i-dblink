package backend

import (
	"encoding/json"

	"idblink/backend/api"
)

// ==================== 备份恢复 ====================

// CheckBackupTool 检测备份工具
func (a *App) CheckBackupTool(dbType string) (map[string]interface{}, error) {
	req := api.BackupToolCheckRequest{DbType: dbType}
	respBytes, err := callHandler(a.handler.CheckBackupTool, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// BackupDatabase 备份数据库
func (a *App) BackupDatabase(connectionID string, database string, tables []string, includeStructure bool, includeData bool, filePath string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.BackupRequest{
		ConnectionID:     connectionID,
		Database:         database,
		Tables:           tables,
		IncludeStructure: includeStructure,
		IncludeData:      includeData,
		FilePath:         filePath,
	}

	respBytes, err := callHandler(a.handler.Backup, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// RestoreDatabase 恢复数据库
func (a *App) RestoreDatabase(connectionID string, database string, filePath string) (map[string]interface{}, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.RestoreRequest{
		ConnectionID: connectionID,
		Database:     database,
		FilePath:     filePath,
	}

	respBytes, err := callHandler(a.handler.Restore, req)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}
