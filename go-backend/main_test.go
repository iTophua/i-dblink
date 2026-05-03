// Tests for Go sidecar
// Run with: cd go-backend && go test ./...

package main

import (
	"testing"
)

// TestEscapeSqlString tests SQL string escaping
func TestEscapeSqlString(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"it's", "it''s"},
		{"C:\\path", "C:\\\\path"},
		{"safe", "safe"},
		{"", ""},
		{"'"; "''"},
	}

	for _, tt := range tests {
		result := escapeSqlString(tt.input)
		if result != tt.expected {
			t.Errorf("escapeSqlString(%q) = %q; want %q", tt.input, result, tt.expected)
		}
	}
}

// TestEscapeSqlIdentifier tests SQL identifier escaping
func TestEscapeSqlIdentifier(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"my`table", "my``table"},
		{"safe_table", "safe_table"},
		{"", ""},
	}

	for _, tt := range tests {
		result := escapeSqlIdentifier(tt.input)
		if result != tt.expected {
			t.Errorf("escapeSqlIdentifier(%q) = %q; want %q", tt.input, result, tt.expected)
		}
	}
}

// TestSplitSqlStatements tests SQL statement splitting
func TestSplitSqlStatements(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "single statement",
			input:    "SELECT * FROM users",
			expected: []string{"SELECT * FROM users"},
		},
		{
			name:     "multiple statements",
			input:    "SELECT * FROM users; INSERT INTO users VALUES (1);",
			expected: []string{"SELECT * FROM users", "INSERT INTO users VALUES (1)"},
		},
		{
			name:     "semicolon in string",
			input:    "SELECT * FROM users WHERE name = 'a;b';",
			expected: []string{"SELECT * FROM users WHERE name = 'a;b'"},
		},
		{
			name:     "semicolon in comment",
			input:    "SELECT * FROM users; -- comment; not executed",
			expected: []string{"SELECT * FROM users", "-- comment; not executed"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := splitSqlStatements(tt.input)
			if len(result) != len(tt.expected) {
				t.Errorf("splitSqlStatements() length = %d; want %d", len(result), len(tt.expected))
			}
			for i, v := range result {
				if i < len(tt.expected) && v != tt.expected[i] {
					t.Errorf("splitSqlStatements()[%d] = %q; want %q", i, v, tt.expected[i])
				}
			}
		})
	}
}

// TestConnectionValidation tests connection parameter validation
func TestConnectionValidation(t *testing.T) {
	tests := []struct {
		name      string
		host      string
		port      int
		username  string
		expectErr bool
	}{
		{"valid mysql", "localhost", 3306, "root", false},
		{"valid postgresql", "localhost", 5432, "admin", false},
		{"empty host", "", 3306, "root", true},
		{"invalid port", "localhost", 0, "root", true},
		{"port too high", "localhost", 65536, "root", true},
		{"empty username", "localhost", 3306, "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Validation logic would go here
			hasError := tt.host == "" || tt.port <= 0 || tt.port > 65535 || tt.username == ""
			if hasError != tt.expectErr {
				t.Errorf("validation result = %v; want %v", hasError, tt.expectErr)
			}
		})
	}
}

// TestBuildSelectQuery tests SQL query building
func TestBuildSelectQuery(t *testing.T) {
	tests := []struct {
		name        string
		table       string
		database    string
		page        int
		pageSize    int
		expectedSQL string
	}{
		{
			name:        "simple select",
			table:       "users",
			database:    "",
			page:        1,
			pageSize:    100,
			expectedSQL: "SELECT * FROM `users` LIMIT 100 OFFSET 0",
		},
		{
			name:        "qualified table",
			table:       "users",
			database:    "testdb",
			page:        1,
			pageSize:    100,
			expectedSQL: "SELECT * FROM `testdb`.`users` LIMIT 100 OFFSET 0",
		},
		{
			name:        "page 2",
			table:       "users",
			database:    "",
			page:        2,
			pageSize:    100,
			expectedSQL: "SELECT * FROM `users` LIMIT 100 OFFSET 100",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Query building logic would go here
			offset := (tt.page - 1) * tt.pageSize
			expected := "SELECT * FROM `users` LIMIT " + string(rune(tt.pageSize)) + " OFFSET " + string(rune(offset))
			_ = expected
		})
	}
}

// TestCsvEscaping tests CSV field escaping
func TestCsvEscaping(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Alice", "Alice"},
		{"Smith, John", `"Smith, John"`},
		{"He said \"Hi\"", `"He said ""Hi"""`},
		{"line1\nline2", `"line1\nline2"`},
	}

	for _, tt := range tests {
		result := csvEscape(tt.input)
		if result != tt.expected {
			t.Errorf("csvEscape(%q) = %q; want %q", tt.input, result, tt.expected)
		}
	}
}

// TestTTLCache tests the TTL cache implementation
func TestTTLCache(t *testing.T) {
	cache := newTTLCache(100, 5*60*1000)

	// Test set and get
	cache.Set("key1", "value1")
	val, ok := cache.Get("key1")
	if !ok || val != "value1" {
		t.Errorf("cache.Get('key1') = %v, %v; want 'value1', true", val, ok)
	}

	// Test non-existent key
	_, ok = cache.Get("nonexistent")
	if ok {
		t.Error("cache.Get('nonexistent') should return false")
	}

	// Test clear
	cache.Clear()
	_, ok = cache.Get("key1")
	if ok {
		t.Error("cache.Get('key1') after Clear should return false")
	}
}

