package testutil

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// SetupTestDB creates an in-memory SQLite database with test schema
func SetupTestDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}

	// Load and execute schema
	schemaPath := filepath.Join("..", "..", "testdata", "schema.sql")
	schema, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("failed to read schema file: %v", err)
	}

	if _, err := db.Exec(string(schema)); err != nil {
		t.Fatalf("failed to execute schema: %v", err)
	}

	t.Cleanup(func() {
		db.Close()
	})

	return db
}

// SetupTestDBWithData creates test DB with schema and test data
func SetupTestDBWithData(t *testing.T) *sql.DB {
	db := SetupTestDB(t)

	// Insert additional test data if needed
	return db
}

// MustExec executes SQL and fails on error
func MustExec(t *testing.T, db *sql.DB, sql string, args ...interface{}) sql.Result {
	result, err := db.Exec(sql, args...)
	if err != nil {
		t.Fatalf("failed to execute %s: %v", sql, err)
	}
	return result
}

// MustQueryRow executes query and returns single row
func MustQueryRow(t *testing.T, db *sql.DB, sql string, args ...interface{}) *sql.Row {
	return db.QueryRow(sql, args...)
}

// AssertRowCount asserts table row count
func AssertRowCount(t *testing.T, db *sql.DB, table string, expected int) {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM "+table).Scan(&count)
	if err != nil {
		t.Fatalf("failed to count rows in %s: %v", table, err)
	}
	if count != expected {
		t.Errorf("expected %d rows in %s, got %d", expected, table, count)
	}
}
