package mcpserver

import (
	"strings"
	"testing"

	"github.com/mark3labs/mcp-go/mcp"

	"idblink/backend"
)

func resolveFixtures() []backend.ConnectionOutput {
	return []backend.ConnectionOutput{
		{ID: "id-mysql-94", Name: "172.18.10.94", DbType: "mysql", Host: "172.18.10.94"},
		{ID: "id-pg-94", Name: "172.18.10.94", DbType: "postgresql", Host: "172.18.10.94"},
		{ID: "id-bl", Name: "172.18.11.114-包铝测试", DbType: "mysql", Host: "172.18.11.114"},
	}
}

func TestResolveConnectionRef(t *testing.T) {
	conns := resolveFixtures()

	t.Run("exact id wins", func(t *testing.T) {
		id, errRes := resolveConnectionRef(conns, "id-mysql-94")
		if errRes != nil || id != "id-mysql-94" {
			t.Fatalf("exact id should win, got id=%q errRes=%v", id, errRes)
		}
	})

	t.Run("unique host fragment", func(t *testing.T) {
		id, errRes := resolveConnectionRef(conns, "11.114")
		if errRes != nil || id != "id-bl" {
			t.Fatalf("'11.114' should resolve to id-bl, got id=%q errRes=%v", id, errRes)
		}
	})

	t.Run("unique name fragment", func(t *testing.T) {
		id, errRes := resolveConnectionRef(conns, "包铝")
		if errRes != nil || id != "id-bl" {
			t.Fatalf("'包铝' should resolve by name to id-bl, got id=%q errRes=%v", id, errRes)
		}
	})

	t.Run("full host still ambiguous lists ids", func(t *testing.T) {
		id, errRes := resolveConnectionRef(conns, "10.94")
		if errRes == nil {
			t.Fatalf("'10.94' matches two connections, should error, got id=%q", id)
		}
		// 错误信息必须带两个候选的真实 ID，调用方可直接重试
		msgs := errContentText(t, errRes)
		if !strings.Contains(msgs, "id-mysql-94") || !strings.Contains(msgs, "id-pg-94") {
			t.Fatalf("ambiguous error should list both ids, got: %s", msgs)
		}
		if !strings.Contains(msgs, "ambiguous") {
			t.Fatalf("error should say ambiguous, got: %s", msgs)
		}
	})

	t.Run("no match", func(t *testing.T) {
		_, errRes := resolveConnectionRef(conns, "999.999")
		if errRes == nil {
			t.Fatal("no match should error")
		}
		msgs := errContentText(t, errRes)
		if !strings.Contains(msgs, "999.999") || !strings.Contains(msgs, "list_connections") {
			t.Fatalf("no-match error should guide to list_connections, got: %s", msgs)
		}
	})
}

func errContentText(t *testing.T, res *mcp.CallToolResult) string {
	t.Helper()
	if len(res.Content) == 0 {
		return ""
	}
	if tc, ok := res.Content[0].(mcp.TextContent); ok {
		return tc.Text
	}
	return ""
}
