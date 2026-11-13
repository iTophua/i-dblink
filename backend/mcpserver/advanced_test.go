package mcpserver

import (
	"testing"

	"idblink/backend"
	"idblink/backend/models"
)

func TestBuildExplainSQL(t *testing.T) {
	cases := map[string]string{
		"mysql":      "EXPLAIN SELECT 1",
		"mariadb":    "EXPLAIN SELECT 1",
		"postgresql": "EXPLAIN SELECT 1",
		"kingbase":   "EXPLAIN SELECT 1",
		"highgo":     "EXPLAIN SELECT 1",
		"vastbase":   "EXPLAIN SELECT 1",
		"sqlite":     "EXPLAIN QUERY PLAN SELECT 1",
		"oracle":     "EXPLAIN PLAN FOR SELECT 1",
		"dameng":     "EXPLAIN PLAN FOR SELECT 1",
		"sqlserver":  "SET SHOWPLAN_XML ON;\nSELECT 1;\nSET SHOWPLAN_XML OFF;",
	}
	for dbType, want := range cases {
		got, err := buildExplainSQL(dbType, "SELECT 1")
		if err != nil {
			t.Errorf("%s: unexpected error: %v", dbType, err)
			continue
		}
		if got != want {
			t.Errorf("%s: got %q, want %q", dbType, got, want)
		}
	}
	if _, err := buildExplainSQL("unknown", "SELECT 1"); err == nil {
		t.Error("want error for unknown db_type")
	}
}

func TestFilterTablesBySchema(t *testing.T) {
	items := []models.TableInfo{
		{TableName: "a", Schema: "public"},
		{TableName: "b", Schema: "audit"},
		{TableName: "c", Schema: ""},
	}
	if got := filterTablesBySchema(items, ""); len(got) != 3 {
		t.Errorf("empty schema should keep all, got %d", len(got))
	}
	got := filterTablesBySchema(items, "PUBLIC")
	if len(got) != 1 || got[0].TableName != "a" {
		t.Errorf("case-insensitive schema filter failed: %+v", got)
	}
}

func TestApplyNewSSL(t *testing.T) {
	t.Run("paths infer enabled", func(t *testing.T) {
		var input backend.ConnectionInput
		applyNewSSL(map[string]any{"ssl_ca_path": "/certs/ca.pem", "ssl_skip_verify": true}, &input)
		if !input.SSLEnabled || input.SSLCAPath == nil || *input.SSLCAPath != "/certs/ca.pem" {
			t.Errorf("SSL not applied: %+v", input)
		}
		if !input.SSLSkipVerify {
			t.Error("skip verify not applied")
		}
	})
	t.Run("no args leaves disabled", func(t *testing.T) {
		var input backend.ConnectionInput
		applyNewSSL(map[string]any{}, &input)
		if input.SSLEnabled {
			t.Error("should stay disabled")
		}
	})
	t.Run("explicit true enables without paths", func(t *testing.T) {
		var input backend.ConnectionInput
		applyNewSSL(map[string]any{"ssl_enabled": true}, &input)
		if !input.SSLEnabled {
			t.Error("ssl_enabled=true should enable SSL")
		}
	})
}

func TestApplySSLUpdate(t *testing.T) {
	ca := "/certs/ca.pem"
	existing := backend.ConnectionOutput{SSLEnabled: true, SSLCaPath: &ca, SSLSkipVerify: true}

	t.Run("no args keeps existing", func(t *testing.T) {
		var input backend.ConnectionInput
		applySSLUpdate(map[string]any{"name": "x"}, &input, &existing)
		if !input.SSLEnabled || input.SSLCAPath == nil || *input.SSLCAPath != "/certs/ca.pem" {
			t.Errorf("SSL not preserved: %+v", input)
		}
		if !input.SSLSkipVerify {
			t.Error("skip verify not preserved")
		}
	})
	t.Run("disable clears", func(t *testing.T) {
		var input backend.ConnectionInput
		applySSLUpdate(map[string]any{"ssl_enabled": false}, &input, &existing)
		if input.SSLEnabled || input.SSLCAPath != nil || input.SSLSkipVerify {
			t.Errorf("SSL not disabled: %+v", input)
		}
	})
	t.Run("partial update keeps existing path", func(t *testing.T) {
		var input backend.ConnectionInput
		applySSLUpdate(map[string]any{"ssl_skip_verify": false}, &input, &existing)
		if !input.SSLEnabled || input.SSLCAPath == nil || *input.SSLCAPath != "/certs/ca.pem" {
			t.Errorf("SSL path not preserved: %+v", input)
		}
		if input.SSLSkipVerify {
			t.Error("skip verify should be false")
		}
	})
}
