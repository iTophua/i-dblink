package api

import (
	"context"
	"database/sql"
	"strings"

	"idblink-backend/models"
)

// 达梦元数据查询基于 Oracle 兼容的系统视图。
// 注：以下 SQL 基于达梦 DM8 的 SYS.* / DBA_* 视图，
// 实际使用时可能需要根据数据库版本和权限（DBA/普通用户）调整。

func damengGetDatabases(ctx context.Context, dbConn *sql.DB) ([]string, error) {
	// 达梦没有 MySQL 式的"数据库"概念，更接近 Schema。
	// 返回当前用户可访问的 SCHEMA 列表
	query := `SELECT DISTINCT OWNER FROM SYS.DBA_TABLES ORDER BY OWNER`
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		// 如果没有 DBA 权限，尝试 ALL_TABLES
		query = `SELECT DISTINCT OWNER FROM SYS.ALL_TABLES ORDER BY OWNER`
		rows, err = dbConn.QueryContext(ctx, query)
		if err != nil {
			return nil, err
		}
	}
	defer rows.Close()

	var result []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		result = append(result, name)
	}
	return result, rows.Err()
}

func damengGetTables(ctx context.Context, dbConn *sql.DB, database *string) ([]models.TableInfo, error) {
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}

	query := `
		SELECT TABLE_NAME, 'BASE TABLE' AS TABLE_TYPE,
			NULL AS ROW_COUNT, NULL AS COMMENT, NULL AS ENGINE,
			NULL AS DATA_SIZE, NULL AS INDEX_SIZE,
			NULL AS CREATE_TIME, NULL AS UPDATE_TIME, NULL AS COLLATION
		FROM SYS.DBA_TABLES
		WHERE OWNER = ?
		ORDER BY TABLE_NAME
	`
	rows, err := dbConn.QueryContext(ctx, query, schema)
	if err != nil {
		// fallback
		query = `
			SELECT TABLE_NAME, 'BASE TABLE' AS TABLE_TYPE,
				NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
			FROM SYS.ALL_TABLES WHERE OWNER = ? ORDER BY TABLE_NAME
		`
		rows, err = dbConn.QueryContext(ctx, query, schema)
		if err != nil {
			return nil, err
		}
	}
	defer rows.Close()

	var result []models.TableInfo
	for rows.Next() {
		var t models.TableInfo
		var tmp1, tmp2, tmp3, tmp4, tmp5, tmp6, tmp7, tmp8 interface{}
		if err := rows.Scan(&t.TableName, &t.TableType, &tmp1, &tmp2, &tmp3, &tmp4, &tmp5, &tmp6, &tmp7, &tmp8); err != nil {
			continue
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func damengGetTablesCategorized(ctx context.Context, dbConn *sql.DB, database *string, search *string) (models.TablesResult, error) {
	result := models.TablesResult{
		Tables: []models.TableInfo{},
		Views:  []models.TableInfo{},
	}
	tables, err := damengGetTables(ctx, dbConn, database)
	if err != nil {
		return result, err
	}

	// 达梦视图查询
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}
	viewQuery := `SELECT VIEW_NAME FROM SYS.DBA_VIEWS WHERE OWNER = ? ORDER BY VIEW_NAME`
	viewRows, err := dbConn.QueryContext(ctx, viewQuery, schema)
	if err != nil {
		viewQuery = `SELECT VIEW_NAME FROM SYS.ALL_VIEWS WHERE OWNER = ? ORDER BY VIEW_NAME`
		viewRows, err = dbConn.QueryContext(ctx, viewQuery, schema)
	}
	if err == nil {
		defer viewRows.Close()
		for viewRows.Next() {
			var name string
			if err := viewRows.Scan(&name); err == nil {
				result.Views = append(result.Views, models.TableInfo{
					TableName: name,
					TableType: "VIEW",
				})
			}
		}
	}

	// 搜索过滤
	if search != nil && *search != "" {
		s := strings.ToLower(*search)
		for _, t := range tables {
			if strings.Contains(strings.ToLower(t.TableName), s) {
				result.Tables = append(result.Tables, t)
			}
		}
		var filteredViews []models.TableInfo
		for _, v := range result.Views {
			if strings.Contains(strings.ToLower(v.TableName), s) {
				filteredViews = append(filteredViews, v)
			}
		}
		result.Views = filteredViews
	} else {
		result.Tables = tables
	}

	return result, nil
}

func damengGetColumns(ctx context.Context, dbConn *sql.DB, tableName string, database *string) ([]models.ColumnInfo, error) {
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}

	query := `
		SELECT COLUMN_NAME, DATA_TYPE,
			CASE WHEN NULLABLE = 'N' THEN 'NO' ELSE 'YES' END AS IS_NULLABLE,
			NULL AS COLUMN_KEY,
			DATA_DEFAULT AS COLUMN_DEFAULT,
			NULL AS EXTRA,
			NULL AS COMMENT
		FROM SYS.DBA_TAB_COLUMNS
		WHERE OWNER = ? AND TABLE_NAME = ?
		ORDER BY COLUMN_ID
	`
	rows, err := dbConn.QueryContext(ctx, query, schema, tableName)
	if err != nil {
		query = `
			SELECT COLUMN_NAME, DATA_TYPE,
				CASE WHEN NULLABLE = 'N' THEN 'NO' ELSE 'YES' END,
				NULL, DATA_DEFAULT, NULL, NULL
			FROM SYS.ALL_TAB_COLUMNS
			WHERE OWNER = ? AND TABLE_NAME = ?
			ORDER BY COLUMN_ID
		`
		rows, err = dbConn.QueryContext(ctx, query, schema, tableName)
		if err != nil {
			return nil, err
		}
	}
	defer rows.Close()

	var result []models.ColumnInfo
	for rows.Next() {
		var c models.ColumnInfo
		var key, extra, comment sql.NullString
		var def sql.NullString
		if err := rows.Scan(&c.ColumnName, &c.DataType, &c.IsNullable, &key, &def, &extra, &comment); err != nil {
			continue
		}
		c.ColumnDefault = nullStrEmpty(def)
		result = append(result, c)
	}
	return result, rows.Err()
}

