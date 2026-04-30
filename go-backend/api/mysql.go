package api

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"idblink-backend/db"
	"idblink-backend/models"
)

func mysqlGetDatabases(ctx context.Context, dbConn db.Executor) ([]string, error) {
	rows, err := dbConn.QueryContext(ctx, "SHOW DATABASES")
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
		if name != "information_schema" && name != "mysql" && name != "performance_schema" && name != "sys" {
			result = append(result, name)
		}
	}
	return result, rows.Err()
}

func mysqlGetTables(ctx context.Context, dbConn db.Executor, database *string) ([]models.TableInfo, error) {
	query := `
		SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS,
			COALESCE(TABLE_COMMENT, '') AS TABLE_COMMENT,
			COALESCE(ENGINE, '') AS ENGINE,
			DATA_LENGTH, INDEX_LENGTH,
			COALESCE(DATE_FORMAT(CREATE_TIME, '%%Y-%%m-%%d %%H:%%i:%%s'), '') AS CREATE_TIME,
			COALESCE(DATE_FORMAT(UPDATE_TIME, '%%Y-%%m-%%d %%H:%%i:%%s'), '') AS UPDATE_TIME,
			COALESCE(TABLE_COLLATION, '') AS TABLE_COLLATION
		FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE != 'SYSTEM VIEW'
		ORDER BY TABLE_NAME
	`
	var args []any
	if database != nil {
		query = `
			SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS,
				COALESCE(TABLE_COMMENT, '') AS TABLE_COMMENT,
				COALESCE(ENGINE, '') AS ENGINE,
				DATA_LENGTH, INDEX_LENGTH,
				COALESCE(DATE_FORMAT(CREATE_TIME, '%%Y-%%m-%%d %%H:%%i:%%s'), '') AS CREATE_TIME,
				COALESCE(DATE_FORMAT(UPDATE_TIME, '%%Y-%%m-%%d %%H:%%i:%%s'), '') AS UPDATE_TIME,
				COALESCE(TABLE_COLLATION, '') AS TABLE_COLLATION
			FROM information_schema.TABLES
			WHERE TABLE_SCHEMA = ? AND TABLE_TYPE != 'SYSTEM VIEW'
			ORDER BY TABLE_NAME
		`
		args = append(args, *database)
	}

	rows, err := dbConn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.TableInfo
	for rows.Next() {
		var t models.TableInfo
		var comment, engine, createTime, updateTime, collation string
		var dataLen, idxLen sql.NullInt64
		var rowCount sql.NullInt64
		if err := rows.Scan(&t.TableName, &t.TableType, &rowCount, &comment, &engine, &dataLen, &idxLen, &createTime, &updateTime, &collation); err != nil {
			return nil, err
		}
		t.RowCount = nullInt64ToUInt64(rowCount)
		t.Comment = strPtr(comment)
		t.Engine = strPtr(engine)
		t.DataSize = formatBytes(dataLen)
		t.IndexSize = formatBytes(idxLen)
		t.CreateTime = strPtr(createTime)
		t.UpdateTime = strPtr(updateTime)
		t.Collation = strPtr(collation)
		result = append(result, t)
	}
	return result, rows.Err()
}

