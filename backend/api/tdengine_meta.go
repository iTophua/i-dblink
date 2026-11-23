package api

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"idblink/backend/db"
	"idblink/backend/models"
)

// ==================== TDengine 元数据 ====================
// 走 REST（taosRestful），连接无会话状态：所有查询显式限定 db。
// SHOW 输出列随版本有差异，统一用 `SELECT 列 FROM (SHOW ...)` 投影，
// 固定结果列形态；表注释等增强信息 best-effort（失败不阻断列表）。

// tdengineGetDatabases 数据库列表（隐藏内置库）
func tdengineGetDatabases(ctx context.Context, dbConn db.Executor) ([]string, error) {
	rows, err := dbConn.QueryContext(ctx, "SELECT name FROM (SHOW DATABASES)")
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
		if name == "information_schema" || name == "performance_schema" {
			continue
		}
		result = append(result, name)
	}
	return result, rows.Err()
}

// tdengineGetTablesCategorized 表 + 超级表 + 视图分类列表
func tdengineGetTablesCategorized(ctx context.Context, dbConn db.Executor, database *string, search *string) (models.TablesResult, error) {
	result := models.TablesResult{
		Tables: []models.TableInfo{},
		Views:  []models.TableInfo{},
	}
	if database == nil || *database == "" {
		return result, fmt.Errorf("database name is required")
	}
	safeDb := tdQuote(*database)

	// 普通表 + 超级表都进 Tables（超级表 engine 标 STABLE）；
	// 子表数量庞大且依附超级表，不单独列出
	for _, q := range []struct {
		sql    string
		engine string
	}{
		{fmt.Sprintf("SELECT table_name FROM (SHOW %s.TABLES)", safeDb), ""},
		{fmt.Sprintf("SELECT stable_name FROM (SHOW %s.STABLES)", safeDb), "STABLE"},
	} {
		rows, err := dbConn.QueryContext(ctx, q.sql)
		if err != nil {
			return result, err
		}
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				continue
			}
			info := models.TableInfo{TableName: name, TableType: "BASE TABLE"}
			if q.engine != "" {
				info.Engine = strPtr(q.engine)
			}
			result.Tables = append(result.Tables, info)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return result, err
		}
	}

	// 视图（3.1+；旧版本无视图概念，查询失败按 0 个处理）
	if rows, err := dbConn.QueryContext(ctx, fmt.Sprintf("SELECT view_name FROM (SHOW %s.VIEWS)", safeDb)); err == nil {
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				continue
			}
			result.Views = append(result.Views, models.TableInfo{TableName: name, TableType: "VIEW"})
		}
		rows.Close()
	}

	// 表注释 best-effort：ins_tables 在 3.x 提供 table_comment，失败不影响列表
	if rows, err := dbConn.QueryContext(ctx,
		"SELECT table_name, table_comment FROM information_schema.ins_tables WHERE db_name = ?", *database,
	); err == nil {
		comments := make(map[string]string)
		for rows.Next() {
			var name string
			var comment sql.NullString
			if err := rows.Scan(&name, &comment); err == nil && comment.Valid && comment.String != "" {
				comments[name] = comment.String
			}
		}
		rows.Close()
		for i := range result.Tables {
			if c, ok := comments[result.Tables[i].TableName]; ok {
				result.Tables[i].Comment = strPtr(c)
			}
		}
	}

	if search != nil && *search != "" {
		s := strings.ToLower(*search)
		filtered := result.Tables[:0]
		for _, t := range result.Tables {
			if strings.Contains(strings.ToLower(t.TableName), s) {
				filtered = append(filtered, t)
			}
		}
		result.Tables = filtered
	}

	return result, nil
}

