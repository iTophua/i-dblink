package api

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"idblink/backend/db"
	"idblink/backend/models"
)

// ==================== ClickHouse / AIoTHouse 元数据 ====================
// 全部走 system 库（所有 CH 系内核自带，AIoTHouse 已验证响应标准协议）。
// 执行器按 database 开池（manager.GetWithDatabase），元数据查询仍显式
// 带 database 条件，避免依赖会话当前库。

// clickhouseGetDatabases 数据库列表（隐藏内部库）
func clickhouseGetDatabases(ctx context.Context, dbConn db.Executor) ([]string, error) {
	rows, err := dbConn.QueryContext(ctx, `
		SELECT name FROM system.databases
		WHERE name NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
		ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		result = append(result, name)
	}
	return result, rows.Err()
}

// clickhouseGetTablesCategorized 表 + 视图分类列表
func clickhouseGetTablesCategorized(ctx context.Context, dbConn db.Executor, database *string, search *string) (models.TablesResult, error) {
	result := models.TablesResult{
		Tables: []models.TableInfo{},
		Views:  []models.TableInfo{},
	}
	if database == nil || *database == "" {
		return result, fmt.Errorf("database name is required")
	}

	// total_rows/total_bytes 是 UInt64：超 int64 上限时驱动可能返回字符串，
	// 扫进 NullString 再解析，兼顾两种返回形态
	rows, err := dbConn.QueryContext(ctx, `
		SELECT name, engine, toString(total_rows), toString(total_bytes), comment
		FROM system.tables
		WHERE database = ?
		ORDER BY name`, *database)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var name, engine, rowCount, totalBytes sql.NullString
		var comment sql.NullString
		if err := rows.Scan(&name, &engine, &rowCount, &totalBytes, &comment); err != nil {
			continue
		}
		// 引擎以 View 结尾的都算视图（View / MaterializedView / WindowView / LiveView）
		isView := strings.HasSuffix(engine.String, "View")
		info := models.TableInfo{
			TableName: name.String,
			TableType: map[bool]string{true: "VIEW", false: "BASE TABLE"}[isView],
			Comment:   nullStr(comment),
			Engine:    nullStr(engine),
		}
		if n, ok := parseUintString(rowCount); ok {
			info.RowCount = &n
		}
		if b, ok := parseIntString(totalBytes); ok {
			info.DataSize = formatBytes(sql.NullInt64{Int64: b, Valid: true})
		}
		if isView {
			result.Views = append(result.Views, info)
		} else {
			result.Tables = append(result.Tables, info)
		}
	}
	if err := rows.Err(); err != nil {
		return result, err
	}

	if search != nil && *search != "" {
		s := strings.ToLower(*search)
		filter := func(items []models.TableInfo) []models.TableInfo {
			filtered := items[:0]
			for _, t := range items {
				if strings.Contains(strings.ToLower(t.TableName), s) {
					filtered = append(filtered, t)
				}
			}
			return filtered
		}
		result.Tables = filter(result.Tables)
		result.Views = filter(result.Views)
	}

	return result, nil
}

// clickhouseGetColumns 单表列信息
func clickhouseGetColumns(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.ColumnInfo, error) {
	dbName, err := clickhouseDbName(database)
	if err != nil {
		return nil, err
	}
	return clickhouseScanColumns(ctx, dbConn, "table = ?", dbName, tableName)
}

// clickhouseGetAllColumns 全库列信息（SQL 补全用）
func clickhouseGetAllColumns(ctx context.Context, dbConn db.Executor, database *string) (models.AllColumnsResult, error) {
	dbName, err := clickhouseDbName(database)
	if err != nil {
		return models.AllColumnsResult{}, err
	}
	rows, err := dbConn.QueryContext(ctx, `
		SELECT table, name, type, default_kind, default_expression, comment, is_in_primary_key
		FROM system.columns
		WHERE database = ?
		ORDER BY table, position`, dbName)
	if err != nil {
		return models.AllColumnsResult{}, err
	}
	defer rows.Close()

	result := models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}
	for rows.Next() {
		var table, name, dataType string
		var defaultKind, defaultExpr, comment sql.NullString
		var isPK int
		if err := rows.Scan(&table, &name, &dataType, &defaultKind, &defaultExpr, &comment, &isPK); err != nil {
			continue
		}
		result.Tables[table] = append(result.Tables[table], clickhouseColumnInfo(name, dataType, defaultKind, defaultExpr, comment, isPK))
	}
	return result, rows.Err()
}

func clickhouseScanColumns(ctx context.Context, dbConn db.Executor, tableCond string, dbName, tableName string) ([]models.ColumnInfo, error) {
	rows, err := dbConn.QueryContext(ctx, fmt.Sprintf(`
		SELECT name, type, default_kind, default_expression, comment, is_in_primary_key
		FROM system.columns
		WHERE database = ? AND %s
		ORDER BY position`, tableCond), dbName, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ColumnInfo
	for rows.Next() {
		var name, dataType string
		var defaultKind, defaultExpr, comment sql.NullString
		var isPK int
		if err := rows.Scan(&name, &dataType, &defaultKind, &defaultExpr, &comment, &isPK); err != nil {
			continue
		}
		result = append(result, clickhouseColumnInfo(name, dataType, defaultKind, defaultExpr, comment, isPK))
	}
	return result, rows.Err()
}

// clickhouseColumnInfo system.columns 行 → ColumnInfo
func clickhouseColumnInfo(name, dataType string, defaultKind, defaultExpr, comment sql.NullString, isPK int) models.ColumnInfo {
	c := models.ColumnInfo{
		ColumnName: name,
		DataType:   dataType,
		IsNullable: map[bool]string{true: "YES", false: "NO"}[strings.HasPrefix(dataType, "Nullable(")],
	}
	if isPK == 1 {
		c.ColumnKey = strPtr("PRI")
	}
	if defaultExpr.Valid {
		c.ColumnDefault = nullStrEmpty(defaultExpr)
	}
	if defaultKind.Valid && defaultKind.String != "" {
		c.Extra = strPtr(defaultKind.String) // DEFAULT / ALIAS / MATERIALIZED / EPHEMERAL
	}
	if comment.Valid && comment.String != "" {
		c.Comment = strPtr(comment.String)
	}
	return c
}

func clickhouseDbName(database *string) (string, error) {
	if database == nil || *database == "" {
		return "", fmt.Errorf("database name is required")
	}
	return *database, nil
}

// clickhouseGetTableStructure 表结构（列 + 空 索引/外键：
// CH 的主键是排序模型的一部分，没有传统二级索引可列）
func clickhouseGetTableStructure(ctx context.Context, dbConn db.Executor, tableName string, database *string) (models.TableStructure, error) {
	cols, err := clickhouseGetColumns(ctx, dbConn, tableName, database)
	if err != nil {
		return models.TableStructure{}, err
	}
	return models.TableStructure{
		Columns:     cols,
		Indexes:     []models.IndexInfo{},
		ForeignKeys: []models.ForeignKeyInfo{},
	}, nil
}

// clickhouseGetTableDDL SHOW CREATE TABLE（含完整 ENGINE/ORDER BY 定义）
func clickhouseGetTableDDL(ctx context.Context, dbConn db.Executor, tableName string, database string) (string, error) {
	var stmt string
	err := dbConn.QueryRowContext(ctx,
		fmt.Sprintf("SHOW CREATE TABLE `%s`.`%s`",
			strings.ReplaceAll(database, "`", "``"), strings.ReplaceAll(tableName, "`", "``")),
	).Scan(&stmt)
	return stmt, err
}

// parseUintString NullString → uint64（toString 产物或驱动直给的数字形态）
func parseUintString(v sql.NullString) (uint64, bool) {
	if !v.Valid || v.String == "" {
		return 0, false
	}
	var n uint64
	for _, ch := range v.String {
		if ch < '0' || ch > '9' {
			return 0, false
		}
		n = n*10 + uint64(ch-'0')
	}
	return n, true
}

// parseIntString NullString → int64（同上，字节数语义）
func parseIntString(v sql.NullString) (int64, bool) {
	n, ok := parseUintString(v)
	if !ok || n > 1<<62 {
		return 0, false
	}
	return int64(n), true
}
