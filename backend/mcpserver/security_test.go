package mcpserver

import (
	"strings"
	"testing"
)

// 只读门禁的样本按方言来：同一段文本在不同库里的含义不一样，分类器必须按连接的方言判。
// 「藏语句」样本在 HEAD 上曾经全部被判成只读（扫描器一律把 \ 当转义符、不认 $tag$ / [] / q”）
func TestIsReadOnlyQuery(t *testing.T) {
	const pg = "postgresql"
	tests := []struct {
		name   string
		dbType string
		sql    string
		want   bool
	}{
		// ---- 正例 ----
		{"simple select", "mysql", "SELECT * FROM users", true},
		{"select with semicolon", "mysql", "SELECT * FROM users;", true},
		{"select lowercase", "mysql", "select id, name from users where id = 1", true},
		{"with cte", "mysql", "WITH t AS (SELECT 1) SELECT * FROM t", true},
		{"explain", "mysql", "EXPLAIN SELECT * FROM users", true},
		{"explain format", "mysql", "EXPLAIN FORMAT=JSON SELECT * FROM users", true},
		{"explain dml only plans", pg, "EXPLAIN DELETE FROM users WHERE id = 1", true},
		{"explain options without analyze", pg, "EXPLAIN (FORMAT JSON, COSTS OFF) SELECT * FROM users", true},
		{"show tables", "mysql", "SHOW TABLES", true},
		{"describe", "mysql", "DESCRIBE users", true},
		{"desc", "mysql", "DESC users", true},
		{"show databases", "mysql", "SHOW DATABASES", true},
		{"table keyword", "mysql", "TABLE users", true},
		{"complex select", "mysql", "SELECT u.name, COUNT(*) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.name HAVING COUNT(*) > 5", true},
		{"semicolon inside string literal", "mysql", "SELECT * FROM t WHERE note = 'a;b'", true},
		{"into inside string literal is not SELECT INTO", "mysql", "SELECT * FROM t WHERE note = 'into the void'", true},
		{"comment after trailing semicolon", "mysql", "SELECT 1; -- done", true},
		{"comment prefix", "mysql", "-- 查用户\nSELECT * FROM users", true},
		{"multiple line comments then select", "mysql", "-- note\n-- note2\nSELECT 1", true},
		{"block comment then select", "mysql", "/* header */ SELECT * FROM users", true},
		{"multiline block comment", "mysql", "/*\n * header\n */\nSELECT 1", true},
		{"comment inside select", "mysql", "SELECT * -- trailing comment\nFROM users", true},
		{"block comment inside select", "mysql", "SELECT /* cols */ * FROM users", true},
		{"dashes in string literal not comment", "mysql", "SELECT * FROM t WHERE c = 'a--b' AND d = '/*x*/'", true},
		{"comment hides semicolon", "mysql", "SELECT 1 -- ; DROP\nFROM t", true},
		{"block comment hides semicolon", "mysql", "SELECT 1 /* ; */ FROM t", true},
		{"mysql hash comment", "mysql", "SELECT 1 # ; not code\nFROM t", true},
		{"mysql executable comment is sql", "mysql", "SELECT /*!40000 SQL_NO_CACHE */ * FROM t", true},
		{"mysql doubled quote and backslash", "mysql", `SELECT * FROM t WHERE a = 'it''s' AND b = 'C:\\Users'`, true},
		// PG：普通字符串里 \ 是普通字符，$tag$ 是字符串，E'…' 里 \ 才是转义
		{"pg backslash in standard string", pg, `SELECT * FROM t WHERE path ~ '^\d+$'`, true},
		{"pg dollar-quoted string", pg, `SELECT $$a'b;c$$ FROM t`, true},
		{"pg tagged dollar string", pg, `SELECT $tag$ a'b $tag$ FROM t`, true},
		{"pg escape string", pg, `SELECT E'it\'s' FROM t`, true},
		{"pg escape string with space", pg, `SELECT E 'it\'s' FROM t`, true},
		{"pg nested block comment", pg, "SELECT /* a /* b */ c */ 1", true},
		{"pg cte over table named like a verb", pg, "WITH d AS (SELECT * FROM updates_log) SELECT * FROM d", true},
		{"pg identifier containing dollar", pg, "SELECT foo$tag$ FROM t", true},
		{"pg positional parameter", pg, "SELECT $1, $2$", true},
		// SQLite：只读形式的 PRAGMA
		{"pragma table_info", "sqlite", "PRAGMA table_info(users)", true},
		{"pragma with schema and argument", "sqlite", "PRAGMA main.table_info('users')", true},
		{"pragma read bare", "sqlite", "PRAGMA user_version", true},
		{"pragma schema qualified read", "sqlite", "PRAGMA main.journal_mode", true},
		{"pragma integrity check", "sqlite", "PRAGMA integrity_check", true},
		{"sqlite backslash is literal", "sqlite", `SELECT * FROM t WHERE path = 'C:\temp'`, true},
		// SQL Server：[ident] 是标识符，里面的引号不是字符串
		{"sqlserver bracket identifier", "sqlserver", "SELECT [x'y] FROM t", true},
		{"sqlserver bracket with escaped bracket", "sqlserver", "SELECT [x]]y] FROM t", true},
		// 未知方言：没有反斜杠就照常判
		{"unknown dialect plain", "", "SELECT * FROM t WHERE a = 'b'", true},

		// ---- 反例：藏语句 ----
		{"pg trailing backslash hides statements", pg, `SELECT '\'; DROP TABLE t; SELECT ''`, false},
		{"pg dollar string hides statements", pg, `SELECT $$a'b$$; DROP TABLE t; SELECT $$c'd$$`, false},
		{"pg escape string hides statements", pg, `SELECT E'\'; DROP TABLE t; SELECT E'x'`, false},
		{"pg dollar tag glued to identifier is not a string", pg, `SELECT foo$tag$; DROP TABLE t; SELECT foo$tag$`, false},
		{"sqlserver bracket hides statements", "sqlserver", `SELECT [x']; DROP TABLE t; SELECT 'y' FROM a`, false},
		{"sqlserver escaped bracket does not hide statements", "sqlserver", `SELECT [x]]; DROP TABLE t; SELECT 'y' FROM a`, false},
		{"oracle q quote unsupported", "oracle", `SELECT q'[a'b]'; DROP TABLE t; SELECT '' FROM dual`, false},
		{"dameng q quote unsupported even when harmless", "dameng", `SELECT q'[; not code]' FROM dual`, false},
		{"mysql backslash quote leaves string unterminated", "mysql", `SELECT 'a\'; DROP TABLE t; SELECT ''`, false},
		{"mysql executable comment cannot hide a semicolon", "mysql", "SELECT 1 /*!50000 ; DROP TABLE t */", false},
		{"sqlite backslash is literal so the semicolons are real", "sqlite", `SELECT '\'; DROP TABLE t; SELECT ''`, false},
		{"unknown dialect with backslash cannot be judged", "", `SELECT 'a\b'`, false},

		// ---- 反例：只读工具里的写操作 ----
		{"explain analyze executes", pg, "EXPLAIN ANALYZE DELETE FROM orders", false},
		{"explain analyse executes", pg, "EXPLAIN ANALYSE SELECT * FROM orders", false},
		{"explain analyze in options", pg, "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders", false},
		{"mysql explain analyze executes", "mysql", "EXPLAIN ANALYZE SELECT * FROM orders", false},
		{"data modifying cte delete", pg, "WITH d AS (DELETE FROM orders RETURNING *) SELECT * FROM d", false},
		{"data modifying cte insert", pg, "WITH d AS (INSERT INTO orders(id) VALUES (1) RETURNING *) SELECT * FROM d", false},
		{"with update", pg, "WITH s AS (SELECT 1 AS id) UPDATE t SET x = 1 FROM s WHERE t.id = s.id", false},
		{"with delete", pg, "WITH s AS (SELECT 1 AS id) DELETE FROM t USING s WHERE t.id = s.id", false},
		{"sqlite with update", "sqlite", "WITH s AS (SELECT 1 AS id) UPDATE t SET x = 1 FROM s WHERE t.id = s.id", false},
		{"pragma assignment", "sqlite", "PRAGMA user_version = 7", false},
		{"pragma assignment without spaces", "sqlite", "PRAGMA foreign_keys=ON", false},
		{"pragma assignment of journal mode", "sqlite", "PRAGMA journal_mode = WAL", false},
		{"pragma parenthesized assignment", "sqlite", "PRAGMA journal_mode(WAL)", false},
		{"pragma query form with assignment", "sqlite", "PRAGMA table_info = 1", false},
		{"pragma wal checkpoint acts", "sqlite", "PRAGMA wal_checkpoint", false},
		{"pragma optimize acts", "sqlite", "PRAGMA optimize", false},
		{"use changes a pooled connection", "mysql", "USE mydb", false},

		// ---- 反例：多语句、没闭合 ----
		{"insert", "mysql", "INSERT INTO users VALUES (1)", false},
		{"update", "mysql", "UPDATE users SET name = 'a'", false},
		{"delete", "mysql", "DELETE FROM users WHERE id = 1", false},
		{"replace into", "mysql", "REPLACE INTO users (id) VALUES (1)", false},
		{"drop", "mysql", "DROP TABLE users", false},
		{"create", "mysql", "CREATE TABLE t (id INT)", false},
		{"truncate", "mysql", "TRUNCATE TABLE users", false},
		{"alter", "mysql", "ALTER TABLE users ADD COLUMN x INT", false},
		{"select into", "mysql", "SELECT * INTO outfile FROM users", false},
		{"select into var", "mysql", "SELECT id INTO @var FROM users", false},
		{"pg select into new table", pg, "SELECT * INTO orders_copy FROM orders", false},
		{"multiple statements", "mysql", "SELECT 1; DROP TABLE users;", false},
		{"semicolon in middle", "mysql", "SELECT 1; SELECT 2", false},
		{"double trailing semicolon", "mysql", "SELECT 1;;", false},
		{"empty", "mysql", "", false},
		{"call procedure", "mysql", "CALL my_proc()", false},
		{"comment hides drop is still rejected", "mysql", "/* SELECT */ DROP TABLE users", false},
		{"comment only", "mysql", "-- just a comment\n", false},
		{"unterminated string", "mysql", "SELECT 'abc", false},
		{"unterminated block comment", "mysql", "SELECT 1 /* abc", false},
		{"unterminated dollar string", pg, "SELECT $$abc", false},
		{"unterminated bracket identifier", "sqlserver", "SELECT [abc", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsReadOnlyQuery(tt.dbType, tt.sql); got != tt.want {
				t.Errorf("IsReadOnlyQuery(%q, %q) = %v, want %v", tt.dbType, tt.sql, got, tt.want)
			}
		})
	}
}

