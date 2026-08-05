package api

import (
	"context"
	"database/sql"
	"strings"

	"idblink/backend/db"
	"idblink/backend/models"
)

// 达梦元数据查询基于 Oracle 兼容的系统视图。
// 注：以下 SQL 基于达梦 DM8 的 SYS.* / DBA_* 视图，
// 实际使用时可能需要根据数据库版本和权限（DBA/普通用户）调整。

func damengGetDatabases(ctx context.Context, dbConn db.Executor) ([]string, error) {
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
	if result == nil {
		result = []string{}
	}
	return result, rows.Err()
}

func damengGetTables(ctx context.Context, dbConn db.Executor, database *string) ([]models.TableInfo, error) {
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}
	schema = strings.ToUpper(schema)

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

func damengGetTablesCategorized(ctx context.Context, dbConn db.Executor, database *string, search *string) (models.TablesResult, error) {
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

func damengGetAllColumns(ctx context.Context, dbConn db.Executor, database *string) (models.AllColumnsResult, error) {
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}
	schema = strings.ToUpper(schema)

	// 优化策略：
	// 1. 当目标 schema == 当前登录用户时，优先用 USER_* 视图（体积小、有统计信息，远快于 ALL_*）。
	// 2. 用 LEFT JOIN 替代原 EXISTS 关联子查询——原 EXISTS 对 ALL_TAB_COLUMNS 的每一行都重新
	//    扫描 ALL_CONSTRAINTS ⋈ ALL_CONS_COLUMNS，在大库下呈线性爆炸；LEFT JOIN 只扫描一次。
	// 3. ALL_* 失败时回退到 USER_* 视图。
	var currentUser string
	if ru, err := dbConn.QueryContext(ctx, `SELECT USER FROM DUAL`); err == nil {
		ru.Next()
		_ = ru.Scan(&currentUser)
		ru.Close()
	}
	currentUser = strings.ToUpper(currentUser)
	useUserViews := currentUser != "" && currentUser == schema

	var rows *sql.Rows
	var err error
	if useUserViews {
		// USER_* 路径：无需 OWNER 过滤，USER_CONSTRAINTS 仅含当前用户约束，数据量最小
		query := `
			SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE,
				CASE WHEN c.NULLABLE = 'N' THEN 'NO' ELSE 'YES' END,
				CASE WHEN pk.COLUMN_NAME IS NULL THEN '' ELSE 'PRI' END,
				c.DATA_DEFAULT, NULL, NULL
			FROM USER_TAB_COLUMNS c
			LEFT JOIN (
				SELECT cc.TABLE_NAME, cc.COLUMN_NAME
				FROM USER_CONS_COLUMNS cc
				JOIN USER_CONSTRAINTS co
				  ON cc.CONSTRAINT_NAME = co.CONSTRAINT_NAME
				WHERE co.CONSTRAINT_TYPE = 'P'
			) pk ON pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
			ORDER BY c.TABLE_NAME, c.COLUMN_ID
		`
		rows, err = dbConn.QueryContext(ctx, query)
	} else {
		// ALL_* 路径：跨 schema 查询，用 LEFT JOIN 一次性完成主键判定
		query := `
			SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE,
				CASE WHEN c.NULLABLE = 'N' THEN 'NO' ELSE 'YES' END AS IS_NULLABLE,
				CASE WHEN pk.COLUMN_NAME IS NULL THEN '' ELSE 'PRI' END AS COLUMN_KEY,
				c.DATA_DEFAULT AS COLUMN_DEFAULT,
				NULL AS EXTRA,
				NULL AS COMMENT
			FROM ALL_TAB_COLUMNS c
			LEFT JOIN (
				SELECT cc.TABLE_NAME, cc.COLUMN_NAME, cc.OWNER
				FROM ALL_CONS_COLUMNS cc
				JOIN ALL_CONSTRAINTS co
				  ON cc.CONSTRAINT_NAME = co.CONSTRAINT_NAME AND cc.OWNER = co.OWNER
				WHERE co.CONSTRAINT_TYPE = 'P' AND co.OWNER = ?
			) pk ON pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME AND pk.OWNER = c.OWNER
			WHERE c.OWNER = ?
			ORDER BY c.TABLE_NAME, c.COLUMN_ID
		`
		rows, err = dbConn.QueryContext(ctx, query, schema, schema)
	}
	if err != nil {
		// fallback：权限不足或视图缺失时，用最简形式查（无主键信息）
		fallback := `
			SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE,
				CASE WHEN NULLABLE = 'N' THEN 'NO' ELSE 'YES' END,
				'', DATA_DEFAULT, NULL, NULL
			FROM ALL_TAB_COLUMNS
			WHERE OWNER = ?
			ORDER BY TABLE_NAME, COLUMN_ID
		`
		rows, err = dbConn.QueryContext(ctx, fallback, schema)
		if err != nil {
			return models.AllColumnsResult{}, err
		}
	}
	defer rows.Close()

	result := models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}
	for rows.Next() {
		var c models.ColumnInfo
		var tableName string
		var key, extra, comment sql.NullString
		var def sql.NullString
		if err := rows.Scan(&tableName, &c.ColumnName, &c.DataType, &c.IsNullable, &key, &def, &extra, &comment); err != nil {
			continue
		}
		c.ColumnDefault = nullStrEmpty(def)
		result.Tables[tableName] = append(result.Tables[tableName], c)
	}
	return result, rows.Err()
}

