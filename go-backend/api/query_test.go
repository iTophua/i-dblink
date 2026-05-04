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

func TestQuery(t *testing.T) {
	handler, _ := setupTestHandler(t)

	// Setup a SQLite connection for testing
	connectReq := models.ConnectRequest{
		ConnectionID: "test-query-conn",
		DbType:       "sqlite",
		Database:     ":memory:",
	}
	connectBytes, _ := json.Marshal(connectReq)
	req := httptest.NewRequest("POST", "/connect", bytes.NewReader(connectBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.Connect(rr, req)

	// Create test table and insert data
	queryReq := models.QueryRequest{
		ConnectionID: "test-query-conn",
		SQL:          "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)",
	}
	queryBytes, _ := json.Marshal(queryReq)
	req = httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	handler.Query(rr, req)

	// Insert test data
	queryReq.SQL = "INSERT INTO test (name) VALUES ('Alice'), ('Bob')"
	queryBytes, _ = json.Marshal(queryReq)
	req = httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	handler.Query(rr, req)

	t.Run("select query returns rows", func(t *testing.T) {
		queryReq := models.QueryRequest{
			ConnectionID: "test-query-conn",
			SQL:          "SELECT * FROM test ORDER BY id",
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
		assert.Equal(t, []string{"id", "name"}, resp.Columns)
		assert.Len(t, resp.Rows, 2)
		assert.Equal(t, "Alice", resp.Rows[0][1])
		assert.Equal(t, "Bob", resp.Rows[1][1])
	})

	t.Run("insert query", func(t *testing.T) {
		queryReq := models.QueryRequest{
			ConnectionID: "test-query-conn",
			SQL:          "INSERT INTO test (name) VALUES ('Charlie')",
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("syntax error", func(t *testing.T) {
		queryReq := models.QueryRequest{
			ConnectionID: "test-query-conn",
			SQL:          "SELECT * FORM test", // Intentional typo
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
		assert.Contains(t, resp.Error, "FORM")
	})

	t.Run("invalid request body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/query", bytes.NewReader([]byte("invalid")))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Contains(t, resp.Error, "invalid request body")
	})

	t.Run("non-existent connection", func(t *testing.T) {
		queryReq := models.QueryRequest{
			ConnectionID: "non-existent",
			SQL:          "SELECT 1",
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})

	t.Run("empty result", func(t *testing.T) {
		queryReq := models.QueryRequest{
			ConnectionID: "test-query-conn",
			SQL:          "SELECT * FROM test WHERE id = 99999",
		}
		queryBytes, _ := json.Marshal(queryReq)
		req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Query(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.QueryResult
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
		assert.Len(t, resp.Rows, 0)
	})
}

func TestExecuteSQL(t *testing.T) {
	// This is tested indirectly through TestQuery
	// Additional unit tests for executeSQL helper
}

func TestConvertValue(t *testing.T) {
	tests := []struct {
		name     string
		input    interface{}
		expected interface{}
	}{
		{"nil", nil, nil},
		{"int", int64(42), float64(42)},
		{"float", float64(3.14), float64(3.14)},
		{"string", "hello", "hello"},
		{"bool", true, true},
		{"bytes", []byte("world"), "world"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertValue(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}