// 藏进只读工具的样本，换个写工具也进不去：三个分类器必须一起拒绝
func TestSmuggledStatementsRejectedByEveryTool(t *testing.T) {
	samples := []struct{ dbType, sql string }{
		{"postgresql", `SELECT '\'; DROP TABLE t; SELECT ''`},
		{"postgresql", `SELECT $$a'b$$; DROP TABLE t; SELECT $$c'd$$`},
		{"postgresql", `SELECT E'\'; DROP TABLE t; SELECT E'x'`},
		{"sqlserver", `SELECT [x']; DROP TABLE t; SELECT 'y' FROM a`},
		{"oracle", `SELECT q'[a'b]'; DROP TABLE t; SELECT '' FROM dual`},
		{"mysql", "SELECT 1 /*!50000 ; DROP TABLE t */"},
	}
	for _, s := range samples {
		if IsReadOnlyQuery(s.dbType, s.sql) || IsDMLStatement(s.dbType, s.sql) || IsDDLStatement(s.dbType, s.sql) {
			t.Errorf("%s: %q must be rejected by all three classifiers", s.dbType, s.sql)
		}
		if stmts, ok := splitSQLStatements(s.dbType, s.sql); ok && classifyScript(s.dbType, stmts) != scriptRejected {
			t.Errorf("%s: %q must be rejected as a script too", s.dbType, s.sql)
		}
	}
}

