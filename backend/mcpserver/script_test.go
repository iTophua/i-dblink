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
			got := splitSQLStatements(c.sql)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("got %q want %q", got, c.want)
			}
		})
	}
}

func TestClassifyScript(t *testing.T) {
	t.Run("all read-only", func(t *testing.T) {
		if got := classifyScript([]string{"SELECT 1", "SHOW TABLES"}); got != scriptReadOnly {
			t.Errorf("want read-only, got %v", got)
		}
	})
	t.Run("all dml", func(t *testing.T) {
		if got := classifyScript([]string{"INSERT INTO t VALUES (1)", "DELETE FROM t", "UPDATE t SET a=1"}); got != scriptDML {
			t.Errorf("want dml, got %v", got)
		}
	})
	t.Run("all ddl", func(t *testing.T) {
		if got := classifyScript([]string{"CREATE TABLE a (id INT)", "DROP TABLE b"}); got != scriptDDL {
			t.Errorf("want ddl, got %v", got)
		}
	})
	t.Run("mixed read + dml rejected", func(t *testing.T) {
		if got := classifyScript([]string{"SELECT 1", "INSERT INTO t VALUES (1)"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("mixed dml + ddl rejected", func(t *testing.T) {
		if got := classifyScript([]string{"INSERT INTO t VALUES (1)", "DROP TABLE t"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("select then drop hidden as read rejected", func(t *testing.T) {
		// 注释藏 DROP：拆分后是两条语句，SELECT 过只读白名单、DROP 不是只读 → 拒绝
		if got := classifyScript([]string{"SELECT 1", "DROP TABLE users"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("non-whitelisted statement rejected", func(t *testing.T) {
		if got := classifyScript([]string{"GRANT ALL ON *.* TO 'a'@'%'"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("call rejected", func(t *testing.T) {
		if got := classifyScript([]string{"CALL p1()", "CALL p2()"}); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("empty rejected", func(t *testing.T) {
		if got := classifyScript(nil); got != scriptRejected {
			t.Errorf("want rejected, got %v", got)
		}
	})
	t.Run("integrated split and classify", func(t *testing.T) {
		script := "-- seed data\nINSERT INTO t VALUES (1,'a;b'); INSERT INTO t VALUES (2,'c');\nUPDATE t SET a='x' WHERE id=1;"
		if got := classifyScript(splitSQLStatements(script)); got != scriptDML {
			t.Errorf("want dml, got %v", got)
		}
	})
}
