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

func setupDDLTest(t *testing.T) (*Handler, string) {
	handler, _ := setupTestHandler(t)
	connID := "test-ddl-conn"

	// Create a SQLite connection
	connectReq := models.ConnectRequest{
		ConnectionID: connID,
		DbType:       "sqlite",
		Database:     ":memory:",
	}
	connectBytes, _ := json.Marshal(connectReq)
	req := httptest.NewRequest("POST", "/connect", bytes.NewReader(connectBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.Connect(rr, req)

	return handler, connID
}

func TestExecuteDDL(t *testing.T) {
	handler, connID := setupDDLTest(t)

	t.Run("create table", func(t *testing.T) {
		body := models.ExecuteDDLRequest{
			ConnectionID: connID,
			SQL:          "CREATE TABLE ddl_test (id INTEGER PRIMARY KEY, name TEXT)",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.ExecuteDDL(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("alter table", func(t *testing.T) {
		// First create a table
		createReq := models.ExecuteDDLRequest{
			ConnectionID: connID,
			SQL:          "CREATE TABLE alter_test (id INTEGER PRIMARY KEY)",
		}
		createBytes, _ := json.Marshal(createReq)
		req := httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader(createBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		handler.ExecuteDDL(rr, req)

		// Then alter it
		body := models.ExecuteDDLRequest{
			ConnectionID: connID,
			SQL:          "ALTER TABLE alter_test ADD COLUMN name TEXT",
		}
		bodyBytes, _ := json.Marshal(body)
		req = httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr = httptest.NewRecorder()

		handler.ExecuteDDL(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("drop table", func(t *testing.T) {
		// Create table first
		createReq := models.ExecuteDDLRequest{
			ConnectionID: connID,
			SQL:          "CREATE TABLE drop_test (id INTEGER PRIMARY KEY)",
		}
		createBytes, _ := json.Marshal(createReq)
		req := httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader(createBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		handler.ExecuteDDL(rr, req)

		// Drop the table
		body := models.ExecuteDDLRequest{
			ConnectionID: connID,
			SQL:          "DROP TABLE drop_test",
		}
		bodyBytes, _ := json.Marshal(body)
		req = httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr = httptest.NewRecorder()

		handler.ExecuteDDL(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("syntax error", func(t *testing.T) {
		body := models.ExecuteDDLRequest{
			ConnectionID: connID,
			SQL:          "CREATE TABEL error_test (id INTEGER)", // Intentional typo
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.ExecuteDDL(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})

	t.Run("invalid request body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader([]byte("invalid")))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.ExecuteDDL(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Contains(t, resp.Error, "invalid request body")
	})
}

func TestTruncateTable(t *testing.T) {
	handler, connID := setupDDLTest(t)

	// Create and populate table
	ddlReq := models.ExecuteDDLRequest{
		ConnectionID: connID,
		SQL:          "CREATE TABLE truncate_test (id INTEGER PRIMARY KEY, name TEXT)",
	}
	ddlBytes, _ := json.Marshal(ddlReq)
	req := httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader(ddlBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.ExecuteDDL(rr, req)

	// Insert data
	queryReq := models.QueryRequest{
		ConnectionID: connID,
		SQL:          "INSERT INTO truncate_test (name) VALUES ('Alice'), ('Bob')",
	}
	queryBytes, _ := json.Marshal(queryReq)
	req = httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	handler.Query(rr, req)

	t.Run("truncate table", func(t *testing.T) {
		body := models.TableOperationRequest{
			ConnectionID: connID,
			TableName:    "truncate_test",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/truncate-table", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.TruncateTable(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("truncate non-existent table", func(t *testing.T) {
		body := models.TableOperationRequest{
			ConnectionID: connID,
			TableName:    "non_existent",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/truncate-table", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.TruncateTable(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})
}

func TestDropTable(t *testing.T) {
	handler, connID := setupDDLTest(t)

	// Create table
	ddlReq := models.ExecuteDDLRequest{
		ConnectionID: connID,
		SQL:          "CREATE TABLE drop_test_table (id INTEGER PRIMARY KEY)",
	}
	ddlBytes, _ := json.Marshal(ddlReq)
	req := httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader(ddlBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.ExecuteDDL(rr, req)

	t.Run("drop existing table", func(t *testing.T) {
		body := models.TableOperationRequest{
			ConnectionID: connID,
			TableName:    "drop_test_table",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/drop-table", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.DropTable(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("drop non-existent table", func(t *testing.T) {
		body := models.TableOperationRequest{
			ConnectionID: connID,
			TableName:    "non_existent",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/drop-table", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.DropTable(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})
}

func TestRenameTable(t *testing.T) {
	handler, connID := setupDDLTest(t)

	// Create table
	ddlReq := models.ExecuteDDLRequest{
		ConnectionID: connID,
		SQL:          "CREATE TABLE old_name (id INTEGER PRIMARY KEY)",
	}
	ddlBytes, _ := json.Marshal(ddlReq)
	req := httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader(ddlBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.ExecuteDDL(rr, req)

	t.Run("rename table", func(t *testing.T) {
		body := models.RenameTableRequest{
			ConnectionID: connID,
			OldName:      "old_name",
			NewName:      "new_name",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/rename-table", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.RenameTable(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("rename non-existent table", func(t *testing.T) {
		body := models.RenameTableRequest{
			ConnectionID: connID,
			OldName:      "non_existent",
			NewName:      "something",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/rename-table", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.RenameTable(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})
}