func TestIsDMLStatement(t *testing.T) {
	const pg = "postgresql"
	tests := []struct {
		name   string
		dbType string
		sql    string
		want   bool
	}{
		// 正例
		{"insert", "mysql", "INSERT INTO users VALUES (1)", true},
		{"insert into select", "mysql", "INSERT INTO t SELECT * FROM t2", true},
		{"update", "mysql", "UPDATE users SET name = 'a' WHERE id = 1", true},
		{"delete", "mysql", "DELETE FROM users WHERE id = 1", true},
		{"merge", pg, "MERGE INTO target USING source ON (t.id = s.id) WHEN MATCHED THEN DO NOTHING", true},
		{"replace into", "mysql", "REPLACE INTO users (id, name) VALUES (1, 'a')", true},
		{"semicolon inside string literal", "mysql", "INSERT INTO t VALUES (1, 'a;b')", true},
		{"lowercase", "mysql", "insert into users values (1)", true},
		{"lowercase replace", "mysql", "replace into t values (1)", true},
		{"insert trailing semicolon ok", "mysql", "INSERT INTO t VALUES(1);", true},
		{"comment then insert", "mysql", "-- insert more\nINSERT INTO t VALUES(1)", true},
		{"block comment then insert", "mysql", "/* x */ INSERT INTO t VALUES(1)", true},
		// WITH … DML：主语句是数据修改，归 execute_update
		{"with insert", pg, "WITH t AS (SELECT 1) INSERT INTO t2 SELECT * FROM t", true},
		{"with update", pg, "WITH c AS (SELECT id FROM s) UPDATE t SET x = 1 FROM c WHERE t.id = c.id", true},
		{"with delete", pg, "WITH c AS (SELECT id FROM s) DELETE FROM t USING c WHERE t.id = c.id", true},
		{"with recursive and column list", pg, "WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n < 10) UPDATE t SET x = c.n FROM c", true},
		{"with not materialized", pg, "WITH c AS NOT MATERIALIZED (SELECT id FROM s) DELETE FROM t USING c WHERE t.id = c.id", true},
		{"with several ctes", pg, "WITH a AS (SELECT 1 AS id), b AS (SELECT 2 AS id) UPDATE t SET x = 1 FROM b", true},
		{"sqlite with update", "sqlite", "WITH c AS (SELECT 1 AS id) UPDATE t SET x = 1 FROM c", true},

		// 反例
		{"select", "mysql", "SELECT * FROM users", false},
		{"drop", "mysql", "DROP TABLE users", false},
		{"create", "mysql", "CREATE TABLE t (id INT)", false},
		{"alter", "mysql", "ALTER TABLE users ADD COLUMN x INT", false},
		{"truncate", "mysql", "TRUNCATE TABLE users", false},
		{"with select is not dml", pg, "WITH t AS (SELECT 1) SELECT * FROM t", false},
		{"with main statement not dml", pg, "WITH t AS (SELECT 1) GRANT SELECT ON t TO u", false},
		{"cte not closed", pg, "WITH t AS (SELECT 1 UPDATE t SET x = 1", false},
		{"with update then drop", pg, "WITH c AS (SELECT 1) UPDATE t SET x = 1; DROP TABLE t", false},
		{"empty", "mysql", "", false},
		{"call", "mysql", "CALL my_proc()", false},
		// 安全：多语句注入防护
		{"insert with drop", "mysql", "INSERT INTO t VALUES(1); DROP TABLE users; --", false},
		{"insert with select", "mysql", "INSERT INTO t VALUES(1); SELECT * FROM users", false},
		{"pg insert with drop hidden in dollar string", pg, "INSERT INTO t VALUES ($$a$$); DROP TABLE users; SELECT $$b$$", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsDMLStatement(tt.dbType, tt.sql); got != tt.want {
				t.Errorf("IsDMLStatement(%q, %q) = %v, want %v", tt.dbType, tt.sql, got, tt.want)
			}
		})
	}
}

