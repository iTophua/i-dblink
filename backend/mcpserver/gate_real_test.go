package mcpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"idblink/backend"
)

// 只读门禁在真库上的验证（默认跳过）。分类器的词法规则是按各库文档写的，这里确认三件事：
//  1. 放行的只读语句在真库上跑得通、结果对（词法没判错）；
//  2. 拦下的语句如果直接发给数据库，藏在里面的写真的会执行——门禁拦的是真东西；
//  3. PG 的 $tag$ 函数体走 execute_ddl / execute_script 能建出函数。
//
// 库由根目录 docker compose -f docker-compose.test.yml up -d 起（13306 / 15432）：
//
//	IDBLINK_TX_SMOKE_PG=1 IDBLINK_TX_SMOKE_MYSQL=1 \
//	  go test ./backend/mcpserver -run RealGate -count=1 -v

type realGateTarget struct {
	dbType, host   string
	port           int
	user, pass, db string
}

func realGateTargetFor(t *testing.T, dbType, flag, prefix, defAddr, defUser, defPass, defDB string) realGateTarget {
	t.Helper()
	if os.Getenv(flag) != "1" {
		t.Skipf("set %s=1 to run against a real %s", flag, dbType)
	}
	env := func(suffix, def string) string {
		if v := os.Getenv(prefix + "_" + suffix); v != "" {
			return v
		}
		return def
	}
	addr := env("ADDR", defAddr)
	host, portText, ok := strings.Cut(addr, ":")
	require.True(t, ok, "bad address %q", addr)
	port, err := strconv.Atoi(portText)
	require.NoError(t, err)
	return realGateTarget{
		dbType: dbType, host: host, port: port,
		user: env("USER", defUser), pass: env("PASS", defPass), db: env("DB", defDB),
	}
}

// realGateEnv 一个连着真库的 MCP server（存储在临时 HOME 下，不碰真实数据）
type realGateEnv struct {
	t      *testing.T
	app    *backend.App
	client *stdioClient
	connID string
}

func newRealGateEnv(t *testing.T, target realGateTarget) *realGateEnv {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	app := backend.NewApp()
	require.NoError(t, app.InitStandalone())
	dbName, password := target.db, target.pass
	conn, err := app.SaveConnection(backend.ConnectionInput{
		Name: "gate-" + target.dbType, DbType: target.dbType, Host: target.host, Port: target.port,
		Username: target.user, Password: &password, Database: &dbName,
	})
	require.NoError(t, err)
	client := startStdioServer(t, New(app))
	client.handshake(t)
	// 凭据或地址不对时在这里就报出来，别等到后面一条条断言失败
	require.NoError(t, app.ConnectDatabase(conn.ID), "cannot connect to the test %s server", target.dbType)
	return &realGateEnv{t: t, app: app, client: client, connID: conn.ID}
}

// toolRows 工具结果里的查询体（报错时正文不是这个形状，解析失败就当空）
type toolRows struct {
	Columns      []string `json:"columns"`
	Rows         [][]any  `json:"rows"`
	RowsAffected *uint64  `json:"rows_affected"`
}

func (e *realGateEnv) tool(name string, args map[string]any) (toolReply, toolRows) {
	e.t.Helper()
	if args == nil {
		args = map[string]any{}
	}
	args["connection_id"] = e.connID
	reply := e.client.tool(name, args)
	var body toolRows
	_ = json.Unmarshal([]byte(reply.text()), &body)
	return reply, body
}

// mustQuery 一条必须成功的只读查询，第一行第一列必须等于 want
func (e *realGateEnv) mustQuery(sql string, want any) {
	e.t.Helper()
	reply, body := e.tool("execute_query", map[string]any{"sql": sql})
	require.False(e.t, reply.IsError, "execute_query %q: %s", sql, reply.text())
	require.Len(e.t, body.Rows, 1, "execute_query %q: %s", sql, reply.text())
	require.Equal(e.t, fmt.Sprint(want), fmt.Sprint(body.Rows[0][0]), "execute_query %q", sql)
}