func damengGetIndexes(ctx context.Context, dbConn *sql.DB, tableName string, database *string) ([]models.IndexInfo, error) {
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}

	query := `
		SELECT i.INDEX_NAME, c.COLUMN_NAME,
			CASE WHEN i.UNIQUENESS = 'UNIQUE' THEN 1 ELSE 0 END AS IS_UNIQUE,
			0 AS IS_PRIMARY,
			c.COLUMN_POSITION AS SEQ_IN_INDEX
		FROM SYS.DBA_INDEXES i
		JOIN SYS.DBA_IND_COLUMNS c ON i.INDEX_NAME = c.INDEX_NAME AND i.OWNER = c.INDEX_OWNER
		WHERE i.TABLE_OWNER = ? AND i.TABLE_NAME = ?
		ORDER BY i.INDEX_NAME, c.COLUMN_POSITION
	`
	rows, err := dbConn.QueryContext(ctx, query, schema, tableName)
	if err != nil {
		query = `
			SELECT i.INDEX_NAME, c.COLUMN_NAME,
				CASE WHEN i.UNIQUENESS = 'UNIQUE' THEN 1 ELSE 0 END,
				0, c.COLUMN_POSITION
			FROM SYS.ALL_INDEXES i
			JOIN SYS.ALL_IND_COLUMNS c ON i.INDEX_NAME = c.INDEX_NAME AND i.OWNER = c.INDEX_OWNER
			WHERE i.TABLE_OWNER = ? AND i.TABLE_NAME = ?
			ORDER BY i.INDEX_NAME, c.COLUMN_POSITION
		`
		rows, err = dbConn.QueryContext(ctx, query, schema, tableName)
		if err != nil {
			return nil, err
		}
	}
	defer rows.Close()

	var result []models.IndexInfo
	for rows.Next() {
		var idx models.IndexInfo
		var isUnique int
		var isPrimary int
		if err := rows.Scan(&idx.IndexName, &idx.ColumnName, &isUnique, &isPrimary, &idx.SeqInIndex); err != nil {
			continue
		}
		idx.IsUnique = isUnique == 1
		idx.IsPrimary = isPrimary == 1
		result = append(result, idx)
	}
	return result, rows.Err()
}

