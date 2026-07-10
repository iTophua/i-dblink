package ai

import (
	"testing"
)

// --- Task prompt 构建 ---

func TestTaskSQLConvert_BuildPrompt(t *testing.T) {
	task, err := GetTask(TaskSQLConvert)
	if err != nil {
		t.Fatalf("GetTask failed: %v", err)
	}

	msgs := task.BuildPrompt(&TaskRequest{
		SourceDialect: "MySQL",
		TargetDialect: "Oracle",
		SQL:           "SELECT * FROM users LIMIT 10",
	})

	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Role != "system" {
		t.Errorf("first message role = %q, want system", msgs[0].Role)
	}
	if msgs[1].Role != "user" {
		t.Errorf("second message role = %q, want user", msgs[1].Role)
	}
	// 验证源/目标方言出现在 prompt 中
	if !contains(msgs[1].Content, "MySQL") || !contains(msgs[1].Content, "Oracle") {
		t.Errorf("prompt missing dialect info: %s", msgs[1].Content)
	}
	// 验证原 SQL 出现在 prompt 中
	if !contains(msgs[1].Content, "SELECT * FROM users") {
		t.Errorf("prompt missing original SQL")
	}
}

func TestTaskSQLExplain_BuildPrompt(t *testing.T) {
	task, _ := GetTask(TaskSQLExplain)

	msgs := task.BuildPrompt(&TaskRequest{
		SQL:          "SELECT * FROM orders WHERE status = 1",
		DatabaseType: "MySQL",
	})

	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if !contains(msgs[1].Content, "MySQL") {
		t.Errorf("prompt missing dbType")
	}
}

func TestTaskSQLGenerate_BuildPrompt(t *testing.T) {
	task, _ := GetTask(TaskSQLGenerate)

	msgs := task.BuildPrompt(&TaskRequest{
		NaturalInput: "查询上月销量前10的商品",
		DatabaseType: "PostgreSQL",
		TableInfo:    "products(id, name, sales, created_at)",
	})

	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	// 带 tableInfo 时应包含表结构
	if !contains(msgs[1].Content, "products") {
		t.Errorf("prompt missing table info")
	}
}

func TestGetTask_Unknown(t *testing.T) {
	_, err := GetTask(TaskID("nonexistent"))
	if err == nil {
		t.Error("expected error for unknown task")
	}
}

// --- ExtractSQL ---

func TestExtractSQL_CodeBlock(t *testing.T) {
	input := "这是结果：\n```sql\nSELECT * FROM users\nWHERE id = 1\n```\n完成"
	want := "SELECT * FROM users\nWHERE id = 1"
	got := ExtractSQL(input)
	if got != want {
		t.Errorf("ExtractSQL = %q, want %q", got, want)
	}
}

func TestExtractSQL_NoLanguage(t *testing.T) {
	input := "```\nSELECT 1\n```"
	got := ExtractSQL(input)
	if got != "SELECT 1" {
		t.Errorf("ExtractSQL = %q, want %q", got, "SELECT 1")
	}
}

func TestExtractSQL_NoCodeBlock(t *testing.T) {
	input := "SELECT * FROM users"
	got := ExtractSQL(input)
	if got != input {
		t.Errorf("ExtractSQL = %q, want %q", got, input)
	}
}

// --- Config ---

func TestPresetProviders(t *testing.T) {
	if len(PresetProviders) == 0 {
		t.Error("PresetProviders should not be empty")
	}
	// 验证有 custom 选项
	found := false
	for _, p := range PresetProviders {
		if p.ID == "custom" {
			found = true
			break
		}
	}
	if !found {
		t.Error("PresetProviders should contain 'custom'")
	}
}

func TestParseIntDefault(t *testing.T) {
	if parseIntDefault("", 42) != 42 {
		t.Error("empty string should return default")
	}
	if parseIntDefault("100", 42) != 100 {
		t.Error("valid number should be parsed")
	}
	if parseIntDefault("abc", 42) != 42 {
		t.Error("invalid string should return default")
	}
}

func TestParseFloatDefault(t *testing.T) {
	if parseFloatDefault("", 0.5) != 0.5 {
		t.Error("empty string should return default")
	}
	if parseFloatDefault("0.70", 0.5) != 0.7 {
		t.Error("valid float should be parsed")
	}
	if parseFloatDefault("abc", 0.5) != 0.5 {
		t.Error("invalid string should return default")
	}
}

// --- Manager ---

func TestProviderManager_NotReady(t *testing.T) {
	m := NewProviderManager()
	if m.IsReady() {
		t.Error("new manager should not be ready")
	}
	if _, err := m.GetActive(); err == nil {
		t.Error("GetActive should error when not configured")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && containsStr(s, substr)
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
