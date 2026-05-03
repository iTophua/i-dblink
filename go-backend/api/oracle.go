package api

import (
	"context"
	"database/sql"
	"strings"

	"idblink-backend/db"
	"idblink-backend/models"
)

func oracleGetDatabases(ctx context.Context, dbConn db.Executor) ([]string, error) {
	// Oracle 没有数据库概念，返回服务名
	rows, err := dbConn.QueryContext(ctx, "SELECT sys_context('USERENV', 'SERVICE_NAME') FROM dual")
	if err != nil {
		return nil, err
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

func oracleGetTables(ctx context.Context, dbConn db.Executor, database *string) ([]models.TableInfo, error) {
	query := `
		SELECT t.table_name,
			CASE WHEN t.table_type = 'TABLE' THEN 'BASE TABLE' ELSE t.table_type END AS table_type,
			NULL AS row_count,
			COALESCE(c.comments, '') AS comment,
			NULL AS engine, NULL AS data_size, NULL AS index_size,
			NULL AS create_time, NULL AS update_time, NULL AS collation
		FROM user_tables t
		LEFT JOIN user_tab_comments c ON c.table_name = t.table_name
		ORDER BY t.table_name
	`
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.TableInfo
	for rows.Next() {
		var t models.TableInfo
		var comment string
		var tmp1, tmp2, tmp3, tmp4, tmp5, tmp6 interface{}
		if err := rows.Scan(&t.TableName, &t.TableType, &tmp1, &comment, &tmp2, &tmp3, &tmp4, &tmp5, &tmp6); err != nil {
			return nil, err
		}
		t.Comment = strPtr(comment)
		result = append(result, t)
	}
	return result, rows.Err()
}

func oracleGetTablesCategorized(ctx context.Context, dbConn db.Executor, database *string, search *string) (models.TablesResult, error) {
	result := models.TablesResult{
		Tables: []models.TableInfo{},
		Views:  []models.TableInfo{},
	}

	tables, err := oracleGetTables(ctx, dbConn, database)
	if err != nil {
		return result, err
	}

	// 获取视图列表
	viewQuery := `SELECT view_name FROM user_views ORDER BY view_name`
	viewRows, err := dbConn.QueryContext(ctx, viewQuery)
	if err != nil {
		return result, err
	}
	defer viewRows.Close()

	viewSet := make(map[string]bool)
	for viewRows.Next() {
		var name string
		if err := viewRows.Scan(&name); err == nil {
			viewSet[name] = true
		}
	}

	for _, t := range tables {
		if search != nil && *search != "" {
			s := strings.ToLower(*search)
			if !strings.Contains(strings.ToLower(t.TableName), s) {
				continue
			}
		}
		if viewSet[t.TableName] {
			t.TableType = "VIEW"
			result.Views = append(result.Views, t)
		} else {
			result.Tables = append(result.Tables, t)
		}
	}
	return result, nil
}

func oracleGetColumns(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.ColumnInfo, error) {
	query := `
		SELECT c.column_name,
			c.data_type || CASE 
				WHEN c.data_type IN ('VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR', 'RAW') THEN '(' || c.data_length || ')'
				WHEN c.data_type IN ('NUMBER', 'DECIMAL') THEN '(' || c.data_precision || ',' || c.data_scale || ')'
				ELSE ''
			END AS data_type,
			CASE WHEN c.nullable = 'N' THEN 'NO' ELSE 'YES' END AS is_nullable,
			CASE WHEN c.column_name IN (SELECT column_name FROM user_cons_columns WHERE constraint_name IN (SELECT constraint_name FROM user_constraints WHERE table_name = c.table_name AND constraint_type = 'P')) THEN 'PRI' ELSE '' END AS column_key,
			COALESCE(c.data_default, '') AS column_default,
			CASE WHEN c.identity_column = 'YES' THEN 'auto_increment' ELSE '' END AS extra,
			COALESCE(cc.comments, '') AS comment
		FROM user_tab_columns c
		LEFT JOIN user_col_comments cc ON cc.table_name = c.table_name AND cc.column_name = c.column_name
		WHERE c.table_name = UPPER(:1)
		ORDER BY c.column_id
	`
	rows, err := dbConn.QueryContext(ctx, query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ColumnInfo
	for rows.Next() {
		var c models.ColumnInfo
		var key, def, extra, comment string
		if err := rows.Scan(&c.ColumnName, &c.DataType, &c.IsNullable, &key, &def, &extra, &comment); err != nil {
			return nil, err
		}
		c.ColumnKey = strPtr(key)
		c.ColumnDefault = strPtr(def)
		c.Extra = strPtr(extra)
		c.Comment = strPtr(comment)
		result = append(result, c)
	}
	return result, rows.Err()
}

func oracleGetIndexes(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.IndexInfo, error) {
	query := `
		SELECT i.index_name, c.column_name,
			CASE WHEN i.uniqueness = 'UNIQUE' THEN 1 ELSE 0 END AS is_unique,
			CASE WHEN i.index_name LIKE 'PK_%' THEN 1 ELSE 0 END AS is_primary,
			c.column_position AS seq_in_index
		FROM user_indexes i
		JOIN user_ind_columns c ON c.index_name = i.index_name AND c.table_name = i.table_name
		WHERE i.table_name = UPPER(:1)
		ORDER BY i.index_name, c.column_position
	`
	rows, err := dbConn.QueryContext(ctx, query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.IndexInfo
	for rows.Next() {
		var idx models.IndexInfo
		var isUnique, isPrimary int
		if err := rows.Scan(&idx.IndexName, &idx.ColumnName, &isUnique, &isPrimary, &idx.SeqInIndex); err != nil {
			return nil, err
		}
		idx.IsUnique = isUnique == 1
		idx.IsPrimary = isPrimary == 1
		result = append(result, idx)
	}
	return result, rows.Err()
}

func oracleGetForeignKeys(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.ForeignKeyInfo, error) {
	query := `
		SELECT c.constraint_name, cc.column_name,
			rcc.table_name AS referenced_table,
			rcc.column_name AS referenced_column
		FROM user_constraints c
		JOIN user_cons_columns cc ON cc.constraint_name = c.constraint_name AND cc.table_name = c.table_name
		JOIN user_cons_columns rcc ON rcc.constraint_name = c.r_constraint_name
		WHERE c.constraint_type = 'R' AND c.table_name = UPPER(:1)
		ORDER BY c.constraint_name
	`
	rows, err := dbConn.QueryContext(ctx, query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ForeignKeyInfo
	for rows.Next() {
		var fk models.ForeignKeyInfo
		if err := rows.Scan(&fk.ConstraintName, &fk.ColumnName, &fk.ReferencedTable, &fk.ReferencedColumn); err != nil {
			return nil, err
		}
		result = append(result, fk)
	}
	return result, rows.Err()
}

func oracleGetTableStructure(ctx context.Context, dbConn db.Executor, tableName string, database *string) (models.TableStructure, error) {
	var result models.TableStructure
	var err error
	result.Columns, err = oracleGetColumns(ctx, dbConn, tableName, database)
	if err != nil {
		return result, err
	}
	result.Indexes, err = oracleGetIndexes(ctx, dbConn, tableName, database)
	if err != nil {
		return result, err
	}
	result.ForeignKeys, err = oracleGetForeignKeys(ctx, dbConn, tableName, database)
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

func oracleGetRoutines(ctx context.Context, dbConn db.Executor, database *string) (models.RoutinesResult, error) {
	var result models.RoutinesResult
	// Oracle 的存储过程和函数
	query := `
		SELECT object_name, object_type, NULL AS definition
		FROM user_objects
		WHERE object_type IN ('PROCEDURE', 'FUNCTION')
		ORDER BY object_name
	`
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var r models.RoutineInfo
		var def sql.NullString
		if err := rows.Scan(&r.RoutineName, &r.RoutineType, &def); err != nil {
			continue
		}
		r.Definition = nullStr(def)
		if r.RoutineType == "PROCEDURE" {
			result.Procedures = append(result.Procedures, r)
		} else {
			result.Functions = append(result.Functions, r)
		}
	}
	return result, rows.Err()
}

func oracleGetRoutineBody(ctx context.Context, dbConn db.Executor, database, routineName, routineType string) (string, error) {
	var def sql.NullString
	query := `SELECT text FROM user_source WHERE name = UPPER(:1) AND type = UPPER(:2) ORDER BY line`
	err := dbConn.QueryRowContext(ctx, query, routineName, routineType).Scan(&def)
	if err != nil {
		return "", err
	}
	if !def.Valid {
		return "", nil
	}
	return def.String, nil
}
