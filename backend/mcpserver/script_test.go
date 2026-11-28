package mcpserver

import (
	"reflect"
	"testing"
)

func TestSplitSQLStatements(t *testing.T) {
	cases := []struct {
		name string
		sql  string
		want []string
	}{
		{"single", "SELECT 1", []string{"SELECT 1"}},
		{"trailing semicolon", "SELECT 1;", []string{"SELECT 1"}},
		{"two statements", "SELECT 1; SELECT 2", []string{"SELECT 1", "SELECT 2"}},
		{"semicolon in single-quote string", `INSERT INTO t VALUES ('a;b'); SELECT 2`, []string{"INSERT INTO t VALUES ('a;b')", "SELECT 2"}},
		{"semicolon in double-quote string", `SELECT "x;y" FROM t; SELECT 2`, []string{`SELECT "x;y" FROM t`, "SELECT 2"}},
		{"semicolon in backtick identifier", "SELECT `a;b` FROM t; SELECT 2", []string{"SELECT `a;b` FROM t", "SELECT 2"}},
		{"escaped quote keeps scanning", `INSERT INTO t VALUES ('it''s;ok'); SELECT 2`, []string{`INSERT INTO t VALUES ('it''s;ok')`, "SELECT 2"}},
		{"backslash escape in string", `INSERT INTO t VALUES ('a\;b'); SELECT 2`, []string{`INSERT INTO t VALUES ('a\;b')`, "SELECT 2"}},
		{"line comments stripped", "-- c1\nSELECT 1; -- c2\nSELECT 2", []string{"SELECT 1", "SELECT 2"}},
		{"block comment with semicolon", "SELECT 1 /* ; */; SELECT 2", []string{"SELECT 1", "SELECT 2"}},
		{"comment only", "-- nothing\n/* here */", nil},
		{"extra semicolons", ";;;SELECT 1;;SELECT 2;;;", []string{"SELECT 1", "SELECT 2"}},
		{"multiline statement kept", "SELECT a,\n b\nFROM t;\nSELECT 2", []string{"SELECT a,\n b\nFROM t", "SELECT 2"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := splitSQLStatements("mysql", c.sql)
			if !ok {
				t.Fatalf("unexpected lex failure")
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("got %q want %q", got, c.want)
			}
		})
	}
}

// 切分按方言来：PG 的 $tag$ 函数体不会被函数体里的分号切开，认不出的写法整段拒绝
func TestSplitSQLStatementsByDialect(t *testing.T) {
	const fn1 = "CREATE FUNCTION a() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql"
	const fn2 = "CREATE FUNCTION b() RETURNS int AS $body$ SELECT 2; $body$ LANGUAGE sql"

	if got, ok := splitSQLStatements("postgresql", fn1+";\n"+fn2+";"); !ok || !reflect.DeepEqual(got, []string{fn1, fn2}) {
		t.Errorf("postgresql: got %q ok=%v", got, ok)
	}
	if got := classifyScript("postgresql", []string{fn1, fn2}); got != scriptDDL {
		t.Errorf("postgresql function script: want ddl, got %v", got)
	}
	// 同一段文本在 MySQL 上没法可靠切分：分号照切，碎片过不了白名单
	stmts, _ := splitSQLStatements("mysql", fn1+";")
	if got := classifyScript("mysql", stmts); got != scriptRejected {
		t.Errorf("mysql function body: want rejected, got %v", got)
	}
	// PG 普通字符串里的反斜杠不是转义：字符串到下一个引号就结束，后面的分号是真的
	if got, ok := splitSQLStatements("postgresql", `SELECT '\'; DROP TABLE t; SELECT ''`); !ok || len(got) != 3 {
		t.Errorf("postgresql: got %q ok=%v", got, ok)
	}
	// MySQL 上同一段文本的字符串没闭合
	if _, ok := splitSQLStatements("mysql", `SELECT '\'; DROP TABLE t; SELECT ''`); ok {
		t.Error("mysql: unterminated string must not be splittable")
	}
	// Oracle 的 q'[…]' 不解析
	if _, ok := splitSQLStatements("oracle", `SELECT q'[a;b]' FROM dual`); ok {
		t.Error("oracle: q-quoted string must not be splittable")
	}
}

func TestClassifyScript(t *testing.T) {
	t.Run("all read-only", func(t *testing.T) {
		if got := classifyScript("mysql", []string{"SELECT 1", "SHOW TABLES"}); got != scriptReadOnly {
			t.Errorf("want read-only, got %v", got)
		}
	})
	t.Run("all dml", func(t *testing.T) {
		if got := classifyScript("mysql", []string{"INSERT INTO t VALUES (1)", "DELETE FROM t", "UPDATE t SET a=1"}); got != scriptDML {
			t.Errorf("want dml, got %v", got)
		}
	})
	t.Run("all ddl", func(t *testing.T) {
		if got := classifyScript("mysql", []string{"CREATE TABLE a (id INT)", "DROP TABLE b"}); got != scriptDDL {
			t.Errorf("want ddl, got %v", got)
		}
	})
	t.Run("mixed read + dml rejected", func(t *testing.T) {
		if got := classifyScript("mysql", []string{"SELECT 1", "INSERT INTO t VALUES (1)"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("mixed dml + ddl rejected", func(t *testing.T) {
		if got := classifyScript("mysql", []string{"INSERT INTO t VALUES (1)", "DROP TABLE t"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("select then drop hidden as read rejected", func(t *testing.T) {
		// 注释藏 DROP：拆分后是两条语句，SELECT 过只读白名单、DROP 不是只读 → 拒绝
		if got := classifyScript("mysql", []string{"SELECT 1", "DROP TABLE users"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("non-whitelisted statement rejected", func(t *testing.T) {
		if got := classifyScript("mysql", []string{"SET ROLE app_admin"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("all grants are ddl", func(t *testing.T) {
		// 授权 / 注释和 DDL 同级，同一类脚本可以一起跑
		if got := classifyScript("postgresql", []string{"GRANT SELECT ON t TO analyst", "COMMENT ON TABLE t IS 'orders'"}); got != scriptDDL {
			t.Errorf("want ddl, got %v", got)
		}
	})
	t.Run("grant mixed with dml rejected", func(t *testing.T) {
		if got := classifyScript("postgresql", []string{"GRANT SELECT ON t TO analyst", "INSERT INTO t VALUES (1)"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("call rejected", func(t *testing.T) {
		// 过程调用不进脚本：一次一条，走 execute_procedure
		if got := classifyScript("mysql", []string{"CALL p1()", "CALL p2()"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("empty rejected", func(t *testing.T) {
		if got := classifyScript("mysql", nil); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("integrated split and classify", func(t *testing.T) {
		script := "-- seed data\nINSERT INTO t VALUES (1,'a;b'); INSERT INTO t VALUES (2,'c');\nUPDATE t SET a='x' WHERE id=1;"
		stmts, ok := splitSQLStatements("mysql", script)
		if !ok {
			t.Fatal("unexpected lex failure")
		}
		if got := classifyScript("mysql", stmts); got != scriptDML {
			t.Errorf("want dml, got %v", got)
		}
	})
}