// tdengineGetColumns DESCRIBE → 列信息（note 标记 PRIMARY KEY / TAG）
func tdengineGetColumns(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.ColumnInfo, error) {
	dbName, err := tdengineDbName(database)
	if err != nil {
		return nil, err
	}
	rows, err := dbConn.QueryContext(ctx, fmt.Sprintf("DESCRIBE %s.%s", tdQuote(dbName), tdQuote(tableName)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ColumnInfo
	for rows.Next() {
		// field / type / length / note；length/note 空值时 REST 可能返回 null，
		// 必须扫 NullString（扫 string 遇 null 整行失败，会被静默跳过丢列）
		var field, dataType string
		var length, note sql.NullString
		if err := rows.Scan(&field, &dataType, &length, &note); err != nil {
			continue
		}
		c := models.ColumnInfo{
			ColumnName: field,
			DataType:   dataType,
			IsNullable: "YES", // TDengine 列缺省可空，时间戳列由 note 标记
		}
		switch {
		case note.String == "PRIMARY KEY":
			c.ColumnKey = strPtr("PRI")
			c.IsNullable = "NO"
		case strings.HasPrefix(note.String, "TAG"):
			c.Extra = strPtr("TAG")
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

// tdengineGetTableStructure 表结构（TDengine 无二级索引/外键）
func tdengineGetTableStructure(ctx context.Context, dbConn db.Executor, tableName string, database *string) (models.TableStructure, error) {
	cols, err := tdengineGetColumns(ctx, dbConn, tableName, database)
	if err != nil {
		return models.TableStructure{}, err
	}
	return models.TableStructure{
		Columns:     cols,
		Indexes:     []models.IndexInfo{},
		ForeignKeys: []models.ForeignKeyInfo{},
	}, nil
}

// tdengineGetTableDDL TDengine 无 SHOW CREATE，从 DESCRIBE 尽力重建：
// TAG note 的列归入 TAGS 子句（超级表），其余为普通列。近似产物，
// 头部注明 generated by iDBLink，避免与真实 DDL 混淆。
func tdengineGetTableDDL(ctx context.Context, dbConn db.Executor, tableName string, database string) (string, error) {
	dbPtr := &database
	cols, err := tdengineGetColumns(ctx, dbConn, tableName, dbPtr)
	if err != nil {
		return "", err
	}
	var colDefs, tagDefs []string
	for _, c := range cols {
		def := fmt.Sprintf("  `%s` %s", c.ColumnName, c.DataType)
		if c.ColumnKey != nil && *c.ColumnKey == "PRI" {
			def += " PRIMARY KEY"
		}
		if c.Extra != nil && *c.Extra == "TAG" {
			tagDefs = append(tagDefs, def)
		} else {
			colDefs = append(colDefs, def)
		}
	}
	var sb strings.Builder
	sb.WriteString("-- generated by iDBLink (TDengine has no SHOW CREATE; reconstructed from DESCRIBE)\n")
	sb.WriteString(fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s.%s (\n", tdQuote(database), tdQuote(tableName)))
	sb.WriteString(strings.Join(colDefs, ",\n"))
	if len(tagDefs) > 0 {
		sb.WriteString("\n) TAGS (\n")
		sb.WriteString(strings.Join(tagDefs, ",\n"))
	}
	sb.WriteString("\n);\n")
	return sb.String(), nil
}

// tdengineGetAllColumns 全库列信息（SQL 补全用）
func tdengineGetAllColumns(ctx context.Context, dbConn db.Executor, database *string) (models.AllColumnsResult, error) {
	dbName, err := tdengineDbName(database)
	if err != nil {
		return models.AllColumnsResult{}, err
	}
	// ins_columns 覆盖表 + 超级表（含 tag 列）；版本差异下失败则退回逐表 DESCRIBE
	rows, err := dbConn.QueryContext(ctx,
		"SELECT table_name, col_name, col_type FROM information_schema.ins_columns WHERE db_name = ?", dbName)
	if err != nil {
		return tdengineGetAllColumnsFallback(ctx, dbConn, dbName)
	}
	defer rows.Close()

	result := models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}
	for rows.Next() {
		var table, name string
		var dataType sql.NullString
		if err := rows.Scan(&table, &name, &dataType); err != nil {
			continue
		}
		result.Tables[table] = append(result.Tables[table], models.ColumnInfo{
			ColumnName: name,
			DataType:   dataType.String,
			IsNullable: "YES",
		})
	}
	return result, rows.Err()
}

// tdengineGetAllColumnsFallback ins_columns 不可用时逐表 DESCRIBE
func tdengineGetAllColumnsFallback(ctx context.Context, dbConn db.Executor, dbName string) (models.AllColumnsResult, error) {
	tables, err := dbConn.QueryContext(ctx, fmt.Sprintf("SELECT table_name FROM (SHOW %s.TABLES)", tdQuote(dbName)))
	if err != nil {
		return models.AllColumnsResult{}, err
	}
	defer tables.Close()

	result := models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}
	dbPtr := &dbName
	for tables.Next() {
		var name string
		if err := tables.Scan(&name); err != nil {
			continue
		}
		cols, err := tdengineGetColumns(ctx, dbConn, name, dbPtr)
		if err != nil {
			continue
		}
		result.Tables[name] = cols
	}
	return result, tables.Err()
}

func tdengineDbName(database *string) (string, error) {
	if database == nil || *database == "" {
		return "", fmt.Errorf("database name is required")
	}
	return *database, nil
}

// tdQuote 反引号引用标识符
func tdQuote(ident string) string {
	return "`" + strings.ReplaceAll(ident, "`", "``") + "`"
}
