package api

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"idblink/backend/db"
	"idblink/backend/models"

	"github.com/lib/pq"
)

func postgresGetDatabases(ctx context.Context, dbConn db.Executor) ([]string, error) {
	query := `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("postgresGetDatabases query failed: %w", err)
	}
	defer rows.Close()

	var result []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("postgresGetDatabases scan failed: %w", err)
		}
		result = append(result, name)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgresGetDatabases rows error: %w", err)
	}
	if result == nil {
		result = []string{}
	}
	return result, nil
}

func postgresGetTables(ctx context.Context, dbConn db.Executor, database *string) ([]models.TableInfo, error) {
	_ = database
	query := `
		SELECT c.relname AS table_name,
			CASE c.relkind WHEN 'r' THEN 'BASE TABLE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'OTHER' END AS table_type,
			n.nspname AS schema_name,
			NULL::bigint AS row_count,
			COALESCE(d.description, '') AS comment,
			NULL AS engine, NULL AS data_size, NULL AS index_size,
			NULL AS create_time, NULL AS update_time, NULL AS collation
		FROM pg_catalog.pg_class c
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = 0
		WHERE c.relkind IN ('r','v','m','f')
			AND n.nspname NOT IN ('pg_catalog', 'information_schema')
			AND n.nspname NOT LIKE 'pg_toast%%'
		ORDER BY n.nspname, c.relname
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
		var tmp1, tmp2, tmp3, tmp4, tmp5, tmp6, tmp7 interface{}
		if err := rows.Scan(&t.TableName, &t.TableType, &t.Schema, &tmp1, &comment, &tmp2, &tmp3, &tmp4, &tmp5, &tmp6, &tmp7); err != nil {
			return nil, err
		}
		t.Comment = strPtr(comment)
		result = append(result, t)
	}
	return result, rows.Err()
}