func TestIsDDLStatement(t *testing.T) {
	const pg = "postgresql"
	const fn = `CREATE FUNCTION add(a int, b int) RETURNS int AS $$ BEGIN RETURN a + b; END; $$ LANGUAGE plpgsql;`
	tests := []struct {
		name   string
		dbType string
		sql    string
		want   bool
	}{
		{"create", "mysql", "CREATE TABLE t (id INT)", true},
		{"drop", "mysql", "DROP TABLE users", true},
		{"alter", "mysql", "ALTER TABLE users ADD x INT", true},
		{"truncate", "mysql", "TRUNCATE TABLE users", true},
		{"rename", "mysql", "RENAME TABLE a TO b", true},
		{"comment then create", "mysql", "-- init\nCREATE TABLE t (id INT)", true},
		{"create trailing semicolon ok", "mysql", "CREATE TABLE t (id INT);", true},
		{"create with string default containing semicolon", "mysql", "CREATE TABLE t (note VARCHAR(10) DEFAULT 'a;b')", true},
		{"simple function without inner semicolons", "mysql", "CREATE FUNCTION f() RETURNS int DETERMINISTIC RETURN 1;", true},
		// PG 系：$tag$ 里的分号不是语句分隔符，函数体是一条语句
		{"pg function body in dollar quotes", pg, fn, true},
		{"pg function body in dollar quotes on kingbase", "kingbase", fn, true},
		{"pg tagged dollar body", pg, "CREATE FUNCTION f() RETURNS int AS $body$ SELECT 1; $body$ LANGUAGE sql", true},
		{"pg function body then drop is still multi", pg, fn + " DROP TABLE t;", false},
		{"pg function body unterminated dollar quote", pg, "CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1;", false},
		// 其余方言的函数体没法可靠切分：分号照旧按分隔符数，拒绝
		{"mysql body with semicolons is rejected", "mysql", "CREATE PROCEDURE p() BEGIN INSERT INTO t VALUES (1); UPDATE t SET a = 2; END", false},
		{"create then drop rejected", "mysql", "CREATE TABLE a (id INT); DROP TABLE users;", false},
		{"create then drop with comment rejected", "mysql", "CREATE TABLE a (id INT); DROP TABLE users; --", false},
		{"semicolon in middle rejected", "mysql", "CREATE TABLE a (id INT); CREATE INDEX i ON a(id)", false},
		{"select", "mysql", "SELECT * FROM users", false},
		{"insert", "mysql", "INSERT INTO users VALUES (1)", false},
		{"empty", "mysql", "", false},
		// 授权和对象注释与 DDL 同级：改结构、不改数据
		{"grant", "postgresql", "GRANT SELECT, INSERT ON TABLE orders TO analyst", true},
		{"revoke", "postgresql", "REVOKE DELETE ON orders FROM PUBLIC", true},
		{"grant on mysql", "mysql", "GRANT SELECT ON app.orders TO 'ro'@'%'", true},
		{"comment on table", "postgresql", "COMMENT ON TABLE orders IS '销售订单'", true},
		{"comment on function", "postgresql", "COMMENT ON FUNCTION add(int, int) IS 'a + b'", true},
		{"grant with semicolon in string", "postgresql", "COMMENT ON TABLE t IS 'a;b'", true},
		{"grant then drop is multi", "postgresql", "GRANT SELECT ON orders TO analyst; DROP TABLE orders", false},
		{"deny is not in the list", "sqlserver", "DENY SELECT ON orders TO analyst", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsDDLStatement(tt.dbType, tt.sql); got != tt.want {
				t.Errorf("IsDDLStatement(%q, %q) = %v, want %v", tt.dbType, tt.sql, got, tt.want)
			}
		})
	}
}