// mustReject 门禁必须拦下——而且得是门禁拦的：数据库报错同样是 isError，只看 isError 的话
// 「门禁放行、语句在库里出错」（语法错、对象已存在……）也算通过。门禁的拒绝文本都以
// 「<工具名> only allows …」开头（explain_query 是 accepts a single statement），数据库的报错
// 是结果体里的 JSON 或 "DDL execution failed: …"
func (e *realGateEnv) mustReject(toolName, sql string) {
	e.t.Helper()
	reply, _ := e.tool(toolName, map[string]any{"sql": sql})
	require.True(e.t, reply.IsError, "%s %q must be rejected, got: %s", toolName, sql, reply.text())
	text := reply.text()
	require.True(e.t, strings.HasPrefix(text, toolName+" only allows") || strings.HasPrefix(text, toolName+" accepts a single statement"),
		"%s %q must be rejected by the gate, not by the database, got: %s", toolName, sql, text)
}

// mustRun 经工具执行一条写语句，必须成功
func (e *realGateEnv) mustRun(toolName, sql string) toolRows {
	e.t.Helper()
	reply, body := e.tool(toolName, map[string]any{"sql": sql})
	require.False(e.t, reply.IsError, "%s %q: %s", toolName, sql, reply.text())
	return body
}

// run 绕过门禁直接发给数据库，相当于「门禁放行」的情形：用来确认拦下的东西真会执行。
// SQL 报错在 QueryResult.Error 里，这里一并当错误返回
func (e *realGateEnv) run(sql string) error {
	res, err := e.app.ExecuteQueryCtx(context.Background(), e.connID, sql, nil, nil, "")
	if err != nil {
		return err
	}
	if res.Error != "" {
		return errors.New(res.Error)
	}
	return nil
}

