package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"idblink/backend/db"
	"idblink/backend/models"
)

// MigrationPreview 迁移预览
type MigrationPreview struct {
	Tables  []MigrationTablePreview `json:"tables"`
	Warnings []string               `json:"warnings"`
}

// MigrationTablePreview 单表迁移预览
type MigrationTablePreview struct {
	TableName    string             `json:"table_name"`
	RowCount     int64              `json:"row_count"`
	Columns      []models.ColumnInfo `json:"columns"`
	SourceDDL    string             `json:"source_ddl,omitempty"`
	TargetDDL    string             `json:"target_ddl,omitempty"`
	Compatible   bool               `json:"compatible"`
	Warnings     []string           `json:"warnings,omitempty"`
}

// MigrationOptions 迁移选项
type MigrationOptions struct {
	CreateTable    bool `json:"create_table"`
	DropExisting   bool `json:"drop_existing"`
	TruncateTarget bool `json:"truncate_target"`
	BatchSize      int  `json:"batch_size"`
}

// MigrationResult 迁移结果
type MigrationResult struct {
	Tables      []MigrationTableResult `json:"tables"`
	TotalRows   int64                  `json:"total_rows"`
	TotalTimeMs int64                  `json:"total_time_ms"`
	Success     bool                   `json:"success"`
	Error       string                 `json:"error,omitempty"`
}

// MigrationTableResult 单表迁移结果
type MigrationTableResult struct {
	TableName  string   `json:"table_name"`
	RowCount   int64    `json:"row_count"`
	TimeMs     int64    `json:"time_ms"`
	Success    bool     `json:"success"`
	Error      string   `json:"error,omitempty"`
	Warnings   []string `json:"warnings,omitempty"`
}

// GetMigrationPreviewRequest 获取迁移预览请求
type GetMigrationPreviewRequest struct {
	SourceConnID   string   `json:"source_conn_id"`
	TargetConnID   string   `json:"target_conn_id"`
	Database       string   `json:"database"`
	TargetDatabase string   `json:"target_database"`
	Tables         []string `json:"tables"`
}

// ExecuteMigrationRequest 执行迁移请求
type ExecuteMigrationRequest struct {
	SourceConnID   string          `json:"source_conn_id"`
	TargetConnID   string          `json:"target_conn_id"`
	Database       string          `json:"database"`
	TargetDatabase string          `json:"target_database"`
	Tables         []string        `json:"tables"`
	Options        MigrationOptions `json:"options"`
}