func damengGetColumns(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.ColumnInfo, error) {
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}
	// 达梦默认大写存储对象名（与 Oracle 一致），统一转大写匹配
	schema = strings.ToUpper(schema)
	tableNameUpper := strings.ToUpper(tableName)

	// 主查询：优先用 ALL_* 视图（比 DBA_* 权限要求低），含主键子查询
	query := `
		SELECT c.COLUMN_NAME, c.DATA_TYPE,
			CASE WHEN c.NULLABLE = 'N' THEN 'NO' ELSE 'YES' END AS IS_NULLABLE,
			CASE WHEN EXISTS (
				SELECT 1 FROM ALL_CONS_COLUMNS cc
				JOIN ALL_CONSTRAINTS co ON cc.CONSTRAINT_NAME = co.CONSTRAINT_NAME AND cc.OWNER = co.OWNER
				WHERE co.CONSTRAINT_TYPE = 'P'
					AND co.OWNER = c.OWNER
					AND co.TABLE_NAME = c.TABLE_NAME
					AND cc.COLUMN_NAME = c.COLUMN_NAME
			) THEN 'PRI' ELSE '' END AS COLUMN_KEY,
			c.DATA_DEFAULT AS COLUMN_DEFAULT,
			NULL AS EXTRA,
			NULL AS COMMENT
		FROM ALL_TAB_COLUMNS c
		WHERE c.OWNER = ? AND c.TABLE_NAME = ?
		ORDER BY c.COLUMN_ID
	`
	rows, err := dbConn.QueryContext(ctx, query, schema, tableNameUpper)
	if err != nil {
		// fallback：USER_* 视图（当前用户 schema，不需要 OWNER 过滤）
		query = `
			SELECT c.COLUMN_NAME, c.DATA_TYPE,
				CASE WHEN c.NULLABLE = 'N' THEN 'NO' ELSE 'YES' END,
				CASE WHEN EXISTS (
					SELECT 1 FROM USER_CONS_COLUMNS cc
					JOIN USER_CONSTRAINTS co ON cc.CONSTRAINT_NAME = co.CONSTRAINT_NAME
					WHERE co.CONSTRAINT_TYPE = 'P'
						AND co.TABLE_NAME = c.TABLE_NAME
						AND cc.COLUMN_NAME = c.COLUMN_NAME
				) THEN 'PRI' ELSE '' END,
				c.DATA_DEFAULT, NULL, NULL
			FROM USER_TAB_COLUMNS c
			WHERE c.TABLE_NAME = ?
			ORDER BY c.COLUMN_ID
		`
		rows, err = dbConn.QueryContext(ctx, query, tableNameUpper)
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
		c.ColumnKey = nullStr(key)
		c.ColumnDefault = nullStrEmpty(def)
		result = append(result, c)
	}
	return result, rows.Err()
}

