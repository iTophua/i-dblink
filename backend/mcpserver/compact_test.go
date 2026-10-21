package mcpserver

import (
	"encoding/json"
	"strings"
	"testing"

	"idblink/backend"
	"idblink/backend/models"
)

func TestTruncateCellStrings(t *testing.T) {
	long := strings.Repeat("x", 500)
	rows := [][]interface{}{
		{"ok", long, nil, 42},
		{strings.Repeat("字", 400), "short"},
	}
	truncateCellStrings(rows, 300)

	if got := rows[0][0]; got != "ok" {
		t.Errorf("short string should be untouched, got %v", got)
	}
	if got := rows[0][2]; got != nil {
		t.Errorf("nil should stay nil, got %v", got)
	}
	if got := rows[0][3]; got != 42 {
		t.Errorf("number should stay number, got %v", got)
	}
	if got, ok := rows[0][1].(string); !ok {
		t.Errorf("truncated cell should stay string, got %T", rows[0][1])
	} else {
		if !strings.Contains(got, "(truncated, 500 chars total)") {
			t.Errorf("truncated cell should carry original length note, got tail: %q", got[len(got)-60:])
		}
		if l := len([]rune(got)); l > 300+40 {
			t.Errorf("truncated cell should be ~300 chars + note, got %d", l)
		}
	}
	// 多字节字符按 rune 计数，不切坏 UTF-8
	if got, _ := rows[1][0].(string); strings.Contains(got, "\ufffd") {
		t.Errorf("multi-byte cell should not be split mid-rune")
	}
	if got := rows[1][1]; got != "short" {
		t.Errorf("boundary-length string should be untouched, got %v", got)
	}
}

func TestConnectionSummaries(t *testing.T) {
	db := "mydb"
	conns := []backend.ConnectionOutput{
		{ID: "c1", Name: "prod", DbType: "mysql", Host: "h1", Port: 3306, Username: "u", Database: &db,
			SSHEnabled: true, SSHHost: &db, SSLEnabled: true, Color: &db},
	}
	out := connectionSummaries(conns)
	if len(out) != 1 {
		t.Fatalf("want 1 summary, got %d", len(out))
	}
	s := out[0]
	if s.ConnectionID != "c1" || s.Name != "prod" || s.DbType != "mysql" || s.Port != 3306 || *s.Database != "mydb" {
		t.Errorf("summary fields mismatch: %+v", s)
	}
	// 瘦身投影不应携带 SSH/SSL 字段
	b, _ := jsonMarshal(s)
	for _, field := range []string{"ssh_", "ssl_", "color", "group_id"} {
		if strings.Contains(string(b), field) {
			t.Errorf("summary should not contain %q, got %s", field, b)
		}
	}
}

func TestTableSummaries(t *testing.T) {
	comment := "用户表"
	rows := uint64(123)
	tables := []models.TableInfo{
		{TableName: "users", TableType: "BASE TABLE", RowCount: &rows, Comment: &comment,
			Engine: &comment, DataSize: &comment, CreateTime: &comment},
	}
	out := tableSummaries(tables)
	if len(out) != 1 || out[0].TableName != "users" || *out[0].RowCount != 123 || *out[0].Comment != "用户表" {
		t.Fatalf("summary fields mismatch: %+v", out)
	}
	b, _ := jsonMarshal(out[0])
	for _, field := range []string{"engine", "data_size", "create_time", "collation"} {
		if strings.Contains(string(b), field) {
			t.Errorf("summary should not contain %q, got %s", field, b)
		}
	}
}

func jsonMarshal(v any) ([]byte, error) {
	return json.Marshal(v)
}