func postgresGetTablesCategorized(ctx context.Context, dbConn db.Executor, database *string, search *string) (models.TablesResult, error) {
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
				n.nspname AS schema_name,
				NULL::bigint AS row_count,
				COALESCE(d.description, '') AS comment,
				NULL AS engine, NULL AS data_size, NULL AS index_size,
				NULL AS create_time, NULL AS update_time, NULL AS collation
			FROM pg_catalog.pg_class c
			JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = 0
			WHERE c.relkind IN ('r','v','m','f')
				AND n.nspname NOT IN ('pg_catalog', 'information_schema')
				AND n.nspname NOT LIKE 'pg_toast%%'
				AND c.relname LIKE $1
			ORDER BY n.nspname, c.relname
		`
		args = append(args, "%"+*search+"%")
	} else {
		query = `
			SELECT c.relname AS table_name,
				CASE c.relkind WHEN 'r' THEN 'BASE TABLE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'OTHER' END AS table_type,
				n.nspname AS schema_name,
				NULL::bigint AS row_count,
				COALESCE(d.description, '') AS comment,
				NULL AS engine, NULL AS data_size, NULL AS index_size,
				NULL AS create_time, NULL AS update_time, NULL AS collation
			FROM pg_catalog.pg_class c
			JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = 0
			WHERE c.relkind IN ('r','v','m','f')
				AND n.nspname NOT IN ('pg_catalog', 'information_schema')
				AND n.nspname NOT LIKE 'pg_toast%%'
			ORDER BY n.nspname, c.relname
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
		var tmp1, tmp2, tmp3, tmp4, tmp5, tmp6, tmp7 interface{}
		if err := rows.Scan(&t.TableName, &t.TableType, &t.Schema, &tmp1, &comment, &tmp2, &tmp3, &tmp4, &tmp5, &tmp6, &tmp7); err != nil {
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

func postgresGetAllColumns(ctx context.Context, dbConn db.Executor, database *string) (models.AllColumnsResult, error) {
	// 分批策略:避免单查询扫描整库 catalog 触发 PG 锁槽位耗尽(max_locks_per_transaction 默认 64)。
	// Step 1 先拿所有用户表的 OID(轻量查询,几乎不占锁);Step 2 按每批 50 张表用 OID 数组查列,
	// 每批是独立 auto-commit 查询,锁立即释放,不会跨批累积。
	tableRows, err := dbConn.QueryContext(ctx, `
		SELECT c.oid, n.nspname, c.relname
		FROM pg_catalog.pg_class c
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE c.relkind IN ('r', 'v', 'm')
			AND n.nspname NOT IN ('pg_catalog', 'information_schema')
			AND n.nspname NOT LIKE 'pg_toast%%'
			AND n.nspname NOT LIKE 'pg_temp%%'
		ORDER BY n.nspname, c.relname
	`)
	if err != nil {
		return models.AllColumnsResult{}, err
	}

	type tableInfo struct {
		OID    int64
		Schema string
		Name   string
	}
	var tables []tableInfo
	for tableRows.Next() {
		var ti tableInfo
		if err := tableRows.Scan(&ti.OID, &ti.Schema, &ti.Name); err != nil {
			tableRows.Close()
			return models.AllColumnsResult{}, err
		}
		tables = append(tables, ti)
	}
	tableRows.Close()
	if err := tableRows.Err(); err != nil {
		return models.AllColumnsResult{}, err
	}

	result := models.AllColumnsResult{Tables: make(map[string][]models.ColumnInfo)}
	if len(tables) == 0 {
		return result, nil
	}

	// OID -> tableInfo,用于把列扫描结果映射回 schema.table key
	oidIndex := make(map[int64]tableInfo, len(tables))
	for _, ti := range tables {
		oidIndex[ti.OID] = ti
	}

	// Step 2: 按表分批查列。每批 50 张表(50 张表 ~ 100 个 relation lock,远低于默认 max_locks_per_transaction=64 × 多个并发槽位)。
	const batchSize = 50
	for i := 0; i < len(tables); i += batchSize {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		end := i + batchSize
		if end > len(tables) {
			end = len(tables)
		}
		oids := make([]int64, 0, end-i)
		for j := i; j < end; j++ {
			oids = append(oids, tables[j].OID)
		}

		rows, err := dbConn.QueryContext(ctx, `
			SELECT a.attrelid,
			       a.attname,
			       pg_catalog.format_type(a.atttypid, a.atttypmod),
			       CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
			       pg_catalog.pg_get_expr(d.adbin, d.adrelid)
			FROM pg_catalog.pg_attribute a
			LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
			WHERE a.attnum > 0 AND NOT a.attisdropped
				AND a.attrelid = ANY($1)
			ORDER BY a.attrelid, a.attnum
		`, pq.Array(oids))
		if err != nil {
			return result, err
		}

		for rows.Next() {
			var oid int64
			var c models.ColumnInfo
			var def sql.NullString
			if err := rows.Scan(&oid, &c.ColumnName, &c.DataType, &c.IsNullable, &def); err != nil {
				rows.Close()
				return result, err
			}
			c.ColumnDefault = nullStrEmpty(def)
			ti := oidIndex[oid]
			key := ti.Schema + "." + ti.Name
			result.Tables[key] = append(result.Tables[key], c)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return result, err
		}
	}

	return result, nil
}

func postgresGetColumns(ctx context.Context, dbConn db.Executor, tableName string, database *string, schema *string) ([]models.ColumnInfo, error) {
	sch := ""
	if schema != nil {
		sch = *schema
	}
	query := `
		SELECT a.attname AS column_name,
			pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
			CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
			CASE
				WHEN EXISTS (
					SELECT 1 FROM pg_catalog.pg_index i
					WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY(i.indkey)
				) THEN 'PRI'
				WHEN EXISTS (
					SELECT 1 FROM pg_catalog.pg_index i
					WHERE i.indrelid = a.attrelid AND i.indisunique AND a.attnum = ANY(i.indkey)
				) THEN 'UNI'
				ELSE ''
			END AS column_key,
			pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default,
			'' AS extra,
			COALESCE(col_description(c.oid, a.attnum), '') AS comment
		FROM pg_catalog.pg_attribute a
		JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
		WHERE a.attnum > 0 AND NOT a.attisdropped
			AND c.relname = $1
			AND n.nspname NOT IN ('pg_catalog', 'information_schema')
			AND n.nspname NOT LIKE 'pg_toast%%'
			AND ($2 = '' OR n.nspname = $2)
	`
	query += " ORDER BY a.attnum"

	rows, err := dbConn.QueryContext(ctx, query, tableName, sch)
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

func postgresGetIndexes(ctx context.Context, dbConn db.Executor, tableName string, database *string, schema *string) ([]models.IndexInfo, error) {
	sch := ""
	if schema != nil {
		sch = *schema
	}
	query := `
		SELECT i.relname AS index_name, a.attname AS column_name,
			ix.indisunique AS is_unique, ix.indisprimary AS is_primary,
			-- 列在索引里的位置（从 1 开始）。不能按列在表里的顺序排：复合索引 (price, id) 会变成 (id, price)
			array_position(ix.indkey::int2[], a.attnum) + 1 AS seq_in_index
		FROM pg_index ix
		JOIN pg_class t ON t.oid = ix.indrelid
		JOIN pg_class i ON i.oid = ix.indexrelid
		JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
		JOIN pg_namespace n ON n.oid = t.relnamespace
		WHERE t.relname = $1
			AND n.nspname NOT IN ('pg_catalog', 'information_schema')
			AND ($2 = '' OR n.nspname = $2)
	`
	query += " ORDER BY i.relname, seq_in_index"

	rows, err := dbConn.QueryContext(ctx, query, tableName, sch)
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

func postgresGetForeignKeys(ctx context.Context, dbConn db.Executor, tableName string, database *string, schema *string) ([]models.ForeignKeyInfo, error) {
	sch := ""
	if schema != nil {
		sch = *schema
	}
	// 从 pg_constraint 取并按位置配对两边的列。不能走 information_schema：
	// key_column_usage 和 constraint_column_usage 各是「每列一行」，按约束名连接后
	// 复合外键会出笛卡尔积（两列的外键返回四行）
	query := `
		SELECT con.conname AS constraint_name, src.attname AS column_name,
			tgt.relname AS referenced_table, dst.attname AS referenced_column
		FROM pg_constraint con
		JOIN pg_class rel ON rel.oid = con.conrelid
		JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
		JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ord(attnum, position) ON TRUE
		JOIN pg_attribute src ON src.attrelid = rel.oid AND src.attnum = ord.attnum
		JOIN pg_class tgt ON tgt.oid = con.confrelid
		JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS ref(attnum, position) ON ref.position = ord.position
		JOIN pg_attribute dst ON dst.attrelid = tgt.oid AND dst.attnum = ref.attnum
		WHERE con.contype = 'f'
			AND rel.relname = $1
			AND ($2 = '' OR nsp.nspname = $2)
		ORDER BY con.conname, ord.position
	`

	rows, err := dbConn.QueryContext(ctx, query, tableName, sch)
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

func postgresGetTableStructure(ctx context.Context, dbConn db.Executor, tableName string, database *string, schema *string) (models.TableStructure, error) {
	var result models.TableStructure
	var err error
	result.Columns, err = postgresGetColumns(ctx, dbConn, tableName, database, schema)
	if err != nil {
		return result, err
	}
	result.Indexes, err = postgresGetIndexes(ctx, dbConn, tableName, database, schema)
	if err != nil {
		return result, err
	}
	result.ForeignKeys, err = postgresGetForeignKeys(ctx, dbConn, tableName, database, schema)
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

func postgresGetRoutines(ctx context.Context, dbConn db.Executor, database *string) (models.RoutinesResult, error) {
	var result models.RoutinesResult
	query := `
		SELECT routine_name, routine_type, routine_definition
		FROM information_schema.routines
		WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
	`
	query += " ORDER BY routine_name"

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
	// 重载、不同 schema 里的同名例程在这里各是一行
	result.Procedures = uniqueRoutines(result.Procedures)
	result.Functions = uniqueRoutines(result.Functions)
	return result, rows.Err()
}

// postgresGetRoutineBody 取过程 / 函数的完整定义：pg_get_functiondef 给出可直接执行的
// CREATE OR REPLACE 语句（information_schema.routines.routine_definition 只是函数体，对过程
// 还是 NULL）。名字可以带 schema（schema.name）；不带时优先当前 schema，再按名字在其余
// schema 里找——此前把库名当 schema 传进来，PG 上一律查不到
func postgresGetRoutineBody(ctx context.Context, dbConn db.Executor, routineName, routineType string) (string, error) {
	schema, name := "", routineName
	if qualifier, bare := splitQualifiedTableName(routineName); qualifier != "" {
		schema, name = qualifier, bare
	}

	// 聚合函数不能 pg_get_functiondef；过程没有返回值类型（pg_get_function_result 为 NULL）。
	// 不查 prokind / proisagg：前者 PG 11 以前没有，后者 PG 11 起删掉了
	var def sql.NullString
	err := dbConn.QueryRowContext(ctx, `
		SELECT pg_catalog.pg_get_functiondef(p.oid)
		FROM pg_catalog.pg_proc p
		JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
		WHERE p.proname = $1
			AND ($2 = '' OR n.nspname = $2)
			AND n.nspname NOT IN ('pg_catalog', 'information_schema')
			AND n.nspname NOT LIKE 'pg_toast%'
			AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_aggregate a WHERE a.aggfnoid = p.oid)
			AND (($3 = 'PROCEDURE') = (pg_catalog.pg_get_function_result(p.oid) IS NULL))
		ORDER BY (n.nspname = current_schema()) DESC, n.nspname
		LIMIT 1`, name, schema, routineType).Scan(&def)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return def.String, nil
}

func postgresGetSequences(ctx context.Context, dbConn db.Executor, database *string) ([]models.SequenceInfo, error) {
	// 序列在哪个 schema 里都要列出来（此前只看 public）；名字带上 schema，重置时才找得到
	query := `SELECT sequence_schema || '.' || sequence_name, data_type, start_value, minimum_value, maximum_value, increment, cycle_option
		FROM information_schema.sequences
		WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
			AND sequence_schema NOT LIKE 'pg_toast%'
		ORDER BY sequence_schema, sequence_name`
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("postgresGetSequences query failed: %w", err)
	}
	defer rows.Close()

	var result []models.SequenceInfo
	for rows.Next() {
		var s models.SequenceInfo
		if err := rows.Scan(&s.SequenceName, &s.DataType, &s.StartValue, &s.MinValue, &s.MaxValue, &s.Increment, &s.CycleOption); err != nil {
			return nil, fmt.Errorf("postgresGetSequences scan failed: %w", err)
		}
		result = append(result, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgresGetSequences rows error: %w", err)
	}
	if result == nil {
		result = []models.SequenceInfo{}
	}
	return result, nil
}

func postgresResetSequence(ctx context.Context, dbConn db.Executor, sequenceName string, value int64) error {
	// 名字按标识符转义（列表给的是 schema.序列）：只替换单引号挡不住带引号的名字
	query := fmt.Sprintf("ALTER SEQUENCE %s RESTART WITH %d", buildTableRef(sequenceName, "", "postgresql"), value)
	_, err := dbConn.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("postgresResetSequence failed: %w", err)
	}
	return nil
}

func postgresGetSchemas(ctx context.Context, dbConn db.Executor, database *string) ([]string, error) {
	query := `SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("postgresGetSchemas query failed: %w", err)
	}
	defer rows.Close()

	var result []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("postgresGetSchemas scan failed: %w", err)
		}
		result = append(result, name)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgresGetSchemas rows error: %w", err)
	}
	if result == nil {
		result = []string{}
	}
	return result, nil
}

func postgresCreateSchema(ctx context.Context, dbConn db.Executor, schemaName string) error {
	sanitized := strings.ReplaceAll(schemaName, "'", "''")
	query := fmt.Sprintf("CREATE SCHEMA %s", sanitized)
	_, err := dbConn.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("postgresCreateSchema failed: %w", err)
	}
	return nil
}

func postgresDropSchema(ctx context.Context, dbConn db.Executor, schemaName string) error {
	sanitized := strings.ReplaceAll(schemaName, "'", "''")
	query := fmt.Sprintf("DROP SCHEMA %s CASCADE", sanitized)
	_, err := dbConn.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("postgresDropSchema failed: %w", err)
	}
	return nil
}

func postgresGetCheckConstraints(ctx context.Context, dbConn db.Executor, tableName string, database *string, schema *string) ([]models.CheckConstraintInfo, error) {
	target := tableName
	if schema != nil && *schema != "" {
		target = *schema + "." + tableName
	}
	query := `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype = 'c' AND conrelid = $1::regclass`
	rows, err := dbConn.QueryContext(ctx, query, target)
	if err != nil {
		return nil, fmt.Errorf("postgresGetCheckConstraints query failed: %w", err)
	}
	defer rows.Close()

	var result []models.CheckConstraintInfo
	for rows.Next() {
		var c models.CheckConstraintInfo
		if err := rows.Scan(&c.ConstraintName, &c.CheckClause); err != nil {
			return nil, fmt.Errorf("postgresGetCheckConstraints scan failed: %w", err)
		}
		result = append(result, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgresGetCheckConstraints rows error: %w", err)
	}
	if result == nil {
		result = []models.CheckConstraintInfo{}
	}
	return result, nil
}