func TestRealGatePostgreSQL(t *testing.T) {
	target := realGateTargetFor(t, "postgresql", "IDBLINK_TX_SMOKE_PG", "IDBLINK_TX_PG",
		"127.0.0.1:15432", "testuser", "testpassword", "testdb")
	env := newRealGateEnv(t, target)

	// 临时对象都带 mcp_gate 前缀。开头和结束各清一次：上次失败的运行（尤其是门禁真坏了的
	// 那种）留下的对象会让这次的 CREATE 报「已存在」，数据库报错同样是 isError
	const tbl, log, schema = "mcp_gate_rows", "mcp_gate_updates_log", "mcp_gate_s"
	cleanup := func() {
		_ = env.run("DROP SCHEMA IF EXISTS " + schema + " CASCADE")
		_ = env.run("DROP TABLE IF EXISTS " + tbl + "; DROP TABLE IF EXISTS " + log + "; DROP TABLE IF EXISTS mcp_gate_copy")
		for _, fn := range []string{
			"mcp_gate_fn(int,int)", "mcp_gate_fn2(int)", "mcp_gate_fn3()",
			"mcp_gate_fn9()", // mustReject 的那条：门禁真坏了时它会被建出来
			"public.mcp_gate_dup()",
		} {
			_ = env.run("DROP FUNCTION IF EXISTS " + fn)
		}
		_ = env.run("DROP PROCEDURE IF EXISTS mcp_gate_p(int); DROP PROCEDURE IF EXISTS mcp_gate_double(int)")
		_ = env.run("DROP ROLE IF EXISTS mcp_gate_ro")
	}
	cleanup()
	t.Cleanup(cleanup)
	const create = "CREATE TABLE " + tbl + " (id int PRIMARY KEY, note text)"
	const seed = "INSERT INTO " + tbl + " (id, note) VALUES (1, 'a'), (2, 'b')"
	fingerprint := func() string {
		reply, body := env.tool("execute_query", map[string]any{
			"sql": "SELECT string_agg(id::text || ':' || note, ',' ORDER BY id) AS f FROM " + tbl,
		})
		require.False(t, reply.IsError, "fingerprint: %s", reply.text())
		return fmt.Sprint(body.Rows[0][0])
	}
	reseed := func() {
		require.NoError(t, env.run("TRUNCATE "+tbl))
		require.NoError(t, env.run(seed))
	}
	require.NoError(t, env.run("DROP TABLE IF EXISTS "+tbl+"; DROP TABLE IF EXISTS "+log+"; CREATE TABLE "+log+" (id int)"))
	require.NoError(t, env.run(create))
	require.NoError(t, env.run(seed))

	// 表被删掉后取不了指纹，用 to_regclass 看它还在不在
	tableExists := func() bool {
		reply, body := env.tool("execute_query", map[string]any{
			"sql": "SELECT to_regclass('mcp_gate_rows') IS NOT NULL AS e",
		})
		require.False(t, reply.IsError, "to_regclass: %s", reply.text())
		return fmt.Sprint(body.Rows[0][0]) == "true"
	}

	// ---- 1. 门禁拦的是真东西：这些文本直接发给 PG，藏在「字符串」里的写会执行 ----
	// （lib/pq 不带参数时走简单协议，一次执行整段）
	smuggled := []string{
		`SELECT '\'; DROP TABLE ` + tbl + `; SELECT ''`,
		`SELECT $$a'b$$; DROP TABLE ` + tbl + `; SELECT $$c'd$$`,
	}
	for _, sql := range smuggled {
		env.mustReject("execute_query", sql)
		require.True(t, tableExists(), "precondition: the table exists before %q is sent", sql)
		require.NoError(t, env.run(sql), "sent directly, %q is expected to run", sql)
		require.False(t, tableExists(), "sent directly, %q must have dropped the table", sql)
		require.NoError(t, env.run(create))
		require.NoError(t, env.run(seed))
	}
	// E'…' 里的 \' 是转义引号，字符串只会更长：夹在里面的 DROP 成了字符串内容，PG 不执行。
	// 这类文本不构成走私通道，词法上要保证的是不误拒
	env.mustQuery(`SELECT E'it\'s; DROP TABLE `+tbl+`; --' AS s`, "it's; DROP TABLE "+tbl+"; --")
	require.Equal(t, "1:a,2:b", fingerprint())
	for _, sql := range []string{
		"EXPLAIN ANALYZE DELETE FROM " + tbl,
		"WITH d AS (DELETE FROM " + tbl + " RETURNING *) SELECT * FROM d",
		"WITH c AS (SELECT 1 AS id) UPDATE " + tbl + " SET note = 'x' FROM c WHERE " + tbl + ".id = c.id",
	} {
		env.mustReject("execute_query", sql)
		require.NoError(t, env.run(sql), "sent directly, %q is expected to run", sql)
		require.NotEqual(t, "1:a,2:b", fingerprint(), "sent directly, %q must have changed the data", sql)
		reseed()
	}
	env.mustReject("execute_query", "SELECT * INTO mcp_gate_copy FROM "+tbl)
	require.NoError(t, env.run("SELECT * INTO mcp_gate_copy FROM "+tbl), "sent directly, SELECT INTO creates a table")
	env.mustQuery("SELECT count(*) AS n FROM mcp_gate_copy", "2")

	// ---- 2. 放行的只读语句在真库上跑得通、结果对 ----
	legit := map[string]any{
		`SELECT 'C:\temp' AS s`:           `C:\temp`,
		`SELECT 'C:\temp\' AS s`:          `C:\temp\`,
		`SELECT $$it's;a;b$$ AS s`:        `it's;a;b`,
		`SELECT $tag$ a'b $tag$ AS s`:     ` a'b `,
		`SELECT E'it\'s' AS s`:            `it's`,
		`SELECT 'it''s' AS s`:             `it's`,
		`SELECT 1 /* a /* b */ c */ AS n`: "1",
		// 外层注释把内层的 */ 之后的 ; DROP … 也吞掉了，整条仍是一条 SELECT
		"SELECT 1 /* a /* b */ ; DROP TABLE " + tbl + " */ AS n":                     "1",
		`SELECT 'into the void' AS s`:                                                "into the void",
		`SELECT '$$; DROP TABLE mcp_gate_rows; --' AS s`:                             `$$; DROP TABLE mcp_gate_rows; --`,
		`SELECT 'a12b' ~ '^\w+b$' AS m`:                                              "true",
		`SELECT foo$tag$ FROM (SELECT 1 AS foo$tag$) s`:                              "1",
		`SELECT 1; -- done`:                                                          "1",
		`WITH d AS (SELECT * FROM mcp_gate_updates_log) SELECT count(*) AS n FROM d`: "0",
	}
	for sql, want := range legit {
		env.mustQuery(sql, want)
	}
	// EXPLAIN 不带 ANALYZE 只出计划
	reply, plan := env.tool("execute_query", map[string]any{"sql": "EXPLAIN DELETE FROM " + tbl})
	require.False(t, reply.IsError, "EXPLAIN DELETE: %s", reply.text())
	require.NotEmpty(t, plan.Rows)
	require.Equal(t, "1:a,2:b", fingerprint(), "read-only statements must not change the data")

	// ---- 3. WITH … DML 归 execute_update ----
	body := env.mustRun("execute_update", "WITH c AS (SELECT 1 AS id) UPDATE "+tbl+" SET note = 'u' FROM c WHERE "+tbl+".id = c.id")
	require.NotNil(t, body.RowsAffected)
	require.EqualValues(t, 1, *body.RowsAffected)
	body = env.mustRun("execute_update", "WITH c AS (SELECT 2 AS id) DELETE FROM "+tbl+" USING c WHERE "+tbl+".id = c.id")
	require.NotNil(t, body.RowsAffected)
	require.EqualValues(t, 1, *body.RowsAffected)
	// 之后 1 号行改成了 u、2 号行删掉了，下面几处拿它当「数据没被动过」的基准
	const afterDML = "1:u"
	require.Equal(t, afterDML, fingerprint())

	// ---- 4. $tag$ 函数体是一条语句 ----
	env.mustRun("execute_ddl", "CREATE FUNCTION mcp_gate_fn(a int, b int) RETURNS int AS $$ BEGIN RETURN a + b; END; $$ LANGUAGE plpgsql")
	env.mustQuery("SELECT mcp_gate_fn(1, 2) AS n", "3")
	env.mustRun("execute_script",
		"CREATE FUNCTION mcp_gate_fn2(a int) RETURNS int AS $body$ SELECT a * 2; $body$ LANGUAGE sql;\n"+
			"CREATE FUNCTION mcp_gate_fn3() RETURNS int AS $$ BEGIN RETURN 7; END; $$ LANGUAGE plpgsql")
	env.mustQuery("SELECT mcp_gate_fn2(3) + mcp_gate_fn3() AS n", "13")
	env.mustReject("execute_ddl", "CREATE FUNCTION mcp_gate_fn9() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; DROP TABLE "+tbl)
	require.Equal(t, afterDML, fingerprint(), "the rejected DDL must not have dropped the table")

	// ---- 5. 函数定义按 schema 取 ----
	env.mustRun("execute_ddl", "CREATE SCHEMA "+schema)
	env.mustRun("execute_script",
		"CREATE FUNCTION "+schema+".mcp_gate_dup() RETURNS text AS $$ SELECT 's' $$ LANGUAGE sql;\n"+
			"CREATE FUNCTION public.mcp_gate_dup() RETURNS text AS $$ SELECT 'p' $$ LANGUAGE sql")
	reply, _ = env.tool("get_function_body", map[string]any{"function_name": "mcp_gate_dup", "schema": schema})
	require.False(t, reply.IsError, "get_function_body by schema: %s", reply.text())
	require.Contains(t, reply.text(), schema+".mcp_gate_dup")
	reply, _ = env.tool("get_function_body", map[string]any{"function_name": "mcp_gate_dup"})
	require.False(t, reply.IsError, "get_function_body without schema: %s", reply.text())
	require.Contains(t, reply.text(), "public.mcp_gate_dup")
	reply, _ = env.tool("get_function_body", map[string]any{"function_name": "mcp_gate_no_such_fn"})
	require.True(t, reply.IsError, "a missing function must be reported as not found: %s", reply.text())

	// ---- 6. explain_query ----
	reply, plan = env.tool("explain_query", map[string]any{"sql": "SELECT * FROM " + tbl})
	require.False(t, reply.IsError, "explain_query: %s", reply.text())
	require.Contains(t, reply.text(), `"explain_sql":"EXPLAIN SELECT * FROM mcp_gate_rows"`)
	require.NotEmpty(t, plan.Rows)
	env.mustReject("explain_query", "ANALYZE DELETE FROM "+tbl)
	require.Equal(t, afterDML, fingerprint())

	// ---- 6b. 过程调用、授权、对象注释 ----
	env.mustRun("execute_ddl", "CREATE PROCEDURE mcp_gate_p(n int) LANGUAGE sql AS $$ INSERT INTO "+tbl+" (id, note) VALUES (n, 'p') $$")
	env.mustRun("execute_procedure", "CALL mcp_gate_p(50)")
	env.mustQuery("SELECT note FROM "+tbl+" WHERE id = 50", "p")
	// INOUT 参数作为一行结果返回
	env.mustRun("execute_ddl", "CREATE PROCEDURE mcp_gate_double(INOUT x int) LANGUAGE sql AS $$ SELECT x * 2 $$")
	body = env.mustRun("execute_procedure", "CALL mcp_gate_double(21)")
	require.Len(t, body.Rows, 1, "CALL with an INOUT parameter returns a row")
	require.Equal(t, "42", fmt.Sprint(body.Rows[0][0]))
	// DO 匿名块：函数体在 $tag$ 里，是一条语句
	env.mustRun("execute_procedure", "DO $$ BEGIN INSERT INTO "+tbl+" (id, note) VALUES (51, 'do'); END $$")
	env.mustQuery("SELECT note FROM "+tbl+" WHERE id = 51", "do")
	env.mustReject("execute_procedure", "CALL mcp_gate_p(52); DROP TABLE "+tbl)
	// 授权、回收、对象注释
	env.mustRun("execute_ddl", "COMMENT ON TABLE "+tbl+" IS 'gate table'")
	env.mustQuery("SELECT obj_description('mcp_gate_rows'::regclass) AS c", "gate table")
	require.NoError(t, env.run("DROP ROLE IF EXISTS mcp_gate_ro; CREATE ROLE mcp_gate_ro"))
	env.mustRun("execute_ddl", "GRANT SELECT ON TABLE "+tbl+" TO mcp_gate_ro")
	env.mustQuery("SELECT has_table_privilege('mcp_gate_ro', 'mcp_gate_rows', 'SELECT') AS g", "true")
	env.mustRun("execute_ddl", "REVOKE SELECT ON TABLE "+tbl+" FROM mcp_gate_ro")
	env.mustQuery("SELECT has_table_privilege('mcp_gate_ro', 'mcp_gate_rows', 'SELECT') AS g", "false")

	// ---- 7. timeout_seconds 到期会打断语句，连接照常可用 ----
	start := time.Now()
	reply, _ = env.tool("execute_query", map[string]any{"sql": "SELECT pg_sleep(3)", "timeout_seconds": 1})
	require.True(t, reply.IsError, "a statement past its timeout must fail: %s", reply.text())
	require.Less(t, time.Since(start), 3*time.Second, "the statement must be interrupted, not waited out")
	env.mustQuery("SELECT 1 AS n", "1")
}

