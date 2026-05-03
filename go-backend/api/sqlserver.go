package api

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"idblink-backend/db"
	"idblink-backend/models"
)

func sqlserverGetDatabases(ctx context.Context, dbConn db.Executor) ([]string, error) {
	query := `SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb') ORDER BY name`
	rows, err := dbConn.QueryContext(ctx, query)
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

func sqlserverGetTables(ctx context.Context, dbConn db.Executor, database *string) ([]models.TableInfo, error) {
	query := `
		SELECT t.name AS table_name,
			CASE WHEN t.type = 'U' THEN 'BASE TABLE' WHEN t.type = 'V' THEN 'VIEW' ELSE 'OTHER' END AS table_type,
			NULL AS row_count,
			COALESCE(ep.value, '') AS comment,
			NULL AS engine, NULL AS data_size, NULL AS index_size,
			NULL AS create_time, NULL AS update_time, NULL AS collation
		FROM sys.tables t
		LEFT JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
		UNION ALL
		SELECT v.name AS table_name,
			'VIEW' AS table_type,
			NULL AS row_count,
			COALESCE(ep.value, '') AS comment,
			NULL AS engine, NULL AS data_size, NULL AS index_size,
			NULL AS create_time, NULL AS update_time, NULL AS collation
		FROM sys.views v
		LEFT JOIN sys.extended_properties ep ON ep.major_id = v.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
		ORDER BY table_name
	`
	if database != nil && *database != "" {
		query = fmt.Sprintf(`
			SELECT t.name AS table_name,
				CASE WHEN t.type = 'U' THEN 'BASE TABLE' WHEN t.type = 'V' THEN 'VIEW' ELSE 'OTHER' END AS table_type,
				NULL AS row_count,
				COALESCE(ep.value, '') AS comment,
				NULL AS engine, NULL AS data_size, NULL AS index_size,
				NULL AS create_time, NULL AS update_time, NULL AS collation
			FROM %s.sys.tables t
			LEFT JOIN %s.sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
			UNION ALL
			SELECT v.name AS table_name,
				'VIEW' AS table_type,
				NULL AS row_count,
				COALESCE(ep.value, '') AS comment,
				NULL AS engine, NULL AS data_size, NULL AS index_size,
				NULL AS create_time, NULL AS update_time, NULL AS collation
			FROM %s.sys.views v
			LEFT JOIN %s.sys.extended_properties ep ON ep.major_id = v.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
			ORDER BY table_name
		`, *database, *database, *database, *database)
	}

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

func sqlserverGetTablesCategorized(ctx context.Context, dbConn db.Executor, database *string, search *string) (models.TablesResult, error) {
	result := models.TablesResult{
		Tables: []models.TableInfo{},
		Views:  []models.TableInfo{},
	}

	tables, err := sqlserverGetTables(ctx, dbConn, database)
	if err != nil {
		return result, err
	}

	for _, t := range tables {
		if search != nil && *search != "" {
			s := strings.ToLower(*search)
			if !strings.Contains(strings.ToLower(t.TableName), s) {
				continue
			}
		}
		switch t.TableType {
		case "VIEW":
			result.Views = append(result.Views, t)
		default:
			result.Tables = append(result.Tables, t)
		}
	}
	return result, nil
}

func sqlserverGetColumns(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.ColumnInfo, error) {
	query := `
		SELECT c.name AS column_name,
			COALESCE(t.name + CASE 
				WHEN t.name IN ('varchar', 'nvarchar', 'char', 'nchar', 'varbinary') THEN '(' + CAST(c.max_length AS VARCHAR) + ')'
				WHEN t.name IN ('decimal', 'numeric') THEN '(' + CAST(c.precision AS VARCHAR) + ',' + CAST(c.scale AS VARCHAR) + ')'
				ELSE ''
			END, t.name) AS data_type,
			CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS is_nullable,
			CASE WHEN ic.is_primary_key = 1 THEN 'PRI' WHEN ic.is_unique_constraint = 1 THEN 'UNI' ELSE '' END AS column_key,
			COALESCE(dc.definition, '') AS column_default,
			CASE WHEN c.is_identity = 1 THEN 'auto_increment' ELSE '' END AS extra,
			COALESCE(ep.value, '') AS comment
		FROM sys.columns c
		JOIN sys.types t ON c.user_type_id = t.user_type_id
		JOIN sys.tables tbl ON c.object_id = tbl.object_id
		LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id AND dc.parent_object_id = tbl.object_id
		LEFT JOIN sys.index_columns ic ON ic.object_id = tbl.object_id AND ic.column_id = c.column_id
		LEFT JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		LEFT JOIN sys.extended_properties ep ON ep.major_id = tbl.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
		WHERE tbl.name = @p1
		ORDER BY c.column_id
	`
	if database != nil && *database != "" {
		query = fmt.Sprintf(`
			SELECT c.name AS column_name,
				COALESCE(t.name + CASE 
					WHEN t.name IN ('varchar', 'nvarchar', 'char', 'nchar', 'varbinary') THEN '(' + CAST(c.max_length AS VARCHAR) + ')'
					WHEN t.name IN ('decimal', 'numeric') THEN '(' + CAST(c.precision AS VARCHAR) + ',' + CAST(c.scale AS VARCHAR) + ')'
					ELSE ''
				END, t.name) AS data_type,
				CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS is_nullable,
				CASE WHEN ic.is_primary_key = 1 THEN 'PRI' WHEN ic.is_unique_constraint = 1 THEN 'UNI' ELSE '' END AS column_key,
				COALESCE(dc.definition, '') AS column_default,
				CASE WHEN c.is_identity = 1 THEN 'auto_increment' ELSE '' END AS extra,
				COALESCE(ep.value, '') AS comment
			FROM %s.sys.columns c
			JOIN %s.sys.types t ON c.user_type_id = t.user_type_id
			JOIN %s.sys.tables tbl ON c.object_id = tbl.object_id
			LEFT JOIN %s.sys.default_constraints dc ON c.default_object_id = dc.object_id AND dc.parent_object_id = tbl.object_id
			LEFT JOIN %s.sys.index_columns ic ON ic.object_id = tbl.object_id AND ic.column_id = c.column_id
			LEFT JOIN %s.sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
			LEFT JOIN %s.sys.extended_properties ep ON ep.major_id = tbl.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
			WHERE tbl.name = @p1
			ORDER BY c.column_id
		`, *database, *database, *database, *database, *database, *database, *database)
	}

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

func sqlserverGetIndexes(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.IndexInfo, error) {
	query := `
		SELECT i.name AS index_name, c.name AS column_name,
			i.is_unique AS is_unique, i.is_primary_key AS is_primary,
			ic.key_ordinal AS seq_in_index
		FROM sys.indexes i
		JOIN sys.tables t ON i.object_id = t.object_id
		JOIN sys.index_columns ic ON ic.object_id = t.object_id AND ic.index_id = i.index_id
		JOIN sys.columns c ON c.object_id = t.object_id AND c.column_id = ic.column_id
		WHERE t.name = @p1 AND i.type > 0
		ORDER BY i.name, ic.key_ordinal
	`
	if database != nil && *database != "" {
		query = fmt.Sprintf(`
			SELECT i.name AS index_name, c.name AS column_name,
				i.is_unique AS is_unique, i.is_primary_key AS is_primary,
				ic.key_ordinal AS seq_in_index
			FROM %s.sys.indexes i
			JOIN %s.sys.tables t ON i.object_id = t.object_id
			JOIN %s.sys.index_columns ic ON ic.object_id = t.object_id AND ic.index_id = i.index_id
			JOIN %s.sys.columns c ON c.object_id = t.object_id AND c.column_id = ic.column_id
			WHERE t.name = @p1 AND i.type > 0
			ORDER BY i.name, ic.key_ordinal
		`, *database, *database, *database, *database)
	}

	rows, err := dbConn.QueryContext(ctx, query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.IndexInfo
	for rows.Next() {
		var idx models.IndexInfo
		if err := rows.Scan(&idx.IndexName, &idx.ColumnName, &idx.IsUnique, &idx.IsPrimary, &idx.SeqInIndex); err != nil {
			return nil, err
		}
		result = append(result, idx)
	}
	return result, rows.Err()
}

func sqlserverGetForeignKeys(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.ForeignKeyInfo, error) {
	query := `
		SELECT fk.name AS constraint_name, c.name AS column_name,
			ref_t.name AS referenced_table, ref_c.name AS referenced_column
		FROM sys.foreign_keys fk
		JOIN sys.tables t ON fk.parent_object_id = t.object_id
		JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
		JOIN sys.columns c ON c.object_id = t.object_id AND c.column_id = fkc.parent_column_id
		JOIN sys.tables ref_t ON ref_t.object_id = fk.referenced_object_id
		JOIN sys.columns ref_c ON ref_c.object_id = ref_t.object_id AND ref_c.column_id = fkc.referenced_column_id
		WHERE t.name = @p1
		ORDER BY fk.name
	`
	if database != nil && *database != "" {
		query = fmt.Sprintf(`
			SELECT fk.name AS constraint_name, c.name AS column_name,
				ref_t.name AS referenced_table, ref_c.name AS referenced_column
			FROM %s.sys.foreign_keys fk
			JOIN %s.sys.tables t ON fk.parent_object_id = t.object_id
			JOIN %s.sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
			JOIN %s.sys.columns c ON c.object_id = t.object_id AND c.column_id = fkc.parent_column_id
			JOIN %s.sys.tables ref_t ON ref_t.object_id = fk.referenced_object_id
			JOIN %s.sys.columns ref_c ON ref_c.object_id = ref_t.object_id AND ref_c.column_id = fkc.referenced_column_id
			WHERE t.name = @p1
			ORDER BY fk.name
		`, *database, *database, *database, *database, *database, *database)
	}

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

func sqlserverGetTableStructure(ctx context.Context, dbConn db.Executor, tableName string, database *string) (models.TableStructure, error) {
	var result models.TableStructure
	var err error
	result.Columns, err = sqlserverGetColumns(ctx, dbConn, tableName, database)
	if err != nil {
		return result, err
	}
	result.Indexes, err = sqlserverGetIndexes(ctx, dbConn, tableName, database)
	if err != nil {
		return result, err
	}
	result.ForeignKeys, err = sqlserverGetForeignKeys(ctx, dbConn, tableName, database)
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

func sqlserverGetRoutines(ctx context.Context, dbConn db.Executor, database *string) (models.RoutinesResult, error) {
	var result models.RoutinesResult
	query := `
		SELECT ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_DEFINITION
		FROM INFORMATION_SCHEMA.ROUTINES
		WHERE ROUTINE_SCHEMA NOT IN ('sys')
		ORDER BY ROUTINE_NAME
	`
	if database != nil && *database != "" {
		query = fmt.Sprintf(`
			SELECT ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_DEFINITION
			FROM %s.INFORMATION_SCHEMA.ROUTINES
			WHERE ROUTINE_SCHEMA NOT IN ('sys')
			ORDER BY ROUTINE_NAME
		`, *database)
	}

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
		if strings.ToUpper(r.RoutineType) == "PROCEDURE" {
			result.Procedures = append(result.Procedures, r)
		} else {
			result.Functions = append(result.Functions, r)
		}
	}
	return result, rows.Err()
}

func sqlserverGetRoutineBody(ctx context.Context, dbConn db.Executor, database, routineName, routineType string) (string, error) {
	var def sql.NullString
	query := `SELECT ROUTINE_DEFINITION FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = @p1 AND ROUTINE_NAME = @p2 AND ROUTINE_TYPE = @p3`
	if database != "" {
		query = fmt.Sprintf(`SELECT ROUTINE_DEFINITION FROM %s.INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA NOT IN ('sys') AND ROUTINE_NAME = @p2 AND ROUTINE_TYPE = @p3`, database)
	}
	err := dbConn.QueryRowContext(ctx, query, database, routineName, routineType).Scan(&def)
	if err != nil {
		return "", err
	}
	if !def.Valid {
		return "", nil
	}
	return def.String, nil
}
