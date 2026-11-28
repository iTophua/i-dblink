package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"idblink/backend/db"
	"idblink/backend/models"
)

// ── 真实 PG 上的 schema 贯通 ──
//
// PG 不能在连接上切库、表又按 schema 分层，「这条语句落在哪个库、哪个 schema」只能在真库上
// 验证。开关与事务冒烟共用：
//
//	docker compose -f docker-compose.test.yml up -d
//	IDBLINK_TX_SMOKE_PG=1 go test ./backend/api -run RealPGSchema -v
//
// 每个用例拿到两个库：home 是连接的默认库，work 是请求里选中的库。两边放同名对象当诱饵——
// 语句落错了库或 schema，诱饵会替目标挨刀，所以断言里既看目标、也盯诱饵。

const (
	pgSchemaHome = "idblink_pg_home"
	pgSchemaWork = "idblink_pg_work"
)

type pgSchemaReal struct {
	t       *testing.T
	handler *Handler
	connID  string
	home    string
	work    string
}

func newPGSchemaReal(t *testing.T) *pgSchemaReal {
	t.Helper()
	target := realERTarget(t, "postgresql", "IDBLINK_TX_SMOKE_PG", "IDBLINK_TX_PG",
		"127.0.0.1:15432", "testuser", "testpassword", "testdb")

	// 先建库再连接：清理按注册的逆序执行，删库要排在连接池全部关闭之后。
	// WITH (FORCE)：连接池刚关、服务端进程还在退出时，不带它的 DROP DATABASE 会报「正被访问」
	for _, name := range []string{pgSchemaHome, pgSchemaWork} {
		pgRealAdmin(t, target, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
		pgRealAdmin(t, target, "CREATE DATABASE "+name)
		t.Cleanup(func() { pgRealAdmin(t, target, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)") })
	}

	host, portText, _ := strings.Cut(target.addr, ":")
	port, err := strconv.Atoi(portText)
	require.NoError(t, err)
	manager := db.NewManager()
	handler := &Handler{mgr: manager, tunnel: NewTunnelManager()}
	connID := "pgschema-real"
	// 连接的默认库是 home：请求里带的是 work，处理器必须按库换连接
	require.NoError(t, manager.Connect(connID, db.ConnectArgs{
		DbType: "postgresql", Host: host, Port: port,
		Username: target.user, Password: target.pass, Database: pgSchemaHome,
	}))
	t.Cleanup(func() { _ = manager.Disconnect(connID) })

	return &pgSchemaReal{t: t, handler: handler, connID: connID, home: pgSchemaHome, work: pgSchemaWork}
}

// pgRealAdmin 用一个独立的短连接到 testdb 执行管理语句（建库 / 删库）
func pgRealAdmin(t *testing.T, target realTarget, sqlText string) {
	t.Helper()
	host, portText, _ := strings.Cut(target.addr, ":")
	port, err := strconv.Atoi(portText)
	require.NoError(t, err)
	manager := db.NewManager()
	connID := "pgschema-admin"
	require.NoError(t, manager.Connect(connID, db.ConnectArgs{
		DbType: "postgresql", Host: host, Port: port,
		Username: target.user, Password: target.pass, Database: target.dbName,
	}))
	defer manager.Disconnect(connID)
	exec, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	_, err = exec.ExecContext(context.Background(), sqlText)
	require.NoError(t, err, sqlText)
}

func (f *pgSchemaReal) exec(database string, sqlText string) {
	f.t.Helper()
	exec, err := f.handler.mgr.GetExecutor(f.connID, database)
	require.NoError(f.t, err)
	_, err = exec.ExecContext(context.Background(), sqlText)
	require.NoError(f.t, err, sqlText)
}

// scalar 取一行一列的文本；没有行返回 ""
func (f *pgSchemaReal) scalar(database string, sqlText string) string {
	f.t.Helper()
	exec, err := f.handler.mgr.GetExecutor(f.connID, database)
	require.NoError(f.t, err)
	var s sql.NullString
	err = exec.QueryRowContext(context.Background(), sqlText).Scan(&s)
	if err == sql.ErrNoRows {
		return ""
	}
	require.NoError(f.t, err, sqlText)
	return s.String
}

// body 是「连接 + 选中的库」加上调用方给的字段
func (f *pgSchemaReal) body(extra map[string]any) map[string]any {
	body := map[string]any{"connection_id": f.connID, "database": f.work}
	for k, v := range extra {
		body[k] = v
	}
	return body
}

// call 调处理器并返回响应体。这个后端的约定是 SQL 报错也回 HTTP 200、错误放在 error 字段里
func pgCallRaw(t *testing.T, fn func(http.ResponseWriter, *http.Request), path string, body any) []byte {
	t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest("POST", path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	fn(rr, req)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	return rr.Body.Bytes()
}

// pgCallMap 响应是对象（可能带 error）
func pgCallMap(t *testing.T, fn func(http.ResponseWriter, *http.Request), path string, body any) map[string]json.RawMessage {
	t.Helper()
	var out map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(pgCallRaw(t, fn, path, body), &out))
	return out
}

// pgCallSlice 响应是数组（出错时是 {"error": ...}）
func pgCallSlice(t *testing.T, fn func(http.ResponseWriter, *http.Request), path string, body any) []json.RawMessage {
	t.Helper()
	raw := pgCallRaw(t, fn, path, body)
	var errMsg struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(raw, &errMsg) == nil && errMsg.Error != "" {
		t.Fatalf("%s failed: %s", path, errMsg.Error)
	}
	var out []json.RawMessage
	require.NoError(t, json.Unmarshal(raw, &out), string(raw))
	return out
}

func pgNoErr(t *testing.T, out map[string]json.RawMessage) {
	t.Helper()
	var errMsg string
	if e, ok := out["error"]; ok && len(e) > 0 {
		require.NoError(t, json.Unmarshal(e, &errMsg))
	}
	require.Empty(t, errMsg)
}

// pgErr 取响应里的 error 字段（必须是报错）
func pgErr(t *testing.T, out map[string]json.RawMessage) string {
	t.Helper()
	var errMsg string
	require.NoError(t, json.Unmarshal(out["error"], &errMsg), string(out["error"]))
	require.NotEmpty(t, errMsg)
	return errMsg
}

func decodeSlice[T any](t *testing.T, raw []json.RawMessage) []T {
	t.Helper()
	out := make([]T, 0, len(raw))
	for _, r := range raw {
		var v T
		require.NoError(t, json.Unmarshal(r, &v), string(r))
		out = append(out, v)
	}
	return out
}

// ── 元数据：限定名只取那个 schema 的 ──

func TestRealPGSchemaMetadata(t *testing.T) {
	f := newPGSchemaReal(t)
	for _, stmt := range []string{
		"CREATE SCHEMA app",
		"CREATE TABLE app.customers (id INT PRIMARY KEY)",
		`CREATE TABLE app.orders (
			id INT PRIMARY KEY,
			customer_id INT NOT NULL REFERENCES app.customers (id),
			email TEXT UNIQUE,
			amount NUMERIC CHECK (amount >= 0))`,
		// 同名的另一张表：主键是别的列，没有外键和 CHECK
		"CREATE TABLE public.orders (code TEXT PRIMARY KEY)",
	} {
		f.exec(f.work, stmt)
	}

	columns := func(table string) []string {
		raw := pgCallSlice(t, f.handler.GetColumns, "/columns",
			MetadataRequest{ConnectionID: f.connID, Database: &f.work, TableName: &table})
		cols := decodeSlice[models.ColumnInfo](t, raw)
		names := make([]string, len(cols))
		for i, c := range cols {
			if c.ColumnKey != nil && *c.ColumnKey == "PRI" {
				names[i] = c.ColumnName + " (PK)"
			} else {
				names[i] = c.ColumnName
			}
		}
		return names
	}
	assert.Equal(t, []string{"id (PK)", "customer_id", "email", "amount"}, columns("app.orders"))
	assert.Equal(t, []string{"code (PK)"}, columns("public.orders"))
	// 不带 schema：两个 schema 的同名表混在一起（4 + 1 行）。这正是必须带 schema 的原因
	assert.Len(t, columns("orders"), 5, "unqualified name merges same-named tables across schemas")

	indexes := func(table string) []string {
		raw := pgCallSlice(t, f.handler.GetIndexes, "/indexes",
			MetadataRequest{ConnectionID: f.connID, Database: &f.work, TableName: &table})
		idx := decodeSlice[models.IndexInfo](t, raw)
		names := make([]string, len(idx))
		for i, x := range idx {
			names[i] = x.IndexName + "(" + x.ColumnName + ")"
		}
		return names
	}
	assert.ElementsMatch(t, []string{"orders_pkey(id)", "orders_email_key(email)"}, indexes("app.orders"))
	assert.ElementsMatch(t, []string{"orders_pkey(code)"}, indexes("public.orders"))

	fks := func(table string) []models.ForeignKeyInfo {
		raw := pgCallSlice(t, f.handler.GetForeignKeys, "/foreign-keys",
			MetadataRequest{ConnectionID: f.connID, Database: &f.work, TableName: &table})
		return decodeSlice[models.ForeignKeyInfo](t, raw)
	}
	appFKs := fks("app.orders")
	require.Len(t, appFKs, 1)
	assert.Equal(t, "customers", appFKs[0].ReferencedTable)
	assert.Empty(t, fks("public.orders"), "public.orders has no foreign key")

	checks := func(table string) int {
		raw := pgCallSlice(t, f.handler.GetCheckConstraints, "/check-constraints",
			MetadataRequest{ConnectionID: f.connID, Database: &f.work, TableName: &table})
		return len(raw)
	}
	assert.Equal(t, 1, checks("app.orders"))
	assert.Equal(t, 0, checks("public.orders"))

	ordersTable := "app.orders"
	structureRaw := pgCallRaw(t, f.handler.GetTableStructure, "/table-structure",
		MetadataRequest{ConnectionID: f.connID, Database: &f.work, TableName: &ordersTable})
	var structureErr struct {
		Error string `json:"error"`
	}
	require.NoError(t, json.Unmarshal(structureRaw, &structureErr))
	require.Empty(t, structureErr.Error, string(structureRaw))
	var structure models.TableStructure
	require.NoError(t, json.Unmarshal(structureRaw, &structure))
	assert.Len(t, structure.Columns, 4)
	assert.Len(t, structure.ForeignKeys, 1)
	assert.Len(t, structure.Indexes, 2)
}

// ── 表操作：落在选中的库和 schema 上 ──

func TestRealPGSchemaTableOperationsHitSelectedDatabase(t *testing.T) {
	f := newPGSchemaReal(t)
	// 两个库里放一模一样的对象，只靠 marker 区分
	for _, database := range []string{f.home, f.work} {
		marker := database
		for _, stmt := range []string{
			"CREATE SCHEMA app",
			"CREATE TABLE app.victim (id INT PRIMARY KEY, marker TEXT)",
			fmt.Sprintf("INSERT INTO app.victim VALUES (1, '%s')", marker),
			"CREATE TABLE app.rows_src (id INT)",
			"INSERT INTO app.rows_src SELECT generate_series(1, 3)",
			"CREATE VIEW app.v AS SELECT 1 AS n",
			"CREATE TABLE app.old_name (id INT)",
		} {
			f.exec(database, stmt)
		}
	}

	// 删表：work 里的没了，home 里的同名表原样还在
	pgNoErr(t, pgCallMap(t, f.handler.DropTable, "/drop-table", f.body(map[string]any{"table_name": "app.victim"})))
	assert.Equal(t, "", f.scalar(f.work, "SELECT to_regclass('app.victim')::text"))
	assert.Equal(t, f.home, f.scalar(f.home, "SELECT marker FROM app.victim WHERE id = 1"),
		"the same-named table in the connection's default database must survive")

	// 清空：work 里清掉，home 里的行还在
	pgNoErr(t, pgCallMap(t, f.handler.TruncateTable, "/truncate-table", f.body(map[string]any{"table_name": "app.rows_src"})))
	assert.Equal(t, "0", f.scalar(f.work, "SELECT COUNT(*) FROM app.rows_src"))
	assert.Equal(t, "3", f.scalar(f.home, "SELECT COUNT(*) FROM app.rows_src"))

	// 删视图
	pgNoErr(t, pgCallMap(t, f.handler.DropView, "/drop-view", f.body(map[string]any{"view_name": "app.v"})))
	assert.Equal(t, "", f.scalar(f.work, "SELECT to_regclass('app.v')::text"))
	assert.Equal(t, "app.v", f.scalar(f.home, "SELECT to_regclass('app.v')::text"))

	// 重命名：旧名带 schema，新名不带
	pgNoErr(t, pgCallMap(t, f.handler.RenameTable, "/rename-table",
		f.body(map[string]any{"old_name": "app.old_name", "new_name": "renamed"})))
	assert.Equal(t, "app.renamed", f.scalar(f.work, "SELECT to_regclass('app.renamed')::text"))
	assert.Equal(t, "", f.scalar(f.work, "SELECT to_regclass('app.old_name')::text"))
	assert.Equal(t, "app.old_name", f.scalar(f.home, "SELECT to_regclass('app.old_name')::text"))

	// 表维护
	pgNoErr(t, pgCallMap(t, f.handler.MaintainTable, "/maintain-table",
		f.body(map[string]any{"table_name": "app.rows_src", "operation": "analyze"})))

	// 不带 schema 的名字：work 的 search_path 上没有 app，删不到任何东西。IF EXISTS 不报错——
	// 所以界面上必须带 schema，见前端；这里只确认它至少不会误伤 home
	pgNoErr(t, pgCallMap(t, f.handler.DropTable, "/drop-table", f.body(map[string]any{"table_name": "no_such_table"})))
}

// ── 触发器、过程、函数 ──

func TestRealPGSchemaTriggersAndRoutines(t *testing.T) {
	f := newPGSchemaReal(t)
	for _, stmt := range []string{
		"CREATE SCHEMA app",
		"CREATE SCHEMA app2",
		"CREATE TABLE app.t_trg (id INT PRIMARY KEY, note TEXT)",
		"CREATE TABLE app.t_trg2 (id INT PRIMARY KEY, note TEXT)",
		`CREATE FUNCTION app.set_note_trg() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN NEW.note := 'auto:' || NEW.id; RETURN NEW; END $$`,
		"CREATE TRIGGER t_trg_set BEFORE INSERT ON app.t_trg FOR EACH ROW EXECUTE FUNCTION app.set_note_trg()",
		// 同名触发器建在另一张表上：是另一个触发器，列表里是两行
		"CREATE TRIGGER t_trg_set BEFORE INSERT ON app.t_trg2 FOR EACH ROW EXECUTE FUNCTION app.set_note_trg()",
		"CREATE FUNCTION app.add_one(x INT) RETURNS INT LANGUAGE sql AS 'SELECT x + 1'",
		// 重载、别的 schema 里的同名函数：information_schema.routines 里各是一行
		"CREATE FUNCTION app.add_one(x BIGINT) RETURNS BIGINT LANGUAGE sql AS 'SELECT x + 1'",
		"CREATE FUNCTION app2.add_one(x INT) RETURNS INT LANGUAGE sql AS 'SELECT x + 1'",
		`CREATE PROCEDURE app.write_note(p INT, t TEXT) LANGUAGE sql AS $$
			INSERT INTO app.t_trg (id, note) VALUES (p, t) $$`,
		`CREATE PROCEDURE app.write_note(p INT) LANGUAGE sql AS $$
			INSERT INTO app.t_trg (id) VALUES (p) $$`,
	} {
		f.exec(f.work, stmt)
	}

	// 触发器列表。前端把它和过程、函数放在同一个 Promise.all 里：它一报错，另外两个也跟着没了
	var triggers struct {
		Triggers []map[string]any `json:"triggers"`
		Error    string           `json:"error"`
	}
	require.NoError(t, json.Unmarshal(pgCallRaw(t, f.handler.GetTriggers, "/triggers",
		f.body(nil)), &triggers))
	require.Empty(t, triggers.Error)
	require.Len(t, triggers.Triggers, 2)
	assert.Equal(t, "t_trg_set", triggers.Triggers[0]["name"])
	assert.Equal(t, "app", triggers.Triggers[0]["schema"])
	assert.Equal(t, "t_trg", triggers.Triggers[0]["table_name"])
	assert.Contains(t, triggers.Triggers[0]["definition"], "CREATE TRIGGER t_trg_set")
	// 名字一样，表不同
	assert.Equal(t, "t_trg_set", triggers.Triggers[1]["name"])
	assert.Equal(t, "t_trg2", triggers.Triggers[1]["table_name"])

	// 例程列表按名字去重：重载、别的 schema 里的同名例程不重复出现。名字重复会让连接树的
	// 节点 key 撞车，收起后重名的行留在树上收不掉
	procedures := decodeSlice[string](t, pgCallSlice(t, f.handler.GetProcedures, "/procedures", f.body(nil)))
	assert.Equal(t, []string{"write_note"}, procedures)
	functions := decodeSlice[string](t, pgCallSlice(t, f.handler.GetFunctions, "/functions", f.body(nil)))
	// 触发器函数也是函数（RETURNS trigger），列表里本来就有它
	assert.ElementsMatch(t, []string{"add_one", "set_note_trg"}, functions)
	// GetRoutines（MCP、文档生成走这个）是同一份列表
	var routines models.RoutinesResult
	require.NoError(t, json.Unmarshal(pgCallRaw(t, f.handler.GetRoutines, "/routines",
		f.body(nil)), &routines))
	routineNames := func(list []models.RoutineInfo) []string {
		names := make([]string, 0, len(list))
		for _, r := range list {
			names = append(names, r.RoutineName)
		}
		return names
	}
	assert.Equal(t, []string{"write_note"}, routineNames(routines.Procedures))
	assert.Equal(t, []string{"add_one", "set_note_trg"}, routineNames(routines.Functions))

	body := func(path string, fn func(http.ResponseWriter, *http.Request), name string) string {
		out := pgCallMap(t, fn, path, f.body(map[string]any{"procedure_name": name, "function_name": name}))
		pgNoErr(t, out)
		var b string
		require.NoError(t, json.Unmarshal(out["body"], &b))
		return b
	}

	// 过程定义：此前把库名当 schema 传进去，一律查不到
	procBody := body("/procedure-body", f.handler.GetProcedureBody, "write_note")
	assert.Contains(t, procBody, "CREATE OR REPLACE PROCEDURE")
	assert.Contains(t, procBody, "write_note")
	assert.Contains(t, procBody, "INSERT INTO app.t_trg")
	// 带 schema 的名字找的是同一个
	assert.Equal(t, procBody, body("/procedure-body", f.handler.GetProcedureBody, "app.write_note"))

	fnBody := body("/function-body", f.handler.GetFunctionBody, "app.add_one")
	assert.Contains(t, fnBody, "CREATE OR REPLACE FUNCTION")
	assert.Contains(t, fnBody, "x + 1")

	// 没有这个过程：空串，不算报错
	assert.Equal(t, "", body("/procedure-body", f.handler.GetProcedureBody, "no_such_proc"))

	// 触发器真的会触发（定义没白建）
	f.exec(f.work, "INSERT INTO app.t_trg (id) VALUES (7)")
	assert.Equal(t, "auto:7", f.scalar(f.work, "SELECT note FROM app.t_trg WHERE id = 7"))
	// 另一张表上的同名触发器、只有参数个数不同的重载过程，各自是能用的对象
	f.exec(f.work, "INSERT INTO app.t_trg2 (id) VALUES (8)")
	assert.Equal(t, "auto:8", f.scalar(f.work, "SELECT note FROM app.t_trg2 WHERE id = 8"))
	f.exec(f.work, "CALL app.write_note(9)")
	assert.Equal(t, "auto:9", f.scalar(f.work, "SELECT note FROM app.t_trg WHERE id = 9"))
}

// pgTableShape 一张表在系统目录里的样子：列、约束、索引、注释。schema 名归一化掉，
// 用来比较「原表」和「拿建表语句重建出来的表」。四条查询都写全、不拼片段：
// 子句顺序拼错了不会有编译器提醒，只有真库会报
func (f *pgSchemaReal) tableShape(database, schema, table string) map[string]string {
	f.t.Helper()
	byTable := fmt.Sprintf(" WHERE n.nspname = '%s' AND c.relname = '%s'", schema, table)
	return map[string]string{
		"columns": f.scalar(database,
			"SELECT string_agg(a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod)"+
				" || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END"+
				" || ' ' || COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')"+
				" || ' identity=' || a.attidentity::text || ' generated=' || a.attgenerated::text"+
				" || ' collate=' || COALESCE(cn.collname, '')"+
				", E'\\n' ORDER BY a.attnum)"+
				" FROM pg_catalog.pg_attribute a"+
				" JOIN pg_catalog.pg_class c ON c.oid = a.attrelid"+
				" JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace"+
				" LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum"+
				" LEFT JOIN pg_catalog.pg_collation cn ON cn.oid = a.attcollation"+
				byTable+" AND a.attnum > 0 AND NOT a.attisdropped"),
		"constraints": f.scalar(database,
			"SELECT COALESCE(string_agg(con.contype::text || ' ' || pg_catalog.pg_get_constraintdef(con.oid, true)"+
				", E'\\n' ORDER BY con.contype, con.conname), '')"+
				" FROM pg_catalog.pg_constraint con"+
				" JOIN pg_catalog.pg_class c ON c.oid = con.conrelid"+
				" JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace"+
				byTable+" AND con.contype IN ('p','u','f','c','x')"),
		"indexes": f.scalar(database,
			"SELECT COALESCE(string_agg(replace(pg_catalog.pg_get_indexdef(i.indexrelid), n.nspname || '.', '')"+
				", E'\\n' ORDER BY x.relname), '')"+
				" FROM pg_catalog.pg_index i"+
				" JOIN pg_catalog.pg_class c ON c.oid = i.indrelid"+
				" JOIN pg_catalog.pg_class x ON x.oid = i.indexrelid"+
				" JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace"+
				byTable),
		"comments": f.scalar(database,
			"SELECT COALESCE(pg_catalog.obj_description(c.oid, 'pg_class'), '') || E'\\n' ||"+
				" COALESCE((SELECT string_agg(a.attname || '=' ||"+
				" pg_catalog.col_description(a.attrelid, a.attnum), E'\\n' ORDER BY a.attnum)"+
				" FROM pg_catalog.pg_attribute a"+
				" WHERE a.attrelid = c.oid AND a.attnum > 0"+
				" AND pg_catalog.col_description(a.attrelid, a.attnum) IS NOT NULL), '')"+
				" FROM pg_catalog.pg_class c"+
				" JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace"+
				byTable),
	}
}

// ── 建表语句 ──

func TestRealPGSchemaDDL(t *testing.T) {
	f := newPGSchemaReal(t)
	for _, stmt := range []string{
		"CREATE SCHEMA app",
		`CREATE TABLE app.customers (
			id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
			email VARCHAR(120) NOT NULL,
			note TEXT DEFAULT 'none',
			email_upper TEXT GENERATED ALWAYS AS (upper(email)) STORED,
			amount NUMERIC(12,2) DEFAULT 0 CHECK (amount >= 0),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			CONSTRAINT customers_email_key UNIQUE (email))`,
		"CREATE UNIQUE INDEX customers_created_idx ON app.customers (created_at)",
		"COMMENT ON TABLE app.customers IS 'customer master'",
		"COMMENT ON COLUMN app.customers.note IS 'free text'",
		`CREATE TABLE app.orders (
			id INT PRIMARY KEY,
			customer_id INT NOT NULL REFERENCES app.customers (id) ON DELETE CASCADE,
			tags TEXT COLLATE "C")`,
		"COMMENT ON COLUMN app.orders.tags IS 'tag list'",
		"CREATE VIEW app.v_recent AS SELECT id, email FROM app.customers",
		// 用户 schema 里的排序规则（不在 pg_catalog）、排他约束
		"CREATE COLLATION app.ci_text (provider = icu, locale = 'und-u-ks-level2', deterministic = false)",
		`CREATE TABLE app.bookings (
			id INT PRIMARY KEY,
			room TEXT COLLATE app.ci_text NOT NULL,
			during INT4RANGE NOT NULL,
			CONSTRAINT bookings_no_overlap EXCLUDE USING gist (during WITH &&))`,
	} {
		f.exec(f.work, stmt)
	}

	getDDL := func(database, table string) []string {
		out := pgCallMap(t, f.handler.GetTableDDL, "/ddl", map[string]any{
			"connection_id": f.connID, "database": database, "table_name": table,
		})
		pgNoErr(t, out)
		var ddls []string
		require.NoError(t, json.Unmarshal(out["ddls"], &ddls))
		return ddls
	}

	// 连接的默认库是 home，表只在 work 里：必须按请求里的库去找
	require.Len(t, getDDL(f.work, "app.customers"), 1)
	// 指到没有这张表的库：明确说找不到，而不是拿别的表充数
	assert.Contains(t, pgErr(t, pgCallMap(t, f.handler.GetTableDDL, "/ddl", map[string]any{
		"connection_id": f.connID, "database": f.home, "table_name": "app.customers",
	})), "no DDL found")

	ddl := getDDL(f.work, "app.customers")[0]
	t.Logf("generated DDL:\n%s", ddl)
	// CHECK 写成表级约束（多列 CHECK 也适用，和 pg_dump 一致）；列上先 DEFAULT 后 NOT NULL；
	// 约束名带引号。下面「重建后比对系统目录」才是完整性检验，这里只挑关键几样看文本
	for _, want := range []string{
		`CREATE TABLE "app"."customers" (`,
		`"id" integer GENERATED BY DEFAULT AS IDENTITY NOT NULL`,
		`"email" character varying(120) NOT NULL`,
		`"note" text DEFAULT 'none'::text`,
		`"email_upper" text GENERATED ALWAYS AS (upper((email)::text)) STORED`,
		`"amount" numeric(12,2) DEFAULT 0,`,
		`CONSTRAINT "customers_amount_check" CHECK (amount >= 0::numeric)`,
		`"created_at" timestamp with time zone DEFAULT now() NOT NULL`,
		`CONSTRAINT "customers_pkey" PRIMARY KEY (id)`,
		`CONSTRAINT "customers_email_key" UNIQUE (email)`,
		`CREATE UNIQUE INDEX customers_created_idx ON app.customers USING btree (created_at)`,
		`COMMENT ON TABLE "app"."customers" IS 'customer master'`,
		`COMMENT ON COLUMN "app"."customers"."note" IS 'free text'`,
	} {
		assert.Contains(t, ddl, want)
	}

	// 拿这份建表语句在另一个 schema 里重建，系统目录里的样子要和原表一致——
	// 导出 SQL、复制表靠的就是它
	f.exec(f.work, "CREATE SCHEMA ddl_rt")
	rebuilt := strings.ReplaceAll(ddl, `"app"."customers"`, `"ddl_rt"."customers"`)
	rebuilt = strings.ReplaceAll(rebuilt, "ON app.customers", "ON ddl_rt.customers")
	f.exec(f.work, rebuilt)
	want := f.tableShape(f.work, "app", "customers")
	got := f.tableShape(f.work, "ddl_rt", "customers")
	for _, part := range []string{"columns", "constraints", "indexes", "comments"} {
		assert.Equal(t, want[part], got[part], "rebuilt table differs in %s", part)
	}

	// 外键：引用的表带 schema，级联删除规则在
	ordersDDL := getDDL(f.work, "app.orders")[0]
	assert.Contains(t, ordersDDL,
		`FOREIGN KEY (customer_id) REFERENCES app.customers(id) ON DELETE CASCADE`)
	assert.Contains(t, ordersDDL, `"tags" text COLLATE "C"`)
	assert.Contains(t, ordersDDL, `COMMENT ON COLUMN "app"."orders"."tags" IS 'tag list'`)

	// 视图
	assert.Contains(t, getDDL(f.work, "app.v_recent")[0], `CREATE VIEW "app"."v_recent" AS`)

	// 排序规则定义在用户 schema 里：要带 schema，只写名字的话不在 search_path 上就找不到。
	// 排他约束也要在建表语句里
	bookingsDDL := getDDL(f.work, "app.bookings")[0]
	assert.Contains(t, bookingsDDL, `"room" text COLLATE app.ci_text`)
	assert.Contains(t, bookingsDDL, `CONSTRAINT "bookings_no_overlap" EXCLUDE USING gist (during WITH &&)`)
	f.exec(f.work, strings.ReplaceAll(bookingsDDL, `"app"."bookings"`, `"ddl_rt"."bookings"`))
	wantBookings := f.tableShape(f.work, "app", "bookings")
	gotBookings := f.tableShape(f.work, "ddl_rt", "bookings")
	for _, part := range []string{"columns", "constraints", "indexes", "comments"} {
		assert.Equal(t, wantBookings[part], gotBookings[part], "rebuilt bookings differs in %s", part)
	}
	// 重建出来的表真的能用：排他约束生效、排序规则生效
	f.exec(f.work, `INSERT INTO ddl_rt.bookings VALUES (1, 'Room', '[10,20)')`)
	assert.Equal(t, "1", f.scalar(f.work, `SELECT COUNT(*) FROM ddl_rt.bookings WHERE room = 'room'`),
		"case-insensitive collation from the user schema must survive the round trip")
}

// ── 序列 ──

func TestRealPGSchemaSequences(t *testing.T) {
	f := newPGSchemaReal(t)
	f.exec(f.work, "CREATE SCHEMA app")
	f.exec(f.work, "CREATE SEQUENCE app.seq_a START WITH 100")
	f.exec(f.home, "CREATE SCHEMA app")
	f.exec(f.home, "CREATE SEQUENCE app.seq_a START WITH 900")

	sequences := decodeSlice[models.SequenceInfo](t, pgCallSlice(t, f.handler.GetSequences, "/sequences", f.body(nil)))
	names := make([]string, len(sequences))
	for i, s := range sequences {
		names[i] = s.SequenceName
	}
	assert.Contains(t, names, "app.seq_a", "sequences outside public must be listed with their schema")

	// 重置落在选中的库上：home 里的同名序列不受影响
	pgNoErr(t, pgCallMap(t, f.handler.ResetSequence, "/reset-sequence",
		f.body(map[string]any{"sequence_name": "app.seq_a", "value": 500})))
	assert.Equal(t, "500", f.scalar(f.work, "SELECT nextval('app.seq_a')::text"))
	assert.Equal(t, "900", f.scalar(f.home, "SELECT nextval('app.seq_a')::text"))

	// 列表给的是不带引号的 schema.序列（app.seq odd），名字里有空格也要能用：按标识符转义。
	// 此前只替换单引号，拼出来是 ALTER SEQUENCE app.seq odd，语法错误
	f.exec(f.work, `CREATE SEQUENCE app."seq odd" START WITH 1`)
	pgNoErr(t, pgCallMap(t, f.handler.ResetSequence, "/reset-sequence",
		f.body(map[string]any{"sequence_name": "app.seq odd", "value": 42})))
	assert.Equal(t, "42", f.scalar(f.work, `SELECT nextval('app."seq odd"')::text`))
}

// ── 导入与导出 ──

func TestRealPGSchemaImportAndExport(t *testing.T) {
	f := newPGSchemaReal(t)
	for _, database := range []string{f.home, f.work} {
		f.exec(database, "CREATE SCHEMA app")
		f.exec(database, "CREATE TABLE app.t_imp (id INT PRIMARY KEY, v TEXT)")
	}

	// 此前把库名拼成 "库"."schema.表"，PG 上导入一律报 schema 不存在
	out := pgCallMap(t, f.handler.BatchImport, "/import", f.body(map[string]any{
		"table_name": "app.t_imp", "mode": "insert",
		"rows": []map[string]any{{"id": 1, "v": "a"}, {"id": 2, "v": "it's"}},
	}))
	pgNoErr(t, out)
	assert.Equal(t, "2", f.scalar(f.work, "SELECT COUNT(*) FROM app.t_imp"))
	assert.Equal(t, "it's", f.scalar(f.work, "SELECT v FROM app.t_imp WHERE id = 2"))
	assert.Equal(t, "0", f.scalar(f.home, "SELECT COUNT(*) FROM app.t_imp"), "rows must not land in the default database")

	// replace 模式：先清空再写，同样落在选中的库
	pgNoErr(t, pgCallMap(t, f.handler.BatchImport, "/import", f.body(map[string]any{
		"table_name": "app.t_imp", "mode": "replace",
		"rows": []map[string]any{{"id": 9, "v": "only"}},
	})))
	assert.Equal(t, "9", f.scalar(f.work, "SELECT string_agg(id::text, ',' ORDER BY id) FROM app.t_imp"))

	// 导出：按限定名取列和行。响应是一行一个 JSON 对象，键按字母序输出
	raw := string(pgCallRaw(t, f.handler.StreamExport, "/export", f.body(map[string]any{"table_name": "app.t_imp"})))
	assert.NotContains(t, raw, `"type":"error"`, raw)
	assert.Contains(t, raw, `"total_rows":1`)
	assert.Contains(t, raw, `"columns":["id","v"]`)
	assert.Contains(t, raw, `[9,"only"]`)
}

// ── 服务端超时 ──

// 连接串里写死的 statement_timeout 曾是 30 秒：跑得久一点的查询、大 ALTER、导入批次都被
// PG 自己杀掉，界面上也改不了。现在对齐上层的 30 分钟；等锁不再设 10 秒上限
func TestRealPGStatementTimeout(t *testing.T) {
	if testing.Short() {
		t.Skip("runs a 32-second statement")
	}
	f := newPGSchemaReal(t)

	assert.Equal(t, "30min", f.scalar(f.work, "SHOW statement_timeout"))
	assert.Equal(t, "0", f.scalar(f.work, "SHOW lock_timeout"), "waiting for a lock is not an error")

	// 真跑一条超过 30 秒的语句：以前到 30 秒就被服务端取消
	raw := pgCallRaw(t, f.handler.Query, "/query",
		f.body(map[string]any{"sql": "SELECT pg_sleep(32)"}))
	var result models.QueryResult
	require.NoError(t, json.Unmarshal(raw, &result), string(raw))
	assert.Empty(t, result.Error, "a statement longer than 30s must not be killed by the server")
	assert.Len(t, result.Rows, 1)
}