func mysqlGetTablesCategorized(ctx context.Context, dbConn db.Executor, database *string, search *string) (models.TablesResult, error) {
	result := models.TablesResult{
		Tables: []models.TableInfo{},
		Views:  []models.TableInfo{},
	}
	if database == nil || *database == "" {
		return result, fmt.Errorf("database name is required")
	}

	safeDb := strings.ReplaceAll(*database, "`", "``")
	query := fmt.Sprintf("SHOW TABLE STATUS FROM `%s`", safeDb)

	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var name, engine sql.NullString
		var rowCount, dataLen, idxLen sql.NullInt64
		var createTime, updateTime sql.NullTime
		var comment sql.NullString
		var collation sql.NullString

		// SHOW TABLE STATUS 返回18列：
		// Name, Engine, Version, Row_format, Rows, Avg_row_length, Data_length,
		// Max_data_length, Index_length, Data_free, Auto_increment, Create_time,
		// Update_time, Check_time, Collation, Checksum, Create_options, Comment
		var tmp1, tmp2, tmp3, tmp4, tmp5, tmp6, tmp7, tmp8, tmp9 interface{}
		if err := rows.Scan(&name, &engine, &tmp1, &tmp2, &rowCount, &tmp3, &dataLen, &tmp4, &idxLen, &tmp5, &tmp6, &createTime, &updateTime, &tmp7, &collation, &tmp8, &tmp9, &comment); err != nil {
			// 不同 MySQL 版本列数不同，尝试只 scan 已知列
			continue
		}

		isView := comment.Valid && strings.Contains(comment.String, "VIEW")
		info := models.TableInfo{
			TableName:  name.String,
			TableType:  map[bool]string{true: "VIEW", false: "BASE TABLE"}[isView],
			RowCount:   nullInt64ToUInt64(rowCount),
			Comment:    nullStr(comment),
			Engine:     nullStr(engine),
			DataSize:   formatBytes(dataLen),
			IndexSize:  formatBytes(idxLen),
			CreateTime: formatNullTime(createTime),
			UpdateTime: formatNullTime(updateTime),
			Collation:  nullStr(collation),
		}

		if isView {
			result.Views = append(result.Views, info)
		} else {
			result.Tables = append(result.Tables, info)
		}
	}

	if search != nil && *search != "" {
		s := strings.ToLower(*search)
		filteredTables := result.Tables[:0]
		for _, t := range result.Tables {
			if strings.Contains(strings.ToLower(t.TableName), s) {
				filteredTables = append(filteredTables, t)
			}
		}
		result.Tables = filteredTables

		filteredViews := result.Views[:0]
		for _, v := range result.Views {
			if strings.Contains(strings.ToLower(v.TableName), s) {
				filteredViews = append(filteredViews, v)
			}
		}
		result.Views = filteredViews
	}

	return result, rows.Err()
}

