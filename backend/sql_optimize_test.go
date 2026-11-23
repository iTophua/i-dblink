package backend

import (
	"reflect"
	"testing"
)

func TestFirstSQLStatement(t *testing.T) {
	cases := map[string]string{
		"SELECT 1; SELECT 2":           "SELECT 1",
		"  SELECT 1 ;  SELECT 2 ":      "SELECT 1",
		"SELECT ';' AS a; SELECT 2":    "SELECT ';' AS a",
		"SELECT `a;b` FROM t; DROP":    "SELECT `a;b` FROM t",
		"SELECT 'it''s;fine' FROM t":   "SELECT 'it''s;fine' FROM t",
		"UPDATE t SET a='x;y' WHERE 1": "UPDATE t SET a='x;y' WHERE 1",
		"SELECT 1":                     "SELECT 1",
		"   ":                          "",
	}
	for input, want := range cases {
		if got := firstSQLStatement(input); got != want {
			t.Errorf("firstSQLStatement(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestExtractTableNames(t *testing.T) {
	cases := []struct {
		sql  string
		want []string
	}{
		{"SELECT * FROM users WHERE id=1", []string{"users"}},
		{"SELECT * FROM db1.users u JOIN orders o ON u.id=o.uid", []string{"db1.users", "orders"}},
		{"UPDATE `app`.`t_order` SET a=1", []string{"app.t_order"}},
		{"INSERT INTO public.logs (id) VALUES (1)", []string{"public.logs"}},
		// 子查询关键字不当作表名
		{"SELECT * FROM (SELECT 1) x", nil},
		{"SELECT * FROM t1 WHERE id IN (SELECT uid FROM t2)", []string{"t1", "t2"}},
		{"DELETE FROM audit WHERE ts<1", []string{"audit"}},
		// 去重
		{"SELECT * FROM t1 a JOIN t1 b ON a.id=b.id", []string{"t1"}},
	}
	for _, c := range cases {
		if got := extractTableNames(c.sql); !reflect.DeepEqual(got, c.want) {
			t.Errorf("extractTableNames(%q) = %v, want %v", c.sql, got, c.want)
		}
	}
}

func TestSplitTableName(t *testing.T) {
	cases := []struct {
		ref               string
		table, schema, db string
	}{
		{"t", "t", "", ""},
		{"public.t", "t", "public", ""},
		{"db1.public.t", "t", "public", "db1"},
	}
	for _, c := range cases {
		tb, sc, db := splitTableName(c.ref)
		if tb != c.table || sc != c.schema || db != c.db {
			t.Errorf("splitTableName(%q) = (%q,%q,%q), want (%q,%q,%q)",
				c.ref, tb, sc, db, c.table, c.schema, c.db)
		}
	}
}
