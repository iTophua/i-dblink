package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// GetTableDDLRequest 获取建表语句请求
type GetTableDDLRequest struct {
	ConnectionID string `json:"connection_id"`
	TableName    string `json:"table_name"`
	Database     string `json:"database,omitempty"`
	Schema       string `json:"schema,omitempty"`
}

// GetTableDDL 获取表的完整建表语句
func (h *Handler) GetTableDDL(w http.ResponseWriter, r *http.Request) {
	var req GetTableDDLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	pool, err := h.mgr.GetPool(req.ConnectionID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("connection not found: %v", err))
		return
	}

	sqlDB := pool.DB()
	tableName, schema := req.TableName, req.Schema
	// PG 系：表名可以带 schema（schema.表）；PG 不能在连接上切库，选了别的库就按库取连接——
	// 拿默认库去查，查到的可能是另一个库里的同名表
	switch pool.DbType {
	case "postgresql", "kingbase", "highgo", "vastbase":
		tableName, schema = tableQualifier(pool.DbType, req.TableName, &req.Schema)
		if req.Database != "" {
			sqlDB, err = h.mgr.GetWithDatabase(req.ConnectionID, req.Database)
			if err != nil {
				writeJSONError(w, err.Error())
				return
			}
		}
	}

	ddls, err := getTableDDL(sqlDB, pool.DbType, tableName, req.Database, schema)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ddls": ddls,
	})
}

// getTableDDL 根据数据库类型获取建表语句
func getTableDDL(sqlDB *sql.DB, dbType, tableName, database, schema string) ([]string, error) {
	var ddls []string

	switch dbType {
	case "mysql", "mariadb":
		// 连接未存默认库且调用方未传 database 时，取服务器端当前默认库；
		// 仍拿不到则报可行动的错误，而不是拼出 ``.`` 触发 Error 1102 (Incorrect database name '')
		if database == "" {
			var cur sql.NullString
			if err := sqlDB.QueryRow("SELECT DATABASE()").Scan(&cur); err != nil || !cur.Valid || cur.String == "" {
				return nil, fmt.Errorf(
					"no database selected for table %s: the connection has no default database, pass the 'database' parameter (use list_databases to find it)",
					tableName)
			}
			database = cur.String
		}
		escapedDb := strings.ReplaceAll(database, "`", "``")
		escapedTable := strings.ReplaceAll(tableName, "`", "``")
		rows, err := sqlDB.Query(fmt.Sprintf("SHOW CREATE TABLE `%s`.`%s`", escapedDb, escapedTable))
		if err != nil {
			return nil, fmt.Errorf("show create table failed: %v", err)
		}
		defer rows.Close()

		for rows.Next() {
			var tn, createTable string
			if err := rows.Scan(&tn, &createTable); err == nil {
				ddls = append(ddls, createTable)
			}
		}

	case "postgresql", "kingbase", "highgo", "vastbase":
		ddl, err := postgresBuildTableDDL(sqlDB, schema, tableName)
		if err != nil {
			return nil, err
		}
		ddls = append(ddls, ddl)

	case "sqlite":
		rows, err := sqlDB.Query("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", tableName)
		if err != nil {
			return nil, fmt.Errorf("get table ddl failed: %v", err)
		}
		defer rows.Close()

		for rows.Next() {
			var sql string
			if err := rows.Scan(&sql); err == nil && sql != "" {
				ddls = append(ddls, sql+";")
			}
		}

	case "clickhouse":
		// CH 系原生 SHOW CREATE TABLE（含 ENGINE/ORDER BY 完整定义；视图同样适用）；
		// 未传 database 时用连接 DSN 里的当前库（CH 默认 default，不会为空）
		qualified := "`" + strings.ReplaceAll(tableName, "`", "``") + "`"
		if database != "" {
			qualified = "`" + strings.ReplaceAll(database, "`", "``") + "`." + qualified
		}
		var tn, stmt string
		if err := sqlDB.QueryRow("SHOW CREATE TABLE "+qualified).Scan(&tn, &stmt); err == nil && stmt != "" {
			ddls = append(ddls, stmt)
		}

	case "tdengine":
		// TDengine 无 SHOW CREATE：从 DESCRIBE 重建近似 DDL
		if stmt, err := tdengineGetTableDDL(context.Background(), sqlDB, tableName, database); err == nil && stmt != "" {
			ddls = append(ddls, stmt)
		}

	case "dameng":
		schema := database
		if schema == "" {
			// 未指定 schema 时用当前 schema 兜底
			schema = currentSchemaFallback(sqlDB, dbType)
		}
		if schema == "" {
			return nil, fmt.Errorf(
				"no schema selected for table %s: the connection has no default schema, pass the 'database' parameter",
				tableName)
		}
		schemaPtr := &schema

		// 1. 先尝试视图定义：用达梦 / Oracle 兼容的系统视图 ALL_VIEWS
		var viewDef string
		err := sqlDB.QueryRow(
			"SELECT TEXT FROM ALL_VIEWS WHERE OWNER = ? AND VIEW_NAME = ?",
			strings.ToUpper(schema), strings.ToUpper(tableName),
		).Scan(&viewDef)
		if err == nil && viewDef != "" {
			ddls = append(ddls, "CREATE OR REPLACE VIEW "+tableName+" AS\n"+viewDef+";")
		} else {
			// 2. 表定义：复用 doc.go 的 getTableDDLForDoc（通过 ALL_TAB_COLUMNS 拼列）
			if tableSQL := getTableDDLForDoc(context.Background(), sqlDB, dbType, tableName, schemaPtr); tableSQL != "" {
				ddls = append(ddls, tableSQL)
			}
		}

	default:
		return nil, fmt.Errorf("unsupported database type: %s", dbType)
	}

	if len(ddls) == 0 {
		return nil, fmt.Errorf("no DDL found for table: %s", tableName)
	}

	return ddls, nil
}

