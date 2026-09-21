package mcpserver

import (
	"testing"

	"idblink/backend"
)

func connWith(id, dbType, host string, port int, username string, database *string) backend.ConnectionOutput {
	return backend.ConnectionOutput{
		ID: id, DbType: dbType, Host: host, Port: port, Username: username, Database: database,
	}
}

func strPtr(s string) *string { return &s }

func TestFindReusableConnection(t *testing.T) {
	full := connWith("full", "mysql", "10.0.0.1", 7033, "root", nil)
	fixedA := connWith("fixedA", "mysql", "10.0.0.1", 7033, "root", strPtr("db_a"))
	fixedB := connWith("fixedB", "mysql", "10.0.0.1", 7033, "root", strPtr("db_b"))
	otherPort := connWith("other", "mysql", "10.0.0.1", 3306, "root", nil)
	otherUser := connWith("otheruser", "mysql", "10.0.0.1", 7033, "admin", nil)

	t.Run("exact database wins", func(t *testing.T) {
		got := findReusableConnection([]backend.ConnectionOutput{full, fixedA}, "mysql", "10.0.0.1", 7033, "root", strPtr("db_a"))
		if got == nil || got.ID != "fixedA" {
			t.Errorf("want fixedA, got %v", got)
		}
	})
	t.Run("request specific db reuses full connection as-is", func(t *testing.T) {
		// 关键语义：全量连接服务任意库请求，绝不被收窄
		got := findReusableConnection([]backend.ConnectionOutput{full}, "mysql", "10.0.0.1", 7033, "root", strPtr("db_x"))
		if got == nil || got.ID != "full" || got.Database != nil {
			t.Errorf("want full kept as-is, got %v", got)
		}
	})
	t.Run("general request prefers full over fixed", func(t *testing.T) {
		got := findReusableConnection([]backend.ConnectionOutput{fixedA, full}, "mysql", "10.0.0.1", 7033, "root", nil)
		if got == nil || got.ID != "full" {
			t.Errorf("want full, got %v", got)
		}
	})
	t.Run("fallback to any match when no full", func(t *testing.T) {
		got := findReusableConnection([]backend.ConnectionOutput{fixedA, fixedB}, "mysql", "10.0.0.1", 7033, "root", nil)
		if got == nil || got.ID != "fixedA" {
			t.Errorf("want fixedA fallback, got %v", got)
		}
	})
	t.Run("port mismatch no reuse", func(t *testing.T) {
		got := findReusableConnection([]backend.ConnectionOutput{otherPort}, "mysql", "10.0.0.1", 7033, "root", nil)
		if got != nil {
			t.Errorf("want nil, got %v", got)
		}
	})
	t.Run("username mismatch no reuse", func(t *testing.T) {
		got := findReusableConnection([]backend.ConnectionOutput{otherUser}, "mysql", "10.0.0.1", 7033, "root", nil)
		if got != nil {
			t.Errorf("want nil, got %v", got)
		}
	})
}

func TestFindConnectionByServerAccount(t *testing.T) {
	full := connWith("full", "mysql", "10.0.0.1", 7033, "root", nil)
	otherPort := connWith("other", "mysql", "10.0.0.1", 3306, "root", nil)

	t.Run("ignores port", func(t *testing.T) {
		got := findConnectionByServerAccount([]backend.ConnectionOutput{otherPort}, "mysql", "10.0.0.1", "root")
		if got == nil || got.Port != 3306 {
			t.Errorf("want other(3306), got %v", got)
		}
	})
	t.Run("no match returns nil", func(t *testing.T) {
		if got := findConnectionByServerAccount([]backend.ConnectionOutput{full}, "mysql", "10.0.0.1", "admin"); got != nil {
			t.Errorf("want nil, got %v", got)
		}
	})
}

func TestDefaultPortForDBType(t *testing.T) {
	cases := map[string]int{
		"mysql": 3306, "mariadb": 3306, "postgresql": 5432, "oracle": 1521,
		"sqlserver": 1433, "dameng": 5236, "kingbase": 54321, "unknown": 0,
	}
	for k, want := range cases {
		if got := defaultPortForDBType(k); got != want {
			t.Errorf("%s: got %d want %d", k, got, want)
		}
	}
}