func mysqlGetColumns(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.ColumnInfo, error) {
	query := `
		SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY,
			COLUMN_DEFAULT, EXTRA, COALESCE(COLUMN_COMMENT, '') AS COLUMN_COMMENT
		FROM information_schema.COLUMNS
		WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
		ORDER BY ORDINAL_POSITION
	`
	var args []any
	if database != nil {
		query = `
			SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY,
				COLUMN_DEFAULT, EXTRA, COALESCE(COLUMN_COMMENT, '') AS COLUMN_COMMENT
			FROM information_schema.COLUMNS
			WHERE TABLE_NAME = ? AND TABLE_SCHEMA = ?
			ORDER BY ORDINAL_POSITION
		`
		args = append(args, *database)
	}
	args = append(args, tableName)

	rows, err := dbConn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ColumnInfo
	for rows.Next() {
		var c models.ColumnInfo
		var key, extra, comment string
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

func mysqlGetIndexes(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.IndexInfo, error) {
	safeTable := strings.ReplaceAll(tableName, "`", "``")
	var query string
	if database != nil {
		safeDb := strings.ReplaceAll(*database, "`", "``")
		query = fmt.Sprintf("SHOW INDEX FROM `%s`.`%s`", safeDb, safeTable)
	} else {
		query = fmt.Sprintf("SHOW INDEX FROM `%s`", safeTable)
	}

	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.IndexInfo
	for rows.Next() {
		var idx models.IndexInfo
		var nonUnique bool
		var seqInIndex sql.NullInt64
		var keyName, colName string
		// SHOW INDEX 列：Table, Non_unique, Key_name, Seq_in_index, Column_name, ...
		var table, tmp1, tmp2, tmp3, tmp4, tmp5, tmp6 interface{}
		if err := rows.Scan(&table, &nonUnique, &keyName, &seqInIndex, &colName, &tmp1, &tmp2, &tmp3, &tmp4, &tmp5, &tmp6); err != nil {
			continue
		}
		idx.IndexName = keyName
		idx.ColumnName = colName
		idx.IsUnique = !nonUnique
		idx.IsPrimary = keyName == "PRIMARY"
		if seqInIndex.Valid {
			idx.SeqInIndex = seqInIndex.Int64
		}
		result = append(result, idx)
	}
	return result, rows.Err()
}

func mysqlGetForeignKeys(ctx context.Context, dbConn db.Executor, tableName string, database *string) ([]models.ForeignKeyInfo, error) {
	query := `
		SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
		FROM information_schema.KEY_COLUMN_USAGE
		WHERE TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_SCHEMA = DATABASE()
		ORDER BY ORDINAL_POSITION
	`
	var args []any
	if database != nil {
		query = `
			SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
			FROM information_schema.KEY_COLUMN_USAGE
			WHERE TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_SCHEMA = ?
			ORDER BY ORDINAL_POSITION
		`
		args = append(args, *database)
	}
	args = append(args, tableName)

	rows, err := dbConn.QueryContext(ctx, query, args...)
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

func mysqlGetTableStructure(ctx context.Context, dbConn db.Executor, tableName string, database *string) (models.TableStructure, error) {
	var result models.TableStructure
	var err error
	result.Columns, err = mysqlGetColumns(ctx, dbConn, tableName, database)
	if err != nil {
		return result, err
	}
	result.Indexes, err = mysqlGetIndexes(ctx, dbConn, tableName, database)
	if err != nil {
		return result, err
	}
	result.ForeignKeys, err = mysqlGetForeignKeys(ctx, dbConn, tableName, database)
	if err != nil {
		return result, err
	}
	return result, nil
}

func mysqlGetRoutines(ctx context.Context, dbConn db.Executor, database *string) (models.RoutinesResult, error) {
	var result models.RoutinesResult

	dbFilter := "DATABASE()"
	var procArgs []any
	if database != nil {
		dbFilter = "?"
		procArgs = append(procArgs, *database)
	}

	// Procedures
	procQuery := fmt.Sprintf(`
		SELECT ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_DEFINITION, ROUTINE_COMMENT
		FROM information_schema.ROUTINES
		WHERE ROUTINE_SCHEMA = %s AND ROUTINE_TYPE = 'PROCEDURE'
		ORDER BY ROUTINE_NAME
	`, dbFilter)
	procRows, err := dbConn.QueryContext(ctx, procQuery, procArgs...)
	if err != nil {
		return result, nil
	}
	defer procRows.Close()
	for procRows.Next() {
		var r models.RoutineInfo
		var def, comment sql.NullString
		if err := procRows.Scan(&r.RoutineName, &r.RoutineType, &def, &comment); err == nil {
			r.Definition = nullStr(def)
			r.Comment = nullStr(comment)
			result.Procedures = append(result.Procedures, r)
		}
	}

	// Functions
	funcQuery := fmt.Sprintf(`
		SELECT ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_DEFINITION, ROUTINE_COMMENT
		FROM information_schema.ROUTINES
		WHERE ROUTINE_SCHEMA = %s AND ROUTINE_TYPE = 'FUNCTION'
		ORDER BY ROUTINE_NAME
	`, dbFilter)
	funcRows, err := dbConn.QueryContext(ctx, funcQuery, procArgs...)
	if err != nil {
		return result, nil
	}
	defer funcRows.Close()
	for funcRows.Next() {
		var r models.RoutineInfo
		var def, comment sql.NullString
		if err := funcRows.Scan(&r.RoutineName, &r.RoutineType, &def, &comment); err == nil {
			r.Definition = nullStr(def)
			r.Comment = nullStr(comment)
			result.Functions = append(result.Functions, r)
		}
	}

	return result, nil
}

func mysqlGetRoutineBody(ctx context.Context, dbConn db.Executor, database, routineName, routineType string) (string, error) {
	var def sql.NullString
	query := `SELECT ROUTINE_DEFINITION FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = ? AND ROUTINE_TYPE = ?`
	err := dbConn.QueryRowContext(ctx, query, database, routineName, routineType).Scan(&def)
	if err != nil {
		return "", err
	}
	if !def.Valid {
		return "", nil
	}
	return def.String, nil
}

func formatNullTime(t sql.NullTime) *string {
	if t.Valid {
		s := t.Time.Format("2006-01-02 15:04:05")
		return &s
	}
	return nil
}