// GetMigrationPreview 获取迁移预览
func (h *Handler) GetMigrationPreview(w http.ResponseWriter, r *http.Request) {
	var req GetMigrationPreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	sourceExec, sourceType, err := h.getConnAndType(req.SourceConnID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("source connection error: %v", err))
		return
	}
	sourceExec, err = h.resolvePGExec(sourceExec, req.SourceConnID, sourceType, &req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	preview := MigrationPreview{
		Tables:   []MigrationTablePreview{},
		Warnings: []string{},
	}

	for _, tableName := range req.Tables {
		tp := MigrationTablePreview{
			TableName:  tableName,
			Compatible: true,
			Warnings:   []string{},
		}

		// 获取行数
		rowCount, err := getTableRowCount(ctx, sourceExec, tableName, sourceType)
		if err != nil {
			tp.Warnings = append(tp.Warnings, fmt.Sprintf("无法获取行数: %v", err))
		}
		tp.RowCount = rowCount

		// 获取列信息
		columns, err := getColumnsForDoc(ctx, sourceExec, sourceType, tableName, &req.Database)
		if err != nil {
			tp.Warnings = append(tp.Warnings, fmt.Sprintf("failed to get columns: %v", err))
			tp.Compatible = false
		}
		tp.Columns = columns

		preview.Tables = append(preview.Tables, tp)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(preview)
}

// ExecuteMigration 执行数据迁移
func (h *Handler) ExecuteMigration(w http.ResponseWriter, r *http.Request) {
	var req ExecuteMigrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	sourceExec, sourceType, err := h.getConnAndType(req.SourceConnID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("source connection error: %v", err))
		return
	}
	sourceExec, err = h.resolvePGExec(sourceExec, req.SourceConnID, sourceType, &req.Database)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	targetExec, targetType, err := h.getConnAndType(req.TargetConnID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("target connection error: %v", err))
		return
	}
	targetDB := req.TargetDatabase
	if targetDB == "" {
		targetDB = req.Database // fallback to source database name
	}
	targetExec, err = h.resolvePGExec(targetExec, req.TargetConnID, targetType, &targetDB)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	if req.Options.BatchSize <= 0 {
		req.Options.BatchSize = 500
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	startTime := time.Now()
	result := MigrationResult{
		Tables: []MigrationTableResult{},
	}

	for _, tableName := range req.Tables {
		tableStart := time.Now()
		tr := MigrationTableResult{
			TableName: tableName,
			Success:   true,
		}

		// 获取源表列信息
		columns, err := getColumnsForDoc(ctx, sourceExec, sourceType, tableName, &req.Database)
		if err != nil {
			tr.Success = false
			tr.Error = fmt.Sprintf("failed to get columns: %v", err)
			result.Tables = append(result.Tables, tr)
			continue
		}

		// 如果需要创建表
		if req.Options.CreateTable {
			createSQL := buildCreateTableSQL(tableName, columns, targetType)
			if req.Options.DropExisting {
				dropSQL := fmt.Sprintf("DROP TABLE IF EXISTS %s", quoteIdent(tableName, targetType))
				if _, dropErr := targetExec.ExecContext(ctx, dropSQL); dropErr != nil {
					tr.Warnings = append(tr.Warnings, fmt.Sprintf("drop table warning: %v", dropErr))
				}
			}
			if _, err := targetExec.ExecContext(ctx, createSQL); err != nil {
				tr.Success = false
				tr.Error = fmt.Sprintf("create table failed: %v", err)
				result.Tables = append(result.Tables, tr)
				continue
			}
		}

		// 如果需要清空目标表
		if req.Options.TruncateTarget {
			truncateSQL := fmt.Sprintf("TRUNCATE TABLE %s", quoteIdent(tableName, targetType))
			if _, truncErr := targetExec.ExecContext(ctx, truncateSQL); truncErr != nil {
				tr.Warnings = append(tr.Warnings, fmt.Sprintf("truncate warning: %v", truncErr))
			}
		}

		// 分批迁移数据
		rowCount, err := migrateTableData(ctx, sourceExec, targetExec, tableName, columns, sourceType, targetType, req.Options.BatchSize)
		tr.RowCount = rowCount
		if err != nil {
			tr.Success = false
			tr.Error = fmt.Sprintf("migration failed: %v", err)
		}

		tr.TimeMs = time.Since(tableStart).Milliseconds()
		result.Tables = append(result.Tables, tr)
		result.TotalRows += rowCount
	}

	result.TotalTimeMs = time.Since(startTime).Milliseconds()
	result.Success = true
	for _, t := range result.Tables {
		if !t.Success {
			result.Success = false
			result.Error = "部分表迁移失败"
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// getTableRowCount 获取表行数
func getTableRowCount(ctx context.Context, exec db.Executor, tableName string, dbType string) (int64, error) {
	rows, err := exec.QueryContext(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %s", quoteIdent(tableName, dbType)))
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	if rows.Next() {
		var count int64
		if err := rows.Scan(&count); err != nil {
			return 0, err
		}
		return count, nil
	}
	return 0, nil
}

// buildCreateTableSQL 构建 CREATE TABLE 语句
func buildCreateTableSQL(tableName string, columns []models.ColumnInfo, targetType string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("CREATE TABLE %s (\n", quoteIdent(tableName, targetType)))
	for i, col := range columns {
		sb.WriteString(fmt.Sprintf("  %s %s", quoteIdent(col.ColumnName, targetType), col.DataType))
		if col.IsNullable == "NO" {
			sb.WriteString(" NOT NULL")
		}
		if col.ColumnDefault != nil && *col.ColumnDefault != "" {
			// 安全处理默认值：如果包含 SQL 关键字或函数调用则原样使用（如 NOW()），否则加引号
			defaultVal := *col.ColumnDefault
			if isSafeDefaultValue(defaultVal) {
				sb.WriteString(fmt.Sprintf(" DEFAULT %s", defaultVal))
			} else {
				sb.WriteString(fmt.Sprintf(" DEFAULT '%s'", strings.ReplaceAll(defaultVal, "'", "''")))
			}
		}
		if i < len(columns)-1 {
			sb.WriteString(",")
		}
		sb.WriteString("\n")
	}
	sb.WriteString(")")
	return sb.String()
}

// isSafeDefaultValue 判断默认值是否可以安全原样使用（函数调用、关键字等）
func isSafeDefaultValue(val string) bool {
	upper := strings.ToUpper(strings.TrimSpace(val))
	// 常见的安全默认值模式：函数调用、关键字、数字
	safePatterns := []string{
		"NOW()", "CURRENT_TIMESTAMP", "CURRENT_DATE", "CURRENT_TIME",
		"GETDATE()", "SYSDATE", "SYS_EXTRACT_UTC",
		"UUID()", "NEWID()", "NEWSEQUENTIALID()",
		"NULL", "TRUE", "FALSE",
	}
	for _, p := range safePatterns {
		if upper == p || strings.HasPrefix(upper, p+"(") {
			return true
		}
	}
	// 纯数字
	if _, err := fmt.Sscanf(upper, "%d", new(int)); err == nil {
		return true
	}
	// 浮点数
	if _, err := fmt.Sscanf(upper, "%f", new(float64)); err == nil && !strings.Contains(upper, "'") {
		return true
	}
	return false
}

// migrateTableData 分批迁移表数据
func migrateTableData(ctx context.Context, sourceExec, targetExec db.Executor, tableName string, columns []models.ColumnInfo, sourceType, targetType string, batchSize int) (int64, error) {
	colNames := make([]string, len(columns))
	for i, c := range columns {
		colNames[i] = c.ColumnName
	}

	// 构建 SELECT 语句
	selectSQL := fmt.Sprintf("SELECT %s FROM %s",
		joinColumnNames(colNames, sourceType), quoteIdent(tableName, sourceType))

	rows, err := sourceExec.QueryContext(ctx, selectSQL)
	if err != nil {
		return 0, fmt.Errorf("failed to query source table: %w", err)
	}
	defer rows.Close()

	// 构建 INSERT 语句
	placeholders := make([]string, len(colNames))
	for i := range colNames {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}
	insertSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		quoteIdent(tableName, targetType),
		joinColumnNames(colNames, targetType),
		strings.Join(placeholders, ", "))

	// 根据数据库类型调整占位符
	switch targetType {
	case "mysql", "mariadb", "sqlite":
		for i := range placeholders {
			placeholders[i] = "?"
		}
	case "oracle", "dameng":
		for i := range placeholders {
			placeholders[i] = fmt.Sprintf(":%d", i+1)
		}
	// postgresql, sqlserver, kingbase, highgo, vastbase 使用 $N
	}
	insertSQL = fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		quoteIdent(tableName, targetType),
		joinColumnNames(colNames, targetType),
		strings.Join(placeholders, ", "))

	var totalRows int64
	batch := make([][]interface{}, 0, batchSize)

	for rows.Next() {
		values := make([]interface{}, len(colNames))
		ptrs := make([]interface{}, len(colNames))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return totalRows, fmt.Errorf("扫描行数据失败: %w", err)
		}
		batch = append(batch, values)

		if len(batch) >= batchSize {
			if err := insertBatch(ctx, targetExec, insertSQL, batch); err != nil {
				return totalRows, err
			}
			totalRows += int64(len(batch))
			batch = batch[:0]
		}
	}

	// 插入剩余数据
	if len(batch) > 0 {
		if err := insertBatch(ctx, targetExec, insertSQL, batch); err != nil {
			return totalRows, err
		}
		totalRows += int64(len(batch))
	}

	return totalRows, nil
}

// insertBatch 批量插入
func insertBatch(ctx context.Context, exec db.Executor, sql string, batch [][]interface{}) error {
	for _, row := range batch {
		if _, err := exec.ExecContext(ctx, sql, row...); err != nil {
			return fmt.Errorf("insert failed: %w", err)
		}
	}
	return nil
}

// joinColumnNames 连接列名，根据数据库类型添加引号
func joinColumnNames(colNames []string, dbType string) string {
	quoted := make([]string, len(colNames))
	for i, name := range colNames {
		quoted[i] = quoteIdent(name, dbType)
	}
	return strings.Join(quoted, ", ")
}
