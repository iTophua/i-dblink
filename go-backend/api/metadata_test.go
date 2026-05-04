package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"idblink-backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupMetadataTest(t *testing.T) *Handler {
	handler, _ := setupTestHandler(t)

	// Create a SQLite connection with test schema
	connectReq := models.ConnectRequest{
		ConnectionID: "test-meta-conn",
		DbType:       "sqlite",
		Database:     ":memory:",
	}
	connectBytes, _ := json.Marshal(connectReq)
	req := httptest.NewRequest("POST", "/connect", bytes.NewReader(connectBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.Connect(rr, req)

	// Create test tables
	tables := []string{
		"CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, email TEXT)",
		"CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, amount REAL)",
		"CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)",
		"CREATE VIEW user_summary AS SELECT id, username FROM users",
	}

	for _, sql := range tables {
		queryReq := models.QueryRequest{
			ConnectionID: "test-meta-conn",
			SQL:          sql,
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		handler.Query(rr, req)
	}

	return handler
}

func TestGetDatabases(t *testing.T) {
	handler := setupMetadataTest(t)

	t.Run("get databases for sqlite", func(t *testing.T) {
		body := MetadataRequest{ConnectionID: "test-meta-conn"}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/databases", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetDatabases(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var databases []string
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&databases))
		assert.Contains(t, databases, "main")
	})

	t.Run("invalid request body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/databases", bytes.NewReader([]byte("invalid")))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetDatabases(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Contains(t, resp.Error, "invalid request body")
	})

	t.Run("non-existent connection", func(t *testing.T) {
		body := MetadataRequest{ConnectionID: "non-existent"}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/databases", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetDatabases(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})
}

func TestGetTables(t *testing.T) {
	handler := setupMetadataTest(t)

	t.Run("get tables", func(t *testing.T) {
		body := MetadataRequest{ConnectionID: "test-meta-conn"}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/tables", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetTables(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var tables []models.TableInfo
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&tables))
		assert.GreaterOrEqual(t, len(tables), 3)

		// Check that we have the expected tables
		tableNames := make([]string, len(tables))
		for i, table := range tables {
			tableNames[i] = table.TableName
		}
		assert.Contains(t, tableNames, "users")
		assert.Contains(t, tableNames, "orders")
		assert.Contains(t, tableNames, "products")
	})

	t.Run("invalid request body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/tables", bytes.NewReader([]byte("invalid")))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetTables(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Contains(t, resp.Error, "invalid request body")
	})
}

func TestGetTablesCategorized(t *testing.T) {
	handler := setupMetadataTest(t)

	t.Run("get categorized tables", func(t *testing.T) {
		body := MetadataRequest{ConnectionID: "test-meta-conn"}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/tables-categorized", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetTablesCategorized(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var result models.TablesResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&result))
		assert.GreaterOrEqual(t, len(result.Tables), 3)
		assert.GreaterOrEqual(t, len(result.Views), 1)

		// Check tables
		tableNames := make([]string, len(result.Tables))
		for i, table := range result.Tables {
			tableNames[i] = table.TableName
		}
		assert.Contains(t, tableNames, "users")
		assert.Contains(t, tableNames, "orders")

		// Check views
		viewNames := make([]string, len(result.Views))
		for i, view := range result.Views {
			viewNames[i] = view.TableName
		}
		assert.Contains(t, viewNames, "user_summary")
	})
}

func TestGetColumns(t *testing.T) {
	handler := setupMetadataTest(t)

	t.Run("get columns for users table", func(t *testing.T) {
		dbName := "main"
		tableName := "users"
		body := MetadataRequest{
			ConnectionID: "test-meta-conn",
			Database:     &dbName,
			TableName:    &tableName,
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/columns", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetColumns(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var columns []models.ColumnInfo
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&columns))
		assert.GreaterOrEqual(t, len(columns), 3)

		columnNames := make([]string, len(columns))
		for i, col := range columns {
			columnNames[i] = col.ColumnName
		}
		assert.Contains(t, columnNames, "id")
		assert.Contains(t, columnNames, "username")
		assert.Contains(t, columnNames, "email")
	})

	t.Run("get columns for non-existent table", func(t *testing.T) {
		dbName := "main"
		tableName := "non_existent"
		body := MetadataRequest{
			ConnectionID: "test-meta-conn",
			Database:     &dbName,
			TableName:    &tableName,
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/columns", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetColumns(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var columns []models.ColumnInfo
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&columns))
		// SQLite returns empty columns for non-existent table
		assert.Len(t, columns, 0)
	})
}

func TestGetTableStructure(t *testing.T) {
	handler := setupMetadataTest(t)

	t.Run("get structure for users table", func(t *testing.T) {
		dbName := "main"
		tableName := "users"
		body := MetadataRequest{
			ConnectionID: "test-meta-conn",
			Database:     &dbName,
			TableName:    &tableName,
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/table-structure", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetTableStructure(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var structure models.TableStructure
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&structure))
		assert.GreaterOrEqual(t, len(structure.Columns), 3)
		assert.Empty(t, structure.Error)

		// Check columns
		columnNames := make([]string, len(structure.Columns))
		for i, col := range structure.Columns {
			columnNames[i] = col.ColumnName
		}
		assert.Contains(t, columnNames, "id")
		assert.Contains(t, columnNames, "username")
	})
}

func TestGetIndexes(t *testing.T) {
	handler := setupMetadataTest(t)

	t.Run("get indexes for users table", func(t *testing.T) {
		dbName := "main"
		tableName := "users"
		body := MetadataRequest{
			ConnectionID: "test-meta-conn",
			Database:     &dbName,
			TableName:    &tableName,
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/indexes", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetIndexes(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var indexes []models.IndexInfo
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&indexes))
		// SQLite auto-index for primary key
		assert.GreaterOrEqual(t, len(indexes), 1)
	})
}

func TestGetForeignKeys(t *testing.T) {
	handler := setupMetadataTest(t)

	t.Run("get foreign keys for orders table", func(t *testing.T) {
		dbName := "main"
		tableName := "orders"
		body := MetadataRequest{
			ConnectionID: "test-meta-conn",
			Database:     &dbName,
			TableName:    &tableName,
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/foreign-keys", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetForeignKeys(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var fks []models.ForeignKeyInfo
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&fks))
		// SQLite foreign keys might not be returned without PRAGMA
		// This is a basic test to ensure the endpoint works
	})
}

func TestGetRoutines(t *testing.T) {
	handler := setupMetadataTest(t)

	t.Run("get routines for sqlite", func(t *testing.T) {
		body := MetadataRequest{ConnectionID: "test-meta-conn"}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/routines", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetRoutines(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var result models.RoutinesResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&result))
		// SQLite has limited stored procedure support
		assert.NotNil(t, result.Procedures)
		assert.NotNil(t, result.Functions)
	})
}