// explain_query 标了 readOnlyHint：拿去生成计划的语句必须真有计划、且不能是 ANALYZE
func TestExplainTarget(t *testing.T) {
	const pg = "postgresql"
	tests := []struct {
		name     string
		dbType   string
		sql      string
		wantText string
		wantOK   bool
	}{
		{"select", pg, "SELECT * FROM t", "SELECT * FROM t", true},
		{"comments and semicolon removed", pg, "-- hint\nSELECT 1 ;", "SELECT 1", true},
		{"dml is only planned", pg, "DELETE FROM t WHERE id = 1", "DELETE FROM t WHERE id = 1", true},
		{"with dml", pg, "WITH c AS (SELECT 1) UPDATE t SET x = 1 FROM c", "WITH c AS (SELECT 1) UPDATE t SET x = 1 FROM c", true},
		{"string with semicolon kept", pg, "SELECT 'a;b'", "SELECT 'a;b'", true},
		{"analyze delete", pg, "ANALYZE DELETE FROM orders", "", false},
		{"analyse select", pg, "ANALYSE SELECT 1", "", false},
		{"already explain", pg, "EXPLAIN ANALYZE SELECT 1", "", false},
		{"multiple statements", pg, "SELECT 1; DROP TABLE t", "", false},
		{"drop has no plan", pg, "DROP TABLE t", "", false},
		{"grant has no plan", pg, "GRANT SELECT ON t TO u", "", false},
		{"empty", pg, "", "", false},
		{"unterminated string", pg, "SELECT 'a", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotText, gotOK := explainTarget(tt.dbType, tt.sql)
			if gotOK != tt.wantOK || gotText != tt.wantText {
				t.Errorf("explainTarget(%q) = (%q, %v), want (%q, %v)", tt.sql, gotText, gotOK, tt.wantText, tt.wantOK)
			}
		})
	}
}

