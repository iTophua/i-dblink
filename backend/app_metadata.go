package backend

import (
	"encoding/json"
	"fmt"

	"idblink/backend/api"
	"idblink/backend/models"
)

// ==================== 数据库元数据 ====================

// GetDatabases 获取数据库列表
func (a *App) GetDatabases(connectionID string) ([]string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID}
	respBytes, err := callHandler(a.handler.GetDatabases, req)
	if err != nil {
		return nil, err
	}

	var result []string
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTables 获取表列表
func (a *App) GetTables(connectionID string, database *string) ([]models.TableInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandler(a.handler.GetTables, req)
	if err != nil {
		return nil, err
	}

	var result []models.TableInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTablesCategorized 获取分类的表和视图
func (a *App) GetTablesCategorized(connectionID string, database *string, search *string) (models.TablesResult, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.TablesResult{}, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, Search: search}
	respBytes, err := callHandler(a.handler.GetTablesCategorized, req)
	if err != nil {
		return models.TablesResult{}, err
	}

	var result models.TablesResult
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.TablesResult{}, err
	}
	return result, nil
}

// GetTableStructure 获取完整的表结构
func (a *App) GetTableStructure(connectionID string, tableName string, database *string) (models.TableStructure, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.TableStructure{}, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, TableName: &tableName}
	respBytes, err := callHandler(a.handler.GetTableStructure, req)
	if err != nil {
		return models.TableStructure{}, err
	}

	var result models.TableStructure
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.TableStructure{}, err
	}
	return result, nil
}

// GetColumns 获取列信息
func (a *App) GetColumns(connectionID string, tableName string, database *string) ([]models.ColumnInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, TableName: &tableName}
	respBytes, err := callHandlerRaw(a.handler.GetColumns, req)
	if err != nil {
		return nil, err
	}

	// 检查错误：向上传递，而非吞成空数组（否则前端误以为无数据）
	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return nil, fmt.Errorf("%s", errResp.Error)
	}

	var result []models.ColumnInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse columns response: %w", err)
	}
	return result, nil
}

// GetAllColumns 批量获取所有表的列信息
func (a *App) GetAllColumns(connectionID string, database *string) (models.AllColumnsResult, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandlerRaw(a.handler.GetAllColumns, req)
	if err != nil {
		return models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}, fmt.Errorf("%s", errResp.Error)
	}

	var result models.AllColumnsResult
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}, fmt.Errorf("failed to parse all columns response: %w", err)
	}
	if result.Tables == nil {
		result.Tables = make(map[string][]models.ColumnInfo)
	}
	return result, nil
}

// GetIndexes 获取索引信息
func (a *App) GetIndexes(connectionID string, tableName string, database *string) ([]models.IndexInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, TableName: &tableName}
	respBytes, err := callHandlerRaw(a.handler.GetIndexes, req)
	if err != nil {
		return nil, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return nil, fmt.Errorf("%s", errResp.Error)
	}

	var result []models.IndexInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse indexes response: %w", err)
	}
	return result, nil
}

// GetForeignKeys 获取外键信息
func (a *App) GetForeignKeys(connectionID string, tableName string, database *string) ([]models.ForeignKeyInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, TableName: &tableName}
	respBytes, err := callHandlerRaw(a.handler.GetForeignKeys, req)
	if err != nil {
		return nil, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return nil, fmt.Errorf("%s", errResp.Error)
	}

	var result []models.ForeignKeyInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse foreign keys response: %w", err)
	}
	return result, nil
}

// GetProcedures 获取存储过程列表
func (a *App) GetProcedures(connectionID string, database *string) ([]string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandler(a.handler.GetProcedures, req)
	if err != nil {
		return nil, err
	}

	var result []string
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetFunctions 获取函数列表
func (a *App) GetFunctions(connectionID string, database *string) ([]string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandler(a.handler.GetFunctions, req)
	if err != nil {
		return nil, err
	}

	var result []string
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetProcedureBody 获取存储过程定义
func (a *App) GetProcedureBody(connectionID string, procedureName string, database *string) (string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return "", err
	}

	req := struct {
		ConnectionID  string `json:"connection_id"`
		ProcedureName string `json:"procedure_name"`
		Database      string `json:"database,omitempty"`
	}{
		ConnectionID:  connectionID,
		ProcedureName: procedureName,
		Database:      strVal(database),
	}
	respBytes, err := callHandler(a.handler.GetProcedureBody, req)
	if err != nil {
		return "", err
	}

	var result struct {
		Body string `json:"body"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}
	return result.Body, nil
}

// GetFunctionBody 获取函数定义
func (a *App) GetFunctionBody(connectionID string, functionName string, database *string) (string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return "", err
	}

	req := struct {
		ConnectionID string `json:"connection_id"`
		FunctionName string `json:"function_name"`
		Database     string `json:"database,omitempty"`
	}{
		ConnectionID: connectionID,
		FunctionName: functionName,
		Database:     strVal(database),
	}
	respBytes, err := callHandler(a.handler.GetFunctionBody, req)
	if err != nil {
		return "", err
	}

	var result struct {
		Body string `json:"body"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}
	return result.Body, nil
}

// GetRoutines 获取存储过程和函数列表
func (a *App) GetRoutines(connectionID string, database *string) (models.RoutinesResult, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.RoutinesResult{}, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandler(a.handler.GetRoutines, req)
	if err != nil {
		return models.RoutinesResult{}, err
	}

	var result models.RoutinesResult
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.RoutinesResult{}, err
	}
	return result, nil
}

