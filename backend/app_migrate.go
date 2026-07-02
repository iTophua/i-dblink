package backend

import (
	"encoding/json"

	"idblink/backend/api"
)

// MigrationPreview 迁移预览
type MigrationPreview = api.MigrationPreview

// MigrationTablePreview 单表迁移预览
type MigrationTablePreview = api.MigrationTablePreview

// MigrationOptions 迁移选项
type MigrationOptions = api.MigrationOptions

// MigrationResult 迁移结果
type MigrationResult = api.MigrationResult

// MigrationTableResult 单表迁移结果
type MigrationTableResult = api.MigrationTableResult

// GetMigrationPreview 获取迁移预览
func (a *App) GetMigrationPreview(sourceConnID string, targetConnID string, database string, targetDatabase string, tables []string) (MigrationPreview, error) {
	if err := a.ensureConnected(sourceConnID); err != nil {
		return MigrationPreview{}, err
	}
	if err := a.ensureConnected(targetConnID); err != nil {
		return MigrationPreview{}, err
	}

	if targetDatabase == "" {
		targetDatabase = database
	}

	req := api.GetMigrationPreviewRequest{
		SourceConnID:   sourceConnID,
		TargetConnID:   targetConnID,
		Database:       database,
		TargetDatabase: targetDatabase,
		Tables:         tables,
	}

	respBytes, err := callHandler(a.handler.GetMigrationPreview, req)
	if err != nil {
		return MigrationPreview{}, err
	}

	var result MigrationPreview
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return MigrationPreview{}, err
	}
	return result, nil
}

// ExecuteMigration 执行数据迁移
func (a *App) ExecuteMigration(sourceConnID string, targetConnID string, database string, targetDatabase string, tables []string, options MigrationOptions) (MigrationResult, error) {
	if err := a.ensureConnected(sourceConnID); err != nil {
		return MigrationResult{}, err
	}
	if err := a.ensureConnected(targetConnID); err != nil {
		return MigrationResult{}, err
	}

	if options.BatchSize <= 0 {
		options.BatchSize = 500
	}
	if targetDatabase == "" {
		targetDatabase = database
	}

	req := api.ExecuteMigrationRequest{
		SourceConnID:   sourceConnID,
		TargetConnID:   targetConnID,
		Database:       database,
		TargetDatabase: targetDatabase,
		Tables:         tables,
		Options:        options,
	}

	respBytes, err := callHandler(a.handler.ExecuteMigration, req)
	if err != nil {
		return MigrationResult{}, err
	}

	var result MigrationResult
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return MigrationResult{}, err
	}
	return result, nil
}