// 过程调用归 execute_procedure：CALL / EXEC / EXECUTE，PG 系另有 DO
func TestIsProcedureCall(t *testing.T) {
	const pg = "postgresql"
	tests := []struct {
		name   string
		dbType string
		sql    string
		want   bool
	}{
		{"mysql call", "mysql", "CALL calc_totals(2024)", true},
		{"pg call", pg, "CALL public.calc_totals(2024)", true},
		{"oracle call", "oracle", "CALL calc_totals(2024)", true},
		{"semicolon inside a string argument", "mysql", "CALL log_note('a;b')", true},
		{"sqlserver exec", "sqlserver", "EXEC dbo.calc_totals @year = 2024", true},
		{"sqlserver execute", "sqlserver", "EXECUTE calc_totals 2024", true},
		{"pg anonymous block", pg, "DO $$ BEGIN RAISE NOTICE 'hi'; INSERT INTO t VALUES (1); END $$", true},
		{"pg tagged anonymous block", pg, "DO $body$ BEGIN UPDATE t SET a = 1; END $body$", true},
		{"pg do with string body", pg, "DO 'BEGIN RAISE NOTICE ''hi''; END'", true},

		{"call then drop is multi", "mysql", "CALL calc_totals(2024); DROP TABLE orders", false},
		{"call with drop hidden in dollar string", pg, "CALL p(); DROP TABLE users; SELECT $$x$$", false},
		{"anonymous plsql block not supported", "oracle", "BEGIN calc_totals(2024); END;", false},
		{"anonymous tsql batch not supported", "sqlserver", "BEGIN EXEC calc_totals; END", false},
		{"mysql do is not a block", "mysql", "DO SLEEP(5)", false},
		{"select is not a call", "mysql", "SELECT 1", false},
		{"empty", "mysql", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsProcedureCall(tt.dbType, tt.sql); got != tt.want {
				t.Errorf("IsProcedureCall(%q, %q) = %v, want %v", tt.dbType, tt.sql, got, tt.want)
			}
		})
	}
}

// 词法视图本身：注释两份都抹，字面量只抹 code（执行时要原文），长度都与原文一致
func TestLexSQLView(t *testing.T) {
	const sql = "SELECT 'a;b' -- note\nFROM `x;y`"
	v := lexSQL("mysql", sql)
	if !v.ok {
		t.Fatal("expected ok")
	}
	if code, want := strings.Join(strings.Fields(v.code), " "), "SELECT FROM"; code != want {
		t.Errorf("code = %q, want %q", code, want)
	}
	if text, want := strings.Join(strings.Fields(v.noComments), " "), "SELECT 'a;b' FROM `x;y`"; text != want {
		t.Errorf("noComments = %q, want %q", text, want)
	}
	if len([]rune(v.code)) != len([]rune(sql)) || len([]rune(v.noComments)) != len([]rune(sql)) {
		t.Errorf("views must keep the original length: code=%d noComments=%d want=%d",
			len([]rune(v.code)), len([]rune(v.noComments)), len([]rune(sql)))
	}
}

func TestToolNamesMatchRegistration(t *testing.T) {
	names := ToolNames()
	if len(names) == 0 {
		t.Fatal("no tools registered")
	}
	seen := map[string]bool{}
	for _, n := range names {
		if seen[n] {
			t.Errorf("tool %q registered twice", n)
		}
		seen[n] = true
	}
	for _, want := range []string{"execute_query", "execute_update", "execute_ddl", "execute_script", "execute_procedure",
		"list_processes", "kill_process", "explain_query", "begin_transaction"} {
		if !seen[want] {
			t.Errorf("tool %q missing from ToolNames()", want)
		}
	}
}