// GetProcessList 获取数据库进程列表
func (a *App) GetProcessList(connectionID string, database *string) ([]api.ProcessInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.ProcessListRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandlerRaw(a.handler.GetProcessList, req)
	if err != nil {
		return nil, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return nil, fmt.Errorf("%s", errResp.Error)
	}

	var result []api.ProcessInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse process list response: %w", err)
	}
	return result, nil
}

// KillProcess 终止数据库进程
func (a *App) KillProcess(connectionID string, database string, processID string, serial string) (models.GenericResponse, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.GenericResponse{Error: err.Error()}, err
	}

	req := api.KillProcessRequest{
		ConnectionID: connectionID,
		Database:     database,
		ProcessID:    processID,
		Serial:       serial,
	}
	respBytes, err := callHandler(a.handler.KillProcess, req)
	if err != nil {
		return models.GenericResponse{Error: err.Error()}, err
	}

	var result models.GenericResponse
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.GenericResponse{}, err
	}
	return result, nil
}

// GetSequences 获取序列列表
func (a *App) GetSequences(connectionID string, database *string) ([]models.SequenceInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandlerRaw(a.handler.GetSequences, req)
	if err != nil {
		return nil, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return nil, fmt.Errorf("%s", errResp.Error)
	}

	var result []models.SequenceInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse sequences response: %w", err)
	}
	return result, nil
}

// ResetSequence 重置序列值
func (a *App) ResetSequence(connectionID string, database string, sequenceName string, value int64) (models.GenericResponse, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.GenericResponse{Error: err.Error()}, err
	}

	req := struct {
		ConnectionID string `json:"connection_id"`
		Database     string `json:"database,omitempty"`
		SequenceName string `json:"sequence_name"`
		Value        int64  `json:"value"`
	}{
		ConnectionID: connectionID,
		Database:     database,
		SequenceName: sequenceName,
		Value:        value,
	}
	respBytes, err := callHandler(a.handler.ResetSequence, req)
	if err != nil {
		return models.GenericResponse{Error: err.Error()}, err
	}

	var result models.GenericResponse
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.GenericResponse{}, err
	}
	return result, nil
}

// GetSchemas 获取 Schema 列表
func (a *App) GetSchemas(connectionID string, database *string) ([]string, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database}
	respBytes, err := callHandlerRaw(a.handler.GetSchemas, req)
	if err != nil {
		return nil, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return nil, fmt.Errorf("%s", errResp.Error)
	}

	var result []string
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse schemas response: %w", err)
	}
	return result, nil
}

// CreateSchema 创建 Schema
func (a *App) CreateSchema(connectionID string, database string, schemaName string) (models.GenericResponse, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.GenericResponse{Error: err.Error()}, err
	}

	req := struct {
		ConnectionID string `json:"connection_id"`
		Database     string `json:"database,omitempty"`
		SchemaName   string `json:"schema_name"`
	}{
		ConnectionID: connectionID,
		Database:     database,
		SchemaName:   schemaName,
	}
	respBytes, err := callHandler(a.handler.CreateSchema, req)
	if err != nil {
		return models.GenericResponse{Error: err.Error()}, err
	}

	var result models.GenericResponse
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.GenericResponse{}, err
	}
	return result, nil
}

// DropSchema 删除 Schema
func (a *App) DropSchema(connectionID string, database string, schemaName string) (models.GenericResponse, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return models.GenericResponse{Error: err.Error()}, err
	}

	req := struct {
		ConnectionID string `json:"connection_id"`
		Database     string `json:"database,omitempty"`
		SchemaName   string `json:"schema_name"`
	}{
		ConnectionID: connectionID,
		Database:     database,
		SchemaName:   schemaName,
	}
	respBytes, err := callHandler(a.handler.DropSchema, req)
	if err != nil {
		return models.GenericResponse{Error: err.Error()}, err
	}

	var result models.GenericResponse
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return models.GenericResponse{}, err
	}
	return result, nil
}

// GetCheckConstraints 获取 CHECK 约束列表
func (a *App) GetCheckConstraints(connectionID string, tableName string, database *string) ([]models.CheckConstraintInfo, error) {
	if err := a.ensureConnected(connectionID); err != nil {
		return nil, err
	}

	req := api.MetadataRequest{ConnectionID: connectionID, Database: database, TableName: &tableName}
	respBytes, err := callHandlerRaw(a.handler.GetCheckConstraints, req)
	if err != nil {
		return nil, err
	}

	var errResp struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBytes, &errResp); err == nil && errResp.Error != "" {
		return nil, fmt.Errorf("%s", errResp.Error)
	}

	var result []models.CheckConstraintInfo
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse check constraints response: %w", err)
	}
	return result, nil
}