func TestRealGateMySQL(t *testing.T) {
	target := realGateTargetFor(t, "mysql", "IDBLINK_TX_SMOKE_MYSQL", "IDBLINK_TX_MYSQL",
		"127.0.0.1:13306", "testuser", "testpass", "testdb")
	env := newRealGateEnv(t, target)

	const tbl = "mcp_gate_rows"
	// 开头和结束各清一次：上次失败的运行留下的表 / 过程会让这次的 CREATE 报「已存在」，
	// 数据库报错同样是 isError，mustReject 会因为错误的原因通过
	cleanup := func() {
		_ = env.run("DROP TABLE IF EXISTS " + tbl)
		_ = env.run("DROP TABLE IF EXISTS mcp_gate_ticks")
		_ = env.run("DROP PROCEDURE IF EXISTS mcp_gate_p")
		_ = env.run("DROP PROCEDURE IF EXISTS mcp_gate_q")
	}
	cleanup()
	t.Cleanup(cleanup)
	const create = "CREATE TABLE " + tbl + " (id INT PRIMARY KEY, note VARCHAR(100))"
	const seed = "INSERT INTO " + tbl + " (id, note) VALUES (1, 'a'), (2, 'b')"
	// 反引号里的 `a'; DROP TABLE …; SELECT '` 整段是一个列名。真建一张有这一列的表：
	// SELECT 它就是一条普通的查询，夹在里面的 DROP 不会执行
	const ticked = "`a'; DROP TABLE " + tbl + "; SELECT '`"
	fingerprint := func() string {
		reply, body := env.tool("execute_query", map[string]any{
			"sql": "SELECT GROUP_CONCAT(CONCAT(id, ':', note) ORDER BY id) AS f FROM " + tbl,
		})
		require.False(t, reply.IsError, "fingerprint: %s", reply.text())
		return fmt.Sprint(body.Rows[0][0])
	}
	require.NoError(t, env.run("DROP TABLE IF EXISTS "+tbl))
	require.NoError(t, env.run(create))
	require.NoError(t, env.run(seed))
	require.NoError(t, env.run("CREATE TABLE mcp_gate_ticks ("+ticked+" INT)"))
	require.NoError(t, env.run("INSERT INTO mcp_gate_ticks VALUES (7)"))

	// ---- 1. 放行的只读语句在真库上跑得通、结果对 ----
	legit := map[string]any{
		`SELECT 'a\\b' AS s`:                      `a\b`,
		`SELECT 'C:\\Users\\x' AS s`:              `C:\Users\x`,
		"SELECT 'it\\'s' AS s":                    "it's",
		`SELECT 'it''s' AS s`:                     `it's`,
		`SELECT "a;b" AS s`:                       `a;b`,
		"SELECT `a;b` FROM (SELECT 1 AS `a;b`) t": "1",
		"SELECT 1 # ; not code\n+ 1 AS n":         "2",
		"SELECT 1 -- ; not code\n+ 1 AS n":        "2",
		"SELECT 1 --1 + 2 AS n":                   "4",
		`SELECT 'into the void' AS s`:             "into the void",

		"SELECT /*!40000 SQL_NO_CACHE */ id FROM " + tbl + " ORDER BY id LIMIT 1": "1",
		"SELECT " + ticked + " AS v FROM mcp_gate_ticks":                          "7",
	}
	for sql, want := range legit {
		env.mustQuery(sql, want)
	}

	// ---- 2. 门禁拦下的都不执行 ----
	for _, sql := range []string{
		"EXPLAIN ANALYZE DELETE FROM " + tbl,
		"USE information_schema",
		"SELECT * INTO OUTFILE '/tmp/mcp_gate_outfile' FROM " + tbl,
		"SELECT id INTO @v FROM " + tbl + " LIMIT 1",
		"SELECT 1 /*!50000 ; DROP TABLE " + tbl + " */",
		// MySQL 里 --1 是两个减号，不是注释：第二句 DROP 是真的
		"SELECT 1 --1; DROP TABLE " + tbl,
		`SELECT 'a\'; DROP TABLE ` + tbl + `; SELECT ''`,
	} {
		env.mustReject("execute_query", sql)
	}
	require.Equal(t, "1:a,2:b", fingerprint(), "rejected statements must not run")

	// MySQL 驱动没开 multiStatements：藏第二条语句的文本直接发过去会怎样，只记录事实
	t.Logf("sent directly, executable comment: %v", env.run("SELECT 1 /*!50000 ; DROP TABLE "+tbl+" */"))
	t.Logf("sent directly, multi-table EXPLAIN ANALYZE DELETE: %v",
		env.run("EXPLAIN ANALYZE DELETE t FROM "+tbl+" t JOIN (SELECT 3 AS id) c ON t.id = c.id"))
	require.Equal(t, "1:a,2:b", fingerprint(), "the probe statements above must leave the table intact")

	// ---- 3. WITH … DML 归 execute_update（MySQL 8 的 CTE） ----
	// MySQL 只允许 WITH 开头的 UPDATE / DELETE；带 CTE 的 INSERT 得写成 INSERT … WITH … SELECT
	body := env.mustRun("execute_update", "WITH c AS (SELECT 1 AS id) UPDATE "+tbl+", c SET "+tbl+".note = 'u' WHERE "+tbl+".id = c.id")
	require.NotNil(t, body.RowsAffected)
	require.EqualValues(t, 1, *body.RowsAffected)
	body = env.mustRun("execute_update", "WITH c AS (SELECT 2 AS id) DELETE FROM "+tbl+" WHERE id IN (SELECT id FROM c)")
	require.NotNil(t, body.RowsAffected)
	require.EqualValues(t, 1, *body.RowsAffected)
	body = env.mustRun("execute_update", "INSERT INTO "+tbl+" (id, note) WITH c AS (SELECT 3 AS id, 'w' AS note) SELECT * FROM c")
	require.NotNil(t, body.RowsAffected)
	require.EqualValues(t, 1, *body.RowsAffected)

	// ---- 4. explain_query ----
	reply, plan := env.tool("explain_query", map[string]any{"sql": "SELECT * FROM " + tbl})
	require.False(t, reply.IsError, "explain_query: %s", reply.text())
	require.Contains(t, reply.text(), `"explain_sql":"EXPLAIN SELECT * FROM mcp_gate_rows"`)
	require.NotEmpty(t, plan.Rows)
	env.mustReject("explain_query", "ANALYZE DELETE FROM "+tbl)

	// ---- 4b. 过程调用 ----
	// 函数体里有分号：MySQL 的过程定义没法可靠切分，execute_ddl 不收，这里直接建。
	// 过程带回两个结果集，之后连接必须照常可用
	require.NoError(t, env.run("CREATE PROCEDURE mcp_gate_p(IN n INT) BEGIN INSERT INTO "+tbl+" (id, note) VALUES (n, 'p'); SELECT 1 AS a; SELECT 2 AS b; END"))
	body = env.mustRun("execute_procedure", "CALL mcp_gate_p(50)")
	require.Len(t, body.Rows, 1, "the first result set comes back")
	require.Equal(t, "1", fmt.Sprint(body.Rows[0][0]))
	env.mustQuery("SELECT note FROM "+tbl+" WHERE id = 50", "p")
	env.mustReject("execute_procedure", "CALL mcp_gate_p(51); DROP TABLE "+tbl)
	env.mustReject("execute_ddl", "CREATE PROCEDURE mcp_gate_q() BEGIN SELECT 1; END")

	// ---- 5. timeout_seconds 到期会打断语句，连接照常可用 ----
	start := time.Now()
	reply, _ = env.tool("execute_query", map[string]any{"sql": "SELECT SLEEP(3)", "timeout_seconds": 1})
	require.True(t, reply.IsError, "a statement past its timeout must fail: %s", reply.text())
	require.Less(t, time.Since(start), 3*time.Second, "the statement must be interrupted, not waited out")
	env.mustQuery("SELECT 1 AS n", "1")
}
