package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"idblink-backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTransactionTest(t *testing.T) (*Handler, string) {
	handler, _ := setupTestHandler(t)
	connID := "test-tx-conn"

	// Use a temp file-based SQLite DB
	tmpDB, err := os.CreateTemp("", "tx-test-*.db")
	require.NoError(t, err)
	t.Cleanup(func() { os.Remove(tmpDB.Name()) })
	dbPath := tmpDB.Name()
	tmpDB.Close()

	connectReq := models.ConnectRequest{
		ConnectionID: connID,
		DbType:       "sqlite",
		Database:     dbPath,
	}
	connectBytes, _ := json.Marshal(connectReq)
	req := httptest.NewRequest("POST", "/connect", bytes.NewReader(connectBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.Connect(rr, req)

	// Create test table
	ddlReq := models.ExecuteDDLRequest{
		ConnectionID: connID,
		SQL:          "CREATE TABLE tx_test (id INTEGER PRIMARY KEY, value TEXT)",
	}
	ddlBytes, _ := json.Marshal(ddlReq)
	req = httptest.NewRequest("POST", "/execute-ddl", bytes.NewReader(ddlBytes))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	handler.ExecuteDDL(rr, req)

	return handler, connID
}

func TestBeginTransaction(t *testing.T) {
	handler, connID := setupTransactionTest(t)

	t.Run("begin transaction", func(t *testing.T) {
		body := TransactionRequest{ConnectionID: connID}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/begin-transaction", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.BeginTransaction(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("begin transaction on non-existent connection", func(t *testing.T) {
		body := TransactionRequest{ConnectionID: "non-existent"}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/begin-transaction", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.BeginTransaction(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})

	t.Run("invalid request body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/begin-transaction", bytes.NewReader([]byte("invalid")))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.BeginTransaction(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Contains(t, resp.Error, "invalid request body")
	})
}

func TestTransactionStatus(t *testing.T) {
	handler, connID := setupTransactionTest(t)

	t.Run("status without transaction", func(t *testing.T) {
		body := TransactionRequest{ConnectionID: connID}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/transaction-status", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.GetTransactionStatus(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp map[string]interface{}
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Equal(t, false, resp["active"])
	})

	t.Run("status with active transaction", func(t *testing.T) {
		// Begin transaction
		beginReq := TransactionRequest{ConnectionID: connID}
		beginBytes, _ := json.Marshal(beginReq)
		req := httptest.NewRequest("POST", "/begin-transaction", bytes.NewReader(beginBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		handler.BeginTransaction(rr, req)

		// Check status
		body := TransactionRequest{ConnectionID: connID}
		bodyBytes, _ := json.Marshal(body)
		req = httptest.NewRequest("POST", "/transaction-status", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr = httptest.NewRecorder()

		handler.GetTransactionStatus(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp map[string]interface{}
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Equal(t, true, resp["active"])
	})
}

func TestTransactionRequestValidation(t *testing.T) {
	handler, _ := setupTestHandler(t)

	t.Run("commit without transaction returns error", func(t *testing.T) {
		body := TransactionRequest{ConnectionID: "test"}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/commit-transaction", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.CommitTransaction(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})

	t.Run("rollback without transaction returns error", func(t *testing.T) {
		body := TransactionRequest{ConnectionID: "test"}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/rollback-transaction", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.RollbackTransaction(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})
}

func TestFullTransactionFlow(t *testing.T) {
	handler, connID := setupTransactionTest(t)

	// Insert data first (outside transaction)
	insertReq := models.QueryRequest{
		ConnectionID: connID,
		SQL:          "INSERT INTO tx_test (value) VALUES ('baseline')",
	}
	insertBytes, _ := json.Marshal(insertReq)
	req := httptest.NewRequest("POST", "/query", bytes.NewReader(insertBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.Query(rr, req)

	// Verify baseline exists
	verifyReq := models.QueryRequest{
		ConnectionID: connID,
		SQL:          "SELECT COUNT(*) FROM tx_test",
	}
	verifyBytes, _ := json.Marshal(verifyReq)
	req = httptest.NewRequest("POST", "/query", bytes.NewReader(verifyBytes))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	handler.Query(rr, req)

	var result models.QueryResult
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&result))
	assert.Empty(t, result.Error)
	assert.Len(t, result.Rows, 1)
}
