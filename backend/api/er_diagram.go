package api

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"idblink/backend/db"
	"idblink/backend/models"
)

// ==================== ER 图 ====================
//
// 画 ER 图需要三样东西：表、列（带主键标记）、外键。此前只有「逐表查外键」的接口，
// 几百张表就是几百次往返。这里给 MySQL / PG 系 / SQLite 各写批量查询，
// 其余库（Oracle、达梦、SQL Server、ClickHouse、TDengine）退回通用路径。

// erQueryTimeout 单次取图的时间上限（通用路径逐表查，留足余量）
const erQueryTimeout = 60 * time.Second

// erGenericWorkers 通用路径里逐表取外键的并发数
const erGenericWorkers = 4

// GetERDiagram 取齐画 ER 图所需的数据。
func (h *Handler) GetERDiagram(ctx context.Context, connectionID string, database *string) (models.ERDiagram, error) {
	exec, dbType, err := h.getConnAndType(connectionID)
	if err != nil {
		return models.ERDiagram{}, err
	}
	exec, err = h.resolvePGExec(exec, connectionID, dbType, database)
	if err != nil {
		return models.ERDiagram{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, erQueryTimeout)
	defer cancel()

	switch dbType {
	case "mysql", "mariadb":
		return mysqlERDiagram(ctx, exec, database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return postgresERDiagram(ctx, exec)
	case "sqlite":
		return sqliteERDiagram(ctx, exec)
	default:
		return genericERDiagram(ctx, exec, dbType, database)
	}
}

// erBuilder 按出现顺序累积表 / 列 / 外键；最后统一排序并丢弃指向库外（或不存在）的表的关系
type erBuilder struct {
	diagram models.ERDiagram
	index   map[string]int
}

func newERBuilder() *erBuilder {
	return &erBuilder{
		diagram: models.ERDiagram{Tables: []models.ERTable{}, Edges: []models.EREdge{}},
		index:   map[string]int{},
	}
}

// table 取或建表节点（已存在时返回原节点）。
func (b *erBuilder) table(id, name, schema, comment string) *models.ERTable {
	if i, ok := b.index[id]; ok {
		return &b.diagram.Tables[i]
	}
	b.index[id] = len(b.diagram.Tables)
	b.diagram.Tables = append(b.diagram.Tables, models.ERTable{
		ID: id, Name: name, Schema: schema, Comment: comment, Columns: []models.ERColumn{},
	})
	return &b.diagram.Tables[len(b.diagram.Tables)-1]
}

func (b *erBuilder) edge(name, fromTable, fromColumn, toTable, toColumn string, seq int) {
	b.diagram.Edges = append(b.diagram.Edges, models.EREdge{
		Name: name, FromTable: fromTable, FromColumn: fromColumn,
		ToTable: toTable, ToColumn: toColumn, Seq: seq,
	})
}

// finish 表按 id 排序；两端不都在图里的关系丢弃（跨库外键、指向视图等）
func (b *erBuilder) finish() models.ERDiagram {
	known := map[string]bool{}
	for _, t := range b.diagram.Tables {
		known[t.ID] = true
	}
	kept := []models.EREdge{}
	for _, e := range b.diagram.Edges {
		if known[e.FromTable] && known[e.ToTable] {
			kept = append(kept, e)
		}
	}
	b.diagram.Edges = kept
	sort.SliceStable(b.diagram.Tables, func(i, j int) bool {
		return b.diagram.Tables[i].ID < b.diagram.Tables[j].ID
	})
	return b.diagram
}

// scanEREdges 把「约束名, 子表, 子列, 父表, 父列, 序号」形状的结果读成关系
func scanEREdges(rows *sql.Rows, b *erBuilder) error {
	defer rows.Close()
	for rows.Next() {
		var name, fromTable, fromColumn, toTable, toColumn string
		var seq int
		if err := rows.Scan(&name, &fromTable, &fromColumn, &toTable, &toColumn, &seq); err != nil {
			return fmt.Errorf("failed to scan foreign key: %w", err)
		}
		b.edge(name, fromTable, fromColumn, toTable, toColumn, seq)
	}
	return rows.Err()
}

// ── MySQL ──

// mysqlERDiagram 两条 SQL：列（含主键标记与注释）+ 外键。
// database 为空时取连接默认库。
func mysqlERDiagram(ctx context.Context, exec db.Executor, database *string) (models.ERDiagram, error) {
	// 库名为空时取连接默认库：谓词在 Go 侧选定，不让绑定参数去和
	// information_schema 的列比字符集 / 排序规则
	schemaCond := "DATABASE()"
	var args []any
	if database != nil && *database != "" {
		schemaCond = "?"
		args = []any{*database}
	}
	b := newERBuilder()

	rows, err := exec.QueryContext(ctx, `
		SELECT c.TABLE_NAME, c.COLUMN_NAME, c.COLUMN_TYPE, c.IS_NULLABLE, c.COLUMN_KEY,
			COALESCE(c.COLUMN_COMMENT, ''), COALESCE(t.TABLE_COMMENT, '')
		FROM information_schema.COLUMNS c
		JOIN information_schema.TABLES t
			ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
		WHERE t.TABLE_TYPE = 'BASE TABLE' AND c.TABLE_SCHEMA = `+schemaCond+`
		ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
	`, args...)
	if err != nil {
		return models.ERDiagram{}, fmt.Errorf("failed to query columns: %w", err)
	}
	for rows.Next() {
		var tableName, tableComment, nullable, key string
		var c models.ERColumn
		if err := rows.Scan(&tableName, &c.Name, &c.DataType, &nullable, &key, &c.Comment, &tableComment); err != nil {
			rows.Close()
			return models.ERDiagram{}, fmt.Errorf("failed to scan column: %w", err)
		}
		c.Nullable = nullable == "YES"
		c.IsPK = key == "PRI"
		table := b.table(tableName, tableName, "", tableComment)
		table.Columns = append(table.Columns, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return models.ERDiagram{}, err
	}

	rows, err = exec.QueryContext(ctx, `
		SELECT kcu.CONSTRAINT_NAME, kcu.TABLE_NAME, kcu.COLUMN_NAME,
			kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME, kcu.ORDINAL_POSITION
		FROM information_schema.KEY_COLUMN_USAGE kcu
		JOIN information_schema.TABLES t
			ON t.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND t.TABLE_NAME = kcu.TABLE_NAME
		WHERE t.TABLE_TYPE = 'BASE TABLE' AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
			AND kcu.TABLE_SCHEMA = `+schemaCond+`
		ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
	`, args...)
	if err != nil {
		return models.ERDiagram{}, fmt.Errorf("failed to query foreign keys: %w", err)
	}
	if err := scanEREdges(rows, b); err != nil {
		return models.ERDiagram{}, err
	}
	return b.finish(), nil
}

// ── PostgreSQL 系 ──

// postgresERDiagram 两条 SQL：列（主键标记 + 注释）+ 外键。
// 外键从 pg_constraint 展开复合键并按位置配对——information_schema 的写法在复合键上会出笛卡尔积。
func postgresERDiagram(ctx context.Context, exec db.Executor) (models.ERDiagram, error) {
	b := newERBuilder()

	rows, err := exec.QueryContext(ctx, `
		SELECT n.nspname, c.relname, a.attname,
			pg_catalog.format_type(a.atttypid, a.atttypmod),
			NOT (a.attnotnull OR (t.typtype = 'd' AND t.typnotnull)) AS is_nullable,
			COALESCE(pk.indisprimary, false) AS is_pk,
			COALESCE(pg_catalog.col_description(c.oid, a.attnum), ''),
			COALESCE(pg_catalog.obj_description(c.oid, 'pg_class'), '')
		FROM pg_catalog.pg_attribute a
		JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
		LEFT JOIN LATERAL (
			SELECT ix.indisprimary
			FROM pg_catalog.pg_index ix
			WHERE ix.indrelid = a.attrelid AND ix.indisprimary AND a.attnum = ANY (ix.indkey)
			LIMIT 1
		) pk ON TRUE
		WHERE a.attnum > 0 AND NOT a.attisdropped
			AND c.relkind IN ('r', 'p')
			AND n.nspname NOT IN ('pg_catalog', 'information_schema')
			AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg\_temp\_%'
		ORDER BY n.nspname, c.relname, a.attnum
	`)
	if err != nil {
		return models.ERDiagram{}, fmt.Errorf("failed to query columns: %w", err)
	}
	for rows.Next() {
		var schema, tableName, tableComment string
		var c models.ERColumn
		if err := rows.Scan(&schema, &tableName, &c.Name, &c.DataType, &c.Nullable, &c.IsPK, &c.Comment, &tableComment); err != nil {
			rows.Close()
			return models.ERDiagram{}, fmt.Errorf("failed to scan column: %w", err)
		}
		table := b.table(schema+"."+tableName, tableName, schema, tableComment)
		table.Columns = append(table.Columns, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return models.ERDiagram{}, err
	}

	rows, err = exec.QueryContext(ctx, `
		SELECT con.conname,
			src_n.nspname::text || '.' || src_t.relname::text, src_a.attname,
			tgt_n.nspname::text || '.' || tgt_t.relname::text, tgt_a.attname,
			k.ord::int
		FROM pg_catalog.pg_constraint con
		JOIN pg_catalog.pg_class src_t ON src_t.oid = con.conrelid
		JOIN pg_catalog.pg_namespace src_n ON src_n.oid = src_t.relnamespace
		JOIN pg_catalog.pg_class tgt_t ON tgt_t.oid = con.confrelid
		JOIN pg_catalog.pg_namespace tgt_n ON tgt_n.oid = tgt_t.relnamespace
		CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(src_attnum, tgt_attnum, ord)
		JOIN pg_catalog.pg_attribute src_a ON src_a.attrelid = con.conrelid AND src_a.attnum = k.src_attnum
		JOIN pg_catalog.pg_attribute tgt_a ON tgt_a.attrelid = con.confrelid AND tgt_a.attnum = k.tgt_attnum
		WHERE con.contype = 'f' AND con.confrelid <> 0
		ORDER BY con.conname, k.ord
	`)
	if err != nil {
		return models.ERDiagram{}, fmt.Errorf("failed to query foreign keys: %w", err)
	}
	if err := scanEREdges(rows, b); err != nil {
		return models.ERDiagram{}, err
	}
	return b.finish(), nil
}

// ── SQLite ──

// sqliteERDiagram 没有全库外键视图，只能逐表 PRAGMA；本地文件调用很快。
// 先建好全部表和列，再处理外键：「REFERENCES parent」没写目标列时要回查父表主键。
func sqliteERDiagram(ctx context.Context, exec db.Executor) (models.ERDiagram, error) {
	b := newERBuilder()

	rows, err := exec.QueryContext(ctx, `
		SELECT name FROM sqlite_master
		WHERE type = 'table' AND name NOT LIKE 'sqlite\_%' ESCAPE '\'
		ORDER BY name
	`)
	if err != nil {
		return models.ERDiagram{}, fmt.Errorf("failed to list tables: %w", err)
	}
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return models.ERDiagram{}, fmt.Errorf("failed to scan table name: %w", err)
		}
		names = append(names, name)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return models.ERDiagram{}, err
	}

	for _, name := range names {
		cols, err := sqliteERColumns(ctx, exec, name)
		if err != nil {
			return models.ERDiagram{}, err
		}
		b.table(name, name, "", "").Columns = cols
	}
	// SQLite 的表名不区分大小写，foreign_key_list 里的父表名是 REFERENCES 里写的原样：
	// 先按原样找，找不到再按大小写折叠找
	byLower := make(map[string]string, len(names))
	for _, name := range names {
		byLower[strings.ToLower(name)] = name
	}
	for _, name := range names {
		fks, err := sqliteERForeignKeys(ctx, exec, name)
		if err != nil {
			return models.ERDiagram{}, err
		}
		for _, fk := range fks {
			toTable, ok := byLower[strings.ToLower(fk.toTable)]
			if !ok {
				continue
			}
			toColumn := fk.toColumn
			if toColumn == "" {
				// 目标列省略：外键指向父表的主键，子表的第 n 列对应主键的第 n 列
				pk, err := sqlitePrimaryKeyColumns(ctx, exec, toTable)
				if err != nil {
					return models.ERDiagram{}, err
				}
				if fk.seq >= len(pk) {
					continue
				}
				toColumn = pk[fk.seq]
			}
			b.edge(fk.name, name, fk.fromColumn, toTable, toColumn, fk.seq+1)
		}
	}
	return b.finish(), nil
}

// sqlitePrimaryKeyColumns 主键列，按主键里的列序（PRAGMA table_info 的 pk 是这一列在主键里的序号）
func sqlitePrimaryKeyColumns(ctx context.Context, exec db.Executor, table string) ([]string, error) {
	rows, err := exec.QueryContext(ctx, fmt.Sprintf(`PRAGMA table_info(%s)`, sqliteQuoteName(table)))
	if err != nil {
		return nil, fmt.Errorf("failed to read primary key of %s: %w", table, err)
	}
	defer rows.Close()
	type pkColumn struct {
		name string
		pos  int
	}
	cols := []pkColumn{}
	for rows.Next() {
		var cid, notnull, pk int
		var name, dataType string
		var def sql.NullString
		if err := rows.Scan(&cid, &name, &dataType, &notnull, &def, &pk); err != nil {
			return nil, fmt.Errorf("failed to scan column of %s: %w", table, err)
		}
		if pk > 0 {
			cols = append(cols, pkColumn{name: name, pos: pk})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(cols, func(i, j int) bool { return cols[i].pos < cols[j].pos })
	out := make([]string, len(cols))
	for i, c := range cols {
		out[i] = c.name
	}
	return out, nil
}

type sqliteFK struct {
	name, fromColumn, toTable, toColumn string
	seq                                 int
}

func sqliteERColumns(ctx context.Context, exec db.Executor, table string) ([]models.ERColumn, error) {
	rows, err := exec.QueryContext(ctx, fmt.Sprintf(`PRAGMA table_info(%s)`, sqliteQuoteName(table)))
	if err != nil {
		return nil, fmt.Errorf("failed to read columns of %s: %w", table, err)
	}
	defer rows.Close()
	cols := []models.ERColumn{}
	for rows.Next() {
		var cid, notnull, pk int
		var col models.ERColumn
		var def sql.NullString
		if err := rows.Scan(&cid, &col.Name, &col.DataType, &notnull, &def, &pk); err != nil {
			return nil, fmt.Errorf("failed to scan column of %s: %w", table, err)
		}
		col.Nullable = notnull == 0
		col.IsPK = pk > 0 // 复合主键里每一列的 pk 都大于 0
		cols = append(cols, col)
	}
	return cols, rows.Err()
}

func sqliteERForeignKeys(ctx context.Context, exec db.Executor, table string) ([]sqliteFK, error) {
	rows, err := exec.QueryContext(ctx, fmt.Sprintf(`PRAGMA foreign_key_list(%s)`, sqliteQuoteName(table)))
	if err != nil {
		return nil, fmt.Errorf("failed to read foreign keys of %s: %w", table, err)
	}
	defer rows.Close()
	var fks []sqliteFK
	for rows.Next() {
		// 列顺序：id, seq, table, from, to, on_update, on_delete, match
		var id int
		var fk sqliteFK
		var to sql.NullString
		var onUpdate, onDelete, match string
		if err := rows.Scan(&id, &fk.seq, &fk.toTable, &fk.fromColumn, &to, &onUpdate, &onDelete, &match); err != nil {
			return nil, fmt.Errorf("failed to scan foreign key of %s: %w", table, err)
		}
		fk.name = fmt.Sprintf("fk_%s_%d", table, id)
		fk.toColumn = to.String
		fks = append(fks, fk)
	}
	return fks, rows.Err()
}

// sqliteQuoteName 标识符加双引号（内部的双引号翻倍）
func sqliteQuoteName(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// ── 通用路径 ──

// genericERDiagram 复用各库现成的批量取列逻辑，再逐表查外键（限并发）。
// 列的主键标记取 column_key = 'PRI'（达梦的批量取列不回填该字段，图上主键会缺失）。
func genericERDiagram(ctx context.Context, exec db.Executor, dbType string, database *string) (models.ERDiagram, error) {
	all, err := allColumnsFor(ctx, exec, dbType, database)
	if err != nil {
		return models.ERDiagram{}, err
	}
	b := newERBuilder()
	// map 迭代顺序随机：先按 id 排序，结果才稳定
	ids := make([]string, 0, len(all.Tables))
	for id := range all.Tables {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		cols := []models.ERColumn{}
		seen := map[string]bool{}
		for _, c := range all.Tables[id] {
			// SQL Server 的批量取列按「列所属的索引数」重复返回同一列，只留第一次
			if seen[strings.ToLower(c.ColumnName)] {
				continue
			}
			seen[strings.ToLower(c.ColumnName)] = true
			cols = append(cols, models.ERColumn{
				Name:     c.ColumnName,
				DataType: c.DataType,
				Nullable: strings.EqualFold(c.IsNullable, "YES"),
				IsPK:     c.ColumnKey != nil && *c.ColumnKey == "PRI",
				Comment:  strValOr(c.Comment, ""),
			})
		}
		name, schema := splitERTableID(id)
		b.table(id, name, schema, "").Columns = cols
	}

	// ClickHouse / TDengine 没有外键，取完列即可
	if dbType == "clickhouse" || dbType == "tdengine" {
		return b.finish(), nil
	}

	results := make([][]models.ForeignKeyInfo, len(ids))
	errs := make([]error, len(ids))
	var wg sync.WaitGroup
	sem := make(chan struct{}, erGenericWorkers)
	for i, id := range ids {
		wg.Add(1)
		go func(i int, id string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			name, _ := splitERTableID(id)
			results[i], errs[i] = foreignKeysFor(ctx, exec, dbType, name, database)
		}(i, id)
	}
	wg.Wait()

	var warnings []string
	failed := 0
	for i, id := range ids {
		if errs[i] != nil {
			failed++
			// 超时时后面的表会一条接一条地超时，只留前三条明细，末尾再给一条汇总
			if len(warnings) < 3 {
				warnings = append(warnings, fmt.Sprintf("%s: %v", id, truncateError(errs[i])))
			}
			continue
		}
		for seq, fk := range results[i] {
			// 通用路径拿到的是裸表名：目标表按裸名回指（带 schema 的 id 不会被 match，关系会被丢弃）
			b.edge(fk.ConstraintName, id, fk.ColumnName, fk.ReferencedTable, fk.ReferencedColumn, seq+1)
		}
	}
	if failed > 3 {
		reason := "见上面的明细"
		if ctx.Err() != nil {
			reason = truncateError(ctx.Err())
		}
		warnings = append(warnings, fmt.Sprintf("%d 张表的外键没有取到（%s），图上缺这些关系；点「重新加载」可以再试",
			failed, reason))
	}
	d := b.finish()
	d.SlowPath = true
	d.Warnings = warnings
	return d, nil
}

func allColumnsFor(ctx context.Context, exec db.Executor, dbType string, database *string) (models.AllColumnsResult, error) {
	switch dbType {
	case "mysql":
		return mysqlGetAllColumns(ctx, exec, database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return postgresGetAllColumns(ctx, exec, database)
	case "sqlite":
		return sqliteGetAllColumns(ctx, exec, database)
	case "dameng":
		return damengGetAllColumns(ctx, exec, database)
	case "sqlserver":
		return sqlserverGetAllColumns(ctx, exec, database)
	case "clickhouse":
		return clickhouseGetAllColumns(ctx, exec, database)
	case "tdengine":
		return tdengineGetAllColumns(ctx, exec, database)
	case "oracle":
		return oracleGetAllColumns(ctx, exec, database)
	default:
		return models.AllColumnsResult{}, fmt.Errorf("unsupported db type: %s", dbType)
	}
}

func foreignKeysFor(ctx context.Context, exec db.Executor, dbType, table string, database *string) ([]models.ForeignKeyInfo, error) {
	switch dbType {
	case "mysql":
		return mysqlGetForeignKeys(ctx, exec, table, database)
	case "postgresql", "kingbase", "highgo", "vastbase":
		return postgresGetForeignKeys(ctx, exec, table, database, nil)
	case "sqlite":
		return sqliteGetForeignKeys(ctx, exec, table, database)
	case "dameng":
		return damengGetForeignKeys(ctx, exec, table, database)
	case "sqlserver":
		return sqlserverGetForeignKeys(ctx, exec, table, database, nil)
	case "oracle":
		return oracleGetForeignKeys(ctx, exec, table, database)
	default:
		return nil, fmt.Errorf("unsupported db type: %s", dbType)
	}
}

// splitERTableID 把 "schema.table" 拆开（没带 schema 时只有表名）
func splitERTableID(id string) (name, schema string) {
	if i := strings.LastIndex(id, "."); i >= 0 {
		return id[i+1:], id[:i]
	}
	return id, ""
}

func strValOr(s *string, def string) string {
	if s == nil {
		return def
	}
	return *s
}

// truncateError 错误信息限长，避免把一大段驱动输出塞进响应
func truncateError(err error) string {
	const maxLen = 200
	msg := err.Error()
	if utf8.RuneCountInString(msg) > maxLen {
		return string([]rune(msg)[:maxLen]) + "…"
	}
	return msg
}