// currentSchemaFallback 查询当前 schema（连接未存默认 schema 时兜底），查询失败返回空串。
func currentSchemaFallback(db *sql.DB, dbType string) string {
	query := "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') FROM DUAL"
	if dbType == "kingbase" {
		query = "SELECT current_schema"
	}
	var s string
	if err := db.QueryRow(query).Scan(&s); err != nil {
		return ""
	}
	return strings.TrimSpace(s)
}

// pgColumnDef PG 一列的定义要素（取自 pg_attribute）
type pgColumnDef struct {
	name      string
	dataType  string
	notNull   bool
	def       sql.NullString
	comment   sql.NullString
	collation sql.NullString
	identity  sql.NullString
	generated sql.NullString
}

// postgresBuildTableDDL 从系统目录拼出建表语句：列（NOT NULL / 默认值 / 自增 / 生成列 /
// 排序规则）、主键 / 唯一 / 外键 / CHECK 约束、独立索引、表和列的注释；视图取视图定义。
// 此前只输出「列名 类型」：表结构页的 DDL、导出 SQL、复制表拿到的都是一张没有约束的空壳
func postgresBuildTableDDL(sqlDB *sql.DB, schema, table string) (string, error) {
	if schema == "" {
		// 没带 schema：按名字找，优先当前 schema
		var found sql.NullString
		err := sqlDB.QueryRow(`
			SELECT n.nspname
			FROM pg_catalog.pg_class c
			JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			WHERE c.relname = $1
				AND n.nspname NOT IN ('pg_catalog', 'information_schema')
				AND n.nspname NOT LIKE 'pg_toast%'
			ORDER BY (n.nspname = current_schema()) DESC, n.nspname
			LIMIT 1`, table).Scan(&found)
		if err != nil || !found.Valid {
			return "", fmt.Errorf("no DDL found for table: %s", table)
		}
		schema = found.String
	}
	ref := quoteIdentPG(schema) + "." + quoteIdentPG(table)
	tableFrom := " FROM pg_catalog.pg_class c" +
		" JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace" +
		" WHERE n.nspname = $1 AND c.relname = $2"

	var relkind, persistence string
	var tableComment sql.NullString
	err := sqlDB.QueryRow("SELECT c.relkind, c.relpersistence, pg_catalog.obj_description(c.oid, 'pg_class')"+tableFrom,
		schema, table).Scan(&relkind, &persistence, &tableComment)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("no DDL found for table: %s.%s", schema, table)
	}
	if err != nil {
		return "", fmt.Errorf("get table ddl failed: %v", err)
	}

	// attidentity（PG 10 起）/ attgenerated（PG 12 起）：老版本没有这两列，先探一下再决定查不查
	identitySel, generatedSel := `''::"char"`, `''::"char"`
	if pgAttributeHas(sqlDB, "attidentity") {
		identitySel = "a.attidentity"
	}
	if pgAttributeHas(sqlDB, "attgenerated") {
		generatedSel = "a.attgenerated"
	}

	rows, err := sqlDB.Query(`
		SELECT a.attname,
			pg_catalog.format_type(a.atttypid, a.atttypmod),
			a.attnotnull,
			pg_catalog.pg_get_expr(d.adbin, d.adrelid),
			pg_catalog.col_description(c.oid, a.attnum),
			CASE WHEN a.attcollation <> t.typcollation AND t.typcollation <> 0 THEN
				(SELECT CASE WHEN cn.nspname = 'pg_catalog' THEN quote_ident(co.collname)
						ELSE quote_ident(cn.nspname) || '.' || quote_ident(co.collname) END
					FROM pg_catalog.pg_collation co
					JOIN pg_catalog.pg_namespace cn ON cn.oid = co.collnamespace
					WHERE co.oid = a.attcollation)
			END,
			`+identitySel+`, `+generatedSel+`
		FROM pg_catalog.pg_attribute a
		JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
		LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
		WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
		ORDER BY a.attnum`, schema, table)
	if err != nil {
		return "", fmt.Errorf("get table ddl failed: %v", err)
	}
	defer rows.Close()

	columns := make([]pgColumnDef, 0)
	for rows.Next() {
		var col pgColumnDef
		if err := rows.Scan(&col.name, &col.dataType, &col.notNull, &col.def, &col.comment,
			&col.collation, &col.identity, &col.generated); err != nil {
			return "", fmt.Errorf("get table ddl failed: %v", err)
		}
		columns = append(columns, col)
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("get table ddl failed: %v", err)
	}
	if len(columns) == 0 {
		return "", fmt.Errorf("no DDL found for table: %s.%s", schema, table)
	}
	// 读完就关：后面还要在同一张表上跑约束、索引两个查询
	rows.Close()

	var sb strings.Builder
	switch relkind {
	case "v":
		var viewDef sql.NullString
		if err := sqlDB.QueryRow("SELECT pg_catalog.pg_get_viewdef(c.oid, true)"+tableFrom,
			schema, table).Scan(&viewDef); err != nil {
			return "", fmt.Errorf("get view definition failed: %v", err)
		}
		fmt.Fprintf(&sb, "CREATE VIEW %s AS\n%s;\n", ref, strings.TrimSpace(viewDef.String))
		pgWriteComments(&sb, ref, tableComment, columns)
		return sb.String(), nil
	case "r", "p":
		keyword := "CREATE TABLE"
		if persistence == "u" {
			keyword = "CREATE UNLOGGED TABLE"
		}
		fmt.Fprintf(&sb, "%s %s (\n", keyword, ref)
	default:
		fmt.Fprintf(&sb, "CREATE TABLE %s (\n", ref)
	}

	// 约束定义取自 pg_get_constraintdef；PG 18 起非空约束也进了 pg_constraint，这里只要表级约束
	// （排他约束 EXCLUDE 一并带上）。迭代出错要报出来：静默漏掉约束等于产出一份不完整的建表语句
	conRows, err := sqlDB.Query(`
		SELECT con.conname, pg_catalog.pg_get_constraintdef(con.oid, true)
		FROM pg_catalog.pg_constraint con
		JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
		WHERE n.nspname = $1 AND rel.relname = $2 AND con.contype IN ('p', 'u', 'f', 'c', 'x')
		ORDER BY CASE con.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'f' THEN 3 WHEN 'c' THEN 4 ELSE 5 END, con.conname`,
		schema, table)
	if err != nil {
		return "", fmt.Errorf("get table ddl failed: %v", err)
	}
	type constraintDef struct{ name, def string }
	constraints := make([]constraintDef, 0)
	for conRows.Next() {
		var c constraintDef
		if err := conRows.Scan(&c.name, &c.def); err != nil {
			conRows.Close()
			return "", fmt.Errorf("get table ddl failed: %v", err)
		}
		constraints = append(constraints, c)
	}
	if err := conRows.Err(); err != nil {
		conRows.Close()
		return "", fmt.Errorf("get table ddl failed: %v", err)
	}
	conRows.Close()

	for i, col := range columns {
		line := "  " + quoteIdentPG(col.name) + " " + col.dataType
		if col.collation.Valid {
			// 排序规则的名字在查询里已经按标识符加好了引号（不在 pg_catalog 里的带 schema）
			line += " COLLATE " + col.collation.String
		}
		switch {
		case col.generated.Valid && col.generated.String == "s":
			if !col.def.Valid || col.def.String == "" {
				return "", fmt.Errorf("get table ddl failed: no expression for generated column %s.%s",
					ref, quoteIdentPG(col.name))
			}
			line += " GENERATED ALWAYS AS (" + col.def.String + ") STORED"
		case col.identity.Valid && col.identity.String == "a":
			line += " GENERATED ALWAYS AS IDENTITY"
		case col.identity.Valid && col.identity.String == "d":
			line += " GENERATED BY DEFAULT AS IDENTITY"
		case col.def.Valid && col.def.String != "":
			line += " DEFAULT " + col.def.String
		}
		if col.notNull {
			line += " NOT NULL"
		}
		if i < len(columns)-1 || len(constraints) > 0 {
			line += ","
		}
		sb.WriteString(line + "\n")
	}
	for i, c := range constraints {
		comma := ""
		if i < len(constraints)-1 {
			comma = ","
		}
		sb.WriteString("  CONSTRAINT " + quoteIdentPG(c.name) + " " + c.def + comma + "\n")
	}
	sb.WriteString(");\n")

	// 不挂在约束上的索引（主键 / 唯一约束的索引已经随约束建好了）
	idxRows, err := sqlDB.Query(`
		SELECT pg_catalog.pg_get_indexdef(i.indexrelid)
		FROM pg_catalog.pg_index i
		JOIN pg_catalog.pg_class rel ON rel.oid = i.indrelid
		JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
		WHERE n.nspname = $1 AND rel.relname = $2
			AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint con WHERE con.conindid = i.indexrelid)
		ORDER BY idx.relname`, schema, table)
	if err != nil {
		return "", fmt.Errorf("get table ddl failed: %v", err)
	}
	for idxRows.Next() {
		var def string
		if err := idxRows.Scan(&def); err != nil {
			idxRows.Close()
			return "", fmt.Errorf("get table ddl failed: %v", err)
		}
		if def != "" {
			sb.WriteString(def + ";\n")
		}
	}
	if err := idxRows.Err(); err != nil {
		idxRows.Close()
		return "", fmt.Errorf("get table ddl failed: %v", err)
	}
	idxRows.Close()

	pgWriteComments(&sb, ref, tableComment, columns)
	return sb.String(), nil
}

// pgWriteComments 表注释和列注释（有才写）
func pgWriteComments(sb *strings.Builder, tableRef string, tableComment sql.NullString, columns []pgColumnDef) {
	if tableComment.Valid && tableComment.String != "" {
		fmt.Fprintf(sb, "\nCOMMENT ON TABLE %s IS %s;\n", tableRef, escapeStringLiteral(tableComment.String))
	}
	for _, col := range columns {
		if col.comment.Valid && col.comment.String != "" {
			fmt.Fprintf(sb, "COMMENT ON COLUMN %s.%s IS %s;\n", tableRef, quoteIdentPG(col.name),
				escapeStringLiteral(col.comment.String))
		}
	}
}

// pgAttributeHas pg_attribute 里有没有这一列（column 只能是代码里写死的列名）
func pgAttributeHas(sqlDB *sql.DB, column string) bool {
	rs, err := sqlDB.Query("SELECT a." + column + " FROM pg_catalog.pg_attribute a LIMIT 0")
	if err != nil {
		return false
	}
	rs.Close()
	return true
}