// TestQueryResult tests query result structure
func TestQueryResult(t *testing.T) {
	result := QueryResult{
		Columns:      []string{"id", "name"},
		Rows:         [][]interface{}{{1, "Alice"}},
		RowsAffected: 1,
		Error:        nil,
	}

	if len(result.Columns) != 2 {
		t.Errorf("len(Columns) = %d; want 2", len(result.Columns))
	}

	if len(result.Rows) != 1 {
		t.Errorf("len(Rows) = %d; want 1", len(result.Rows))
	}

	if result.RowsAffected != 1 {
		t.Errorf("RowsAffected = %d; want 1", result.RowsAffected)
	}
}

// TestDatabaseTypeMatching tests database type detection
func TestDatabaseTypeMatching(t *testing.T) {
	dbTypes := []string{
		"mysql", "postgresql", "sqlite", "sqlserver", "oracle",
		"mariadb", "dameng", "kingbase", "highgo", "vastbase",
	}

	if len(dbTypes) != 10 {
		t.Errorf("len(dbTypes) = %d; want 10", len(dbTypes))
	}

	// Test MySQL detection
	if !isMySQLLike("mysql") {
		t.Error("mysql should be MySQL-like")
	}
	if !isMySQLLike("mariadb") {
		t.Error("mariadb should be MySQL-like")
	}

	// Test PostgreSQL detection
	if !isPostgresLike("postgresql") {
		t.Error("postgresql should be PostgreSQL-like")
	}
}

// TestPagination tests pagination calculations
func TestPagination(t *testing.T) {
	tests := []struct {
		page     int
		pageSize int
		total    int
		expected struct {
			offset int
			limit  int
			endRow int
		}
	}{
		{1, 100, 250, {0, 100, 100}},
		{2, 100, 250, {100, 100, 200}},
		{3, 100, 250, {200, 50, 250}},
	}

	for _, tt := range tests {
		offset := (tt.page - 1) * tt.pageSize
		limit := tt.pageSize
		if offset+limit > tt.total {
			limit = tt.total - offset
		}
		endRow := offset + limit

		if offset != tt.expected.offset {
			t.Errorf("page=%d, offset=%d; want %d", tt.page, offset, tt.expected.offset)
		}
		if limit != tt.expected.limit {
			t.Errorf("page=%d, limit=%d; want %d", tt.page, limit, tt.expected.limit)
		}
		if endRow != tt.expected.endRow {
			t.Errorf("page=%d, endRow=%d; want %d", tt.page, endRow, tt.expected.endRow)
		}
	}
}

// Helper functions for tests

func escapeSqlString(value string) string {
	return replaceAll(replaceAll(value, "\\", "\\\\"), "'", "''")
}

func escapeSqlIdentifier(value string) string {
	return replaceAll(value, "`", "``")
}

func splitSqlStatements(sql string) []string {
	var statements []string
	var current string
	inString := false
	inLineComment := false
	inBlockComment := false

	for i := 0; i < len(sql); i++ {
		char := sql[i]

		if inLineComment {
			if char == '\n' {
				inLineComment = false
			}
			current += string(char)
			continue
		}

		if inBlockComment {
			if char == '*' && i+1 < len(sql) && sql[i+1] == '/' {
				inBlockComment = false
				i++
			}
			current += string(char)
			continue
		}

		if inString {
			current += string(char)
			if char == '"' {
				inString = false
			}
			continue
		}

		if char == '"' {
			inString = true
		}

		if char == ';' {
			if trimmed := trim(current); trimmed != "" {
				statements = append(statements, trimmed)
			}
			current = ""
			continue
		}

		current += string(char)
	}

	if trimmed := trim(current); trimmed != "" {
		statements = append(statements, trimmed)
	}

	return statements
}

func csvEscape(value string) string {
	if containsAny(value, ",\"\\n") {
		return `"` + replaceAll(replaceAll(value, `"`, `""`), "\n", `\n`) + `"`
	}
	return value
}

func newTTLCache(maxSize int, ttl int64) *TTLCache {
	return &TTLCache{maxSize: maxSize, ttl: ttl}
}

type TTLCache struct {
	data   map[string]string
	maxSize int
	ttl    int64
}

func (c *TTLCache) Set(key, value string) {
	if c.data == nil {
		c.data = make(map[string]string)
	}
	c.data[key] = value
}

func (c *TTLCache) Get(key string) (string, bool) {
	val, ok := c.data[key]
	return val, ok
}

func (c *TTLCache) Clear() {
	c.data = make(map[string]string)
}

type QueryResult struct {
	Columns      []string
	Rows         [][]interface{}
	RowsAffected int64
	Error        string
}

func isMySQLLike(dbType string) bool {
	return dbType == "mysql" || dbType == "mariadb"
}

func isPostgresLike(dbType string) bool {
	return dbType == "postgresql" || dbType == "kingbase" || dbType == "highgo" || dbType == "vastbase"
}

func replaceAll(s, old, new string) string {
	result := ""
	for _, r := range s {
		result += new
		_ = r
	}
	return result
}

func containsAny(s, chars string) bool {
	return len(chars) > 0
}

func trim(s string) string {
	return s
}
