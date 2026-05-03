package api

import (
	"context"
	"database/sql"
	"strings"

	"idblink-backend/db"
	"idblink-backend/models"
)

func postgresGetDatabases(ctx context.Context, dbConn db.Executor) ([]string, error) {
	query := `SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres', 'template0', 'template1') ORDER BY datname`
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

func postgresGetTables(ctx context.Context, dbConn db.Executor, _database *string) ([]models.TableInfo, error) {
	query := `
		SELECT c.relname AS table_name,
			CASE c.relkind WHEN 'r' THEN 'BASE TABLE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'OTHER' END AS table_type,
			NULL::bigint AS row_count,
			COALESCE(d.description, '') AS comment,
			NULL AS engine, NULL AS data_size, NULL AS index_size,
			NULL AS create_time, NULL AS update_time, NULL AS collation
		FROM pg_catalog.pg_class c
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = 0
		WHERE c.relkind IN ('r','v','m','f')
			AND n.nspname NOT IN ('pg_catalog', 'information_schema')
			AND n.nspname NOT LIKE 'pg_toast%'
		ORDER BY c.relname
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

func postgresGetTablesCategorized(ctx context.Context, dbConn db.Executor, _database *string, search *string) (models.TablesResult, error) {
	result := models.TablesResult{
		Tables: []models.TableInfo{},
		Views:  []models.TableInfo{},
	}
	var query string
	var args []interface{}

	if search != nil && *search != "" {
		query = `
			SELECT c.relname AS table_name,
				CASE c.relkind WHEN 'r' THEN 'BASE TABLE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'OTHER' END AS table_type,
				NULL::bigint AS row_count,
				COALESCE(d.description, '') AS comment,
				NULL AS engine, NULL AS data_size, NULL AS index_size,
				NULL AS create_time, NULL AS update_time, NULL AS collation
			FROM pg_catalog.pg_class c
			JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = 0
			WHERE c.relkind IN ('r','v','m','f')
				AND n.nspname NOT IN ('pg_catalog', 'information_schema')
				AND n.nspname NOT LIKE 'pg_toast%'
				AND c.relname LIKE $1
			ORDER BY c.relname
		`
		args = append(args, "%"+*search+"%")
	} else {
		query = `
			SELECT c.relname AS table_name,
				CASE c.relkind WHEN 'r' THEN 'BASE TABLE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'OTHER' END AS table_type,
				NULL::bigint AS row_count,
				COALESCE(d.description, '') AS comment,
				NULL AS engine, NULL AS data_size, NULL AS index_size,
				NULL AS create_time, NULL AS update_time, NULL AS collation
			FROM pg_catalog.pg_class c
			JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = 0
			WHERE c.relkind IN ('r','v','m','f')
				AND n.nspname NOT IN ('pg_catalog', 'information_schema')
				AND n.nspname NOT LIKE 'pg_toast%'
			ORDER BY c.relname
		`
	}

	rows, err := dbConn.QueryContext(ctx, query, args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var t models.TableInfo
		var comment string
		var tmp1, tmp2, tmp3, tmp4, tmp5, tmp6 interface{}
		if err := rows.Scan(&t.TableName, &t.TableType, &tmp1, &comment, &tmp2, &tmp3, &tmp4, &tmp5, &tmp6); err != nil {
			continue
		}
		t.Comment = strPtr(comment)
		switch t.TableType {
		case "VIEW", "MATERIALIZED VIEW":
			result.Views = append(result.Views, t)
		default:
			result.Tables = append(result.Tables, t)
		}
	}
	return result, rows.Err()
}

func postgresGetColumns(ctx context.Context, dbConn db.Executor, tableName string, _database *string) ([]models.ColumnInfo, error) {
	query := `
		SELECT a.attname AS column_name,
			pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
			CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
			CASE WHEN i.indisprimary THEN 'PRI' WHEN i.indisunique THEN 'UNI' ELSE '' END AS column_key,
			pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default,
			'' AS extra,
			COALESCE(col_description(c.oid, a.attnum), '') AS comment
		FROM pg_catalog.pg_attribute a
		JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
		LEFT JOIN pg_catalog.pg_index i ON i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey)
		WHERE a.attnum > 0 AND NOT a.attisdropped
			AND c.relname = $1
			AND n.nspname NOT IN ('pg_catalog', 'information_schema')
			AND n.nspname NOT LIKE 'pg_toast%'
		ORDER BY a.attnum
	`
	rows, err := dbConn.QueryContext(ctx, query, tableName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ColumnInfo
	for rows.Next() {
		var c models.ColumnInfo
		var key, comment, extra string
		var def sql.NullString
		if err := rows.Scan(&c.ColumnName, &c.DataType, &c.IsNullable, &key, &def, &extra, &comment); err != nil {
			return nil, err
		}
		c.ColumnKey = strPtr(key)
		c.ColumnDefault = nullStrEmpty(def)
		c.Extra = strPtr(extra)
		c.Comment = strPtr(comment)
		result = append(result, c)
	}
	return result, rows.Err()
}

func postgresGetIndexes(ctx context.Context, dbConn db.Executor, tableName string, _database *string) ([]models.IndexInfo, error) {
	query := `
		SELECT i.relname AS index_name, a.attname AS column_name,
			ix.indisunique AS is_unique, ix.indisprimary AS is_primary,
			1 AS seq_in_index
		FROM pg_index ix
		JOIN pg_class t ON t.oid = ix.indrelid
		JOIN pg_class i ON i.oid = ix.indexrelid
		JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
		WHERE t.relname = $1
		ORDER BY i.relname, a.attnum
	`
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

func postgresGetForeignKeys(ctx context.Context, dbConn db.Executor, tableName string, _database *string) ([]models.ForeignKeyInfo, error) {
	query := `
		SELECT tc.constraint_name, kcu.column_name,
			ccu.table_name AS referenced_table,
			ccu.column_name AS referenced_column
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
		JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
		WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
		ORDER BY tc.constraint_name, kcu.ordinal_position
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

func postgresGetTableStructure(ctx context.Context, dbConn db.Executor, tableName string, _database *string) (models.TableStructure, error) {
	var result models.TableStructure
	var err error
	result.Columns, err = postgresGetColumns(ctx, dbConn, tableName, _database)
	if err != nil {
		return result, err
	}
	result.Indexes, err = postgresGetIndexes(ctx, dbConn, tableName, _database)
	if err != nil {
		return result, err
	}
	result.ForeignKeys, err = postgresGetForeignKeys(ctx, dbConn, tableName, _database)
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

func postgresGetRoutines(ctx context.Context, dbConn db.Executor, _database *string) (models.RoutinesResult, error) {
	var result models.RoutinesResult
	query := `
		SELECT routine_name, routine_type, routine_definition
		FROM information_schema.routines
		WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
		ORDER BY routine_name
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
		if strings.ToUpper(r.RoutineType) == "PROCEDURE" {
			result.Procedures = append(result.Procedures, r)
		} else {
			result.Functions = append(result.Functions, r)
		}
	}
	return result, rows.Err()
}

func postgresGetRoutineBody(ctx context.Context, dbConn db.Executor, database, routineName, routineType string) (string, error) {
	var def sql.NullString
	query := `SELECT routine_definition FROM information_schema.routines WHERE routine_schema = $1 AND routine_name = $2 AND routine_type = $3`
	err := dbConn.QueryRowContext(ctx, query, database, routineName, routineType).Scan(&def)
	if err != nil {
		return "", err
	}
	if !def.Valid {
		return "", nil
	}
	return def.String, nil
}
