package api

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"idblink-backend/db"
	"idblink-backend/models"
)

func sqliteGetTables(ctx context.Context, dbConn db.Executor, _database *string) ([]models.TableInfo, error) {
	query := `
		SELECT name AS table_name, 'BASE TABLE' AS table_type,
			NULL AS row_count, NULL AS comment, NULL AS engine,
			NULL AS data_size, NULL AS index_size,
			NULL AS create_time, NULL AS update_time, NULL AS collation
		FROM sqlite_master
		WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
		ORDER BY name
	`
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.TableInfo
	for rows.Next() {
		var t models.TableInfo
		var tmp1, tmp2, tmp3, tmp4, tmp5, tmp6, tmp7, tmp8 interface{}
		if err := rows.Scan(&t.TableName, &t.TableType, &tmp1, &tmp2, &tmp3, &tmp4, &tmp5, &tmp6, &tmp7, &tmp8); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func sqliteGetTablesCategorized(ctx context.Context, dbConn db.Executor, _database *string, search *string) (models.TablesResult, error) {
	result := models.TablesResult{
		Tables: []models.TableInfo{},
		Views:  []models.TableInfo{},
	}
	var query string
	var args []interface{}

	if search != nil && *search != "" {
		query = `
			SELECT name AS table_name, 'BASE TABLE' AS table_type,
				NULL AS row_count, NULL AS comment, NULL AS engine,
				NULL AS data_size, NULL AS index_size,
				NULL AS create_time, NULL AS update_time, NULL AS collation
			FROM sqlite_master
			WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name LIKE ?
			ORDER BY name
		`
		args = append(args, "%"+*search+"%")
	} else {
		query = `
			SELECT name AS table_name, 'BASE TABLE' AS table_type,
				NULL AS row_count, NULL AS comment, NULL AS engine,
				NULL AS data_size, NULL AS index_size,
				NULL AS create_time, NULL AS update_time, NULL AS collation
			FROM sqlite_master
			WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
			ORDER BY name
		`
	}

	rows, err := dbConn.QueryContext(ctx, query, args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var t models.TableInfo
		var tmp1, tmp2, tmp3, tmp4, tmp5, tmp6, tmp7, tmp8 interface{}
		if err := rows.Scan(&t.TableName, &t.TableType, &tmp1, &tmp2, &tmp3, &tmp4, &tmp5, &tmp6, &tmp7, &tmp8); err != nil {
			continue
		}
		result.Tables = append(result.Tables, t)
	}
	return result, rows.Err()
}

func sqliteGetColumns(ctx context.Context, dbConn db.Executor, tableName string, _database *string) ([]models.ColumnInfo, error) {
	safeTable := strings.ReplaceAll(tableName, `"`, `""`)
	query := fmt.Sprintf(`PRAGMA table_info("%s")`, safeTable)
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ColumnInfo
	for rows.Next() {
		var cid int
		var name, typeStr string
		var notnull int
		var def sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &typeStr, &notnull, &def, &pk); err != nil {
			return nil, err
		}
		c := models.ColumnInfo{
			ColumnName:    name,
			DataType:      typeStr,
			IsNullable:    map[bool]string{true: "NO", false: "YES"}[notnull == 1],
			ColumnDefault: nullStrEmpty(def),
		}
		if pk == 1 {
			c.ColumnKey = strPtr("PRI")
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

func sqliteGetIndexes(ctx context.Context, dbConn db.Executor, tableName string, _database *string) ([]models.IndexInfo, error) {
	safeTable := strings.ReplaceAll(tableName, `"`, `""`)
	listQuery := fmt.Sprintf(`PRAGMA index_list("%s")`, safeTable)
	listRows, err := dbConn.QueryContext(ctx, listQuery)
	if err != nil {
		return nil, err
	}
	defer listRows.Close()

	type indexEntry struct {
		name     string
		isUnique bool
	}
	var entries []indexEntry
	for listRows.Next() {
		var name, origin, partial string
		var isUnique bool
		var tmp interface{}
		if err := listRows.Scan(&name, &isUnique, &origin, &partial, &tmp); err != nil {
			continue
		}
		entries = append(entries, indexEntry{name: name, isUnique: isUnique})
	}

	var result []models.IndexInfo
	for _, entry := range entries {
		safeIdx := strings.ReplaceAll(entry.name, `"`, `""`)
		infoQuery := fmt.Sprintf(`PRAGMA index_info("%s")`, safeIdx)
		infoRows, err := dbConn.QueryContext(ctx, infoQuery)
		if err != nil {
			continue
		}
		for infoRows.Next() {
			var seq, cid int64
			var colName string
			if err := infoRows.Scan(&seq, &cid, &colName); err != nil {
				continue
			}
			result = append(result, models.IndexInfo{
				IndexName:  entry.name,
				ColumnName: colName,
				IsUnique:   entry.isUnique,
				IsPrimary:  strings.HasPrefix(entry.name, "sqlite_autoindex"),
				SeqInIndex: seq + 1,
			})
		}
		infoRows.Close()
	}
	return result, nil
}

func sqliteGetForeignKeys(ctx context.Context, dbConn db.Executor, tableName string, _database *string) ([]models.ForeignKeyInfo, error) {
	safeTable := strings.ReplaceAll(tableName, `"`, `""`)
	query := fmt.Sprintf(`PRAGMA foreign_key_list("%s")`, safeTable)
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ForeignKeyInfo
	for rows.Next() {
		var id, seq int64
		var refTable, from, to, onUpdate, onDelete, match string
		var tmp interface{}
		if err := rows.Scan(&id, &seq, &refTable, &from, &to, &onUpdate, &onDelete, &match, &tmp); err != nil {
			continue
		}
		result = append(result, models.ForeignKeyInfo{
			ConstraintName:   fmt.Sprintf("fk_%s_%d", tableName, seq),
			ColumnName:       from,
			ReferencedTable:  refTable,
			ReferencedColumn: to,
		})
	}
	return result, rows.Err()
}

func sqliteGetTableStructure(ctx context.Context, dbConn db.Executor, tableName string, _database *string) (models.TableStructure, error) {
	var result models.TableStructure
	var err error
	result.Columns, err = sqliteGetColumns(ctx, dbConn, tableName, _database)
	if err != nil {
		return result, err
	}
	result.Indexes, err = sqliteGetIndexes(ctx, dbConn, tableName, _database)
	if err != nil {
		return result, err
	}
	result.ForeignKeys, err = sqliteGetForeignKeys(ctx, dbConn, tableName, _database)
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