func damengGetForeignKeys(ctx context.Context, dbConn *sql.DB, tableName string, database *string) ([]models.ForeignKeyInfo, error) {
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}

	// 达梦外键查询：使用 USER_CONSTRAINTS / ALL_CONSTRAINTS 视图
	// 注意：不同版本的达梦数据库系统视图列名可能有差异，出错时返回空数组
	queries := []string{
		// 尝试 USER_ 视图（当前用户）
		`SELECT c.CONSTRAINT_NAME, cc.COLUMN_NAME,
			c.TABLE_NAME AS REFERENCED_TABLE,
			cc.COLUMN_NAME AS REFERENCED_COLUMN
		FROM USER_CONSTRAINTS c
		JOIN USER_CONS_COLUMNS cc ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
		WHERE c.CONSTRAINT_TYPE = 'R'
			AND c.TABLE_NAME = ?
		ORDER BY cc.POSITION`,
		// 尝试 ALL_ 视图
		`SELECT c.CONSTRAINT_NAME, cc.COLUMN_NAME,
			c.R_TABLE_NAME AS REFERENCED_TABLE,
			rcc.COLUMN_NAME AS REFERENCED_COLUMN
		FROM ALL_CONSTRAINTS c
		JOIN ALL_CONS_COLUMNS cc ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND c.OWNER = cc.OWNER
		JOIN ALL_CONS_COLUMNS rcc ON c.R_CONSTRAINT_NAME = rcc.CONSTRAINT_NAME AND c.R_OWNER = rcc.OWNER
		WHERE c.CONSTRAINT_TYPE = 'R'
			AND c.OWNER = ?
			AND c.TABLE_NAME = ?
		ORDER BY cc.POSITION`,
		// 尝试 DBA_ 视图
		`SELECT c.CONSTRAINT_NAME, cc.COLUMN_NAME,
			c.R_TABLE_NAME AS REFERENCED_TABLE,
			rcc.COLUMN_NAME AS REFERENCED_COLUMN
		FROM DBA_CONSTRAINTS c
		JOIN DBA_CONS_COLUMNS cc ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND c.OWNER = cc.OWNER
		JOIN DBA_CONS_COLUMNS rcc ON c.R_CONSTRAINT_NAME = rcc.CONSTRAINT_NAME AND c.R_OWNER = rcc.OWNER
		WHERE c.CONSTRAINT_TYPE = 'R'
			AND c.OWNER = ?
			AND c.TABLE_NAME = ?
		ORDER BY cc.POSITION`,
	}

	var rows *sql.Rows
	var err error

	for i, query := range queries {
		if i == 0 {
			// USER_ 视图不需要 OWNER 参数
			rows, err = dbConn.QueryContext(ctx, query, tableName)
		} else {
			rows, err = dbConn.QueryContext(ctx, query, schema, tableName)
		}
		if err == nil {
			break
		}
	}

	if err != nil {
		// 外键查询失败不影响整体功能，返回空数组
		return []models.ForeignKeyInfo{}, nil
	}
	defer rows.Close()

	var result []models.ForeignKeyInfo
	for rows.Next() {
		var fk models.ForeignKeyInfo
		if err := rows.Scan(&fk.ConstraintName, &fk.ColumnName, &fk.ReferencedTable, &fk.ReferencedColumn); err != nil {
			continue
		}
		result = append(result, fk)
	}
	return result, rows.Err()
}

func damengGetTableStructure(ctx context.Context, dbConn *sql.DB, tableName string, database *string) (models.TableStructure, error) {
	var result models.TableStructure
	var err error
	result.Columns, err = damengGetColumns(ctx, dbConn, tableName, database)
	if err != nil {
		return result, err
	}
	result.Indexes, err = damengGetIndexes(ctx, dbConn, tableName, database)
	if err != nil {
		return result, err
	}
	result.ForeignKeys, err = damengGetForeignKeys(ctx, dbConn, tableName, database)
	if err != nil {
		return result, err
	}
	return result, nil
}

func damengGetRoutines(ctx context.Context, dbConn *sql.DB, database *string) (models.RoutinesResult, error) {
	var result models.RoutinesResult
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}

	query := `
		SELECT OBJECT_NAME, OBJECT_TYPE, NULL AS DEFINITION
		FROM SYS.DBA_PROCEDURES
		WHERE OWNER = ? AND OBJECT_TYPE IN ('PROCEDURE', 'FUNCTION')
		ORDER BY OBJECT_NAME
	`
	rows, err := dbConn.QueryContext(ctx, query, schema)
	if err != nil {
		query = `
			SELECT OBJECT_NAME, OBJECT_TYPE, NULL
			FROM SYS.ALL_PROCEDURES
			WHERE OWNER = ? AND OBJECT_TYPE IN ('PROCEDURE', 'FUNCTION')
			ORDER BY OBJECT_NAME
		`
		rows, err = dbConn.QueryContext(ctx, query, schema)
		if err != nil {
			return result, err
		}
	}
	defer rows.Close()

	for rows.Next() {
		var r models.RoutineInfo
		var def sql.NullString
		if err := rows.Scan(&r.RoutineName, &r.RoutineType, &def); err != nil {
			continue
		}
		r.RoutineType = strings.ToUpper(r.RoutineType)
		r.Definition = nullStr(def)
		if r.RoutineType == "PROCEDURE" {
			result.Procedures = append(result.Procedures, r)
		} else {
			result.Functions = append(result.Functions, r)
		}
	}
	return result, rows.Err()
}