func damengGetIndexes(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.IndexInfo, error) {
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}
	schema = strings.ToUpper(schema)
	tableNameUpper := strings.ToUpper(tableName)

	// IS_PRIMARY：达梦主键约束生成的索引名以 PK_ 开头（与 Oracle 一致）
	query := `
		SELECT i.INDEX_NAME, c.COLUMN_NAME,
			CASE WHEN i.UNIQUENESS = 'UNIQUE' THEN 1 ELSE 0 END AS IS_UNIQUE,
			CASE WHEN i.INDEX_NAME LIKE 'PK_%' THEN 1 ELSE 0 END AS IS_PRIMARY,
			c.COLUMN_POSITION AS SEQ_IN_INDEX
		FROM ALL_INDEXES i
		JOIN ALL_IND_COLUMNS c ON i.INDEX_NAME = c.INDEX_NAME AND i.OWNER = c.INDEX_OWNER
		WHERE i.TABLE_OWNER = ? AND i.TABLE_NAME = ?
		ORDER BY i.INDEX_NAME, c.COLUMN_POSITION
	`
	rows, err := dbConn.QueryContext(ctx, query, schema, tableNameUpper)
	if err != nil {
		// fallback：USER_* 视图
		query = `
			SELECT i.INDEX_NAME, c.COLUMN_NAME,
				CASE WHEN i.UNIQUENESS = 'UNIQUE' THEN 1 ELSE 0 END,
				CASE WHEN i.INDEX_NAME LIKE 'PK_%' THEN 1 ELSE 0 END,
				c.COLUMN_POSITION
			FROM USER_INDEXES i
			JOIN USER_IND_COLUMNS c ON i.INDEX_NAME = c.INDEX_NAME
			WHERE i.TABLE_NAME = ?
			ORDER BY i.INDEX_NAME, c.COLUMN_POSITION
		`
		rows, err = dbConn.QueryContext(ctx, query, tableNameUpper)
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

func damengGetForeignKeys(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.ForeignKeyInfo, error) {
	schema := "SYSDBA"
	if database != nil && *database != "" {
		schema = *database
	}
	schema = strings.ToUpper(schema)
	tableNameUpper := strings.ToUpper(tableName)

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
			rows, err = dbConn.QueryContext(ctx, query, tableNameUpper)
		} else {
			rows, err = dbConn.QueryContext(ctx, query, schema, tableNameUpper)
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

func damengGetTableStructure(ctx context.Context, dbConn db.Executor, tableName string, database *string) (models.TableStructure, error) {
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
	if result.Columns == nil {
		result.Columns = []models.ColumnInfo{}
	}
	if result.Indexes == nil {
		result.Indexes = []models.IndexInfo{}
	}
	if result.ForeignKeys == nil {
		result.ForeignKeys = []models.ForeignKeyInfo{}
	}
	return result, nil
}

func damengGetRoutines(ctx context.Context, dbConn db.Executor, database *string) (models.RoutinesResult, error) {
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

func damengGetRoutineBody(ctx context.Context, dbConn db.Executor, database, routineName, routineType string) (string, error) {
	schema := "SYSDBA"
	if database != "" {
		schema = database
	}
	query := `SELECT TEXT FROM SYS.DBA_SOURCE WHERE OWNER = ? AND NAME = ? AND TYPE = ? ORDER BY LINE`
	routineTypeUpper := strings.ToUpper(routineType)
	rows, err := dbConn.QueryContext(ctx, query, schema, routineName, routineTypeUpper)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var sb strings.Builder
	for rows.Next() {
		var text sql.NullString
		if err := rows.Scan(&text); err != nil {
			return "", err
		}
		if text.Valid {
			sb.WriteString(text.String)
		}
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	return sb.String(), nil
}
