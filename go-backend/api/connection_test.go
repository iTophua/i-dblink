package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"idblink-backend/db"
	"idblink-backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestHandler(t *testing.T) (*Handler, *db.Manager) {
	manager := db.NewManager()
	handler := &Handler{
		mgr:    manager,
		tunnel: NewTunnelManager(),
	}
	return handler, manager
}

func TestConnect(t *testing.T) {
	handler, _ := setupTestHandler(t)

	t.Run("invalid request body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/connect", bytes.NewReader([]byte("invalid json")))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Connect(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Contains(t, resp.Error, "invalid request body")
	})

	t.Run("missing connection_id", func(t *testing.T) {
		body := models.ConnectRequest{
			DbType:   "mysql",
			Host:     "localhost",
			Port:     3306,
			Username: "test",
			Password: "test",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/connect", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Connect(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.ConnectResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})

	t.Run("valid sqlite connection", func(t *testing.T) {
		body := models.ConnectRequest{
			ConnectionID: "test-conn-1",
			DbType:       "sqlite",
			Database:     ":memory:",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/connect", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Connect(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.ConnectResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Equal(t, "test-conn-1", resp.ConnectionID)
		assert.Empty(t, resp.Error)
	})

	t.Run("duplicate connection_id", func(t *testing.T) {
		body := models.ConnectRequest{
			ConnectionID: "test-conn-dup",
			DbType:       "sqlite",
			Database:     ":memory:",
		}
		bodyBytes, _ := json.Marshal(body)
		
		// First connection
		req1 := httptest.NewRequest("POST", "/connect", bytes.NewReader(bodyBytes))
		req1.Header.Set("Content-Type", "application/json")
		rr1 := httptest.NewRecorder()
		handler.Connect(rr1, req1)

		// Second connection with same ID
		req2 := httptest.NewRequest("POST", "/connect", bytes.NewReader(bodyBytes))
		req2.Header.Set("Content-Type", "application/json")
		rr2 := httptest.NewRecorder()
		handler.Connect(rr2, req2)

		assert.Equal(t, http.StatusOK, rr2.Code)
		var resp models.ConnectResponse
		require.NoError(t, json.NewDecoder(rr2.Body).Decode(&resp))
		assert.Contains(t, resp.Error, "already exists")
	})
}

func TestDisconnect(t *testing.T) {
	handler, manager := setupTestHandler(t)

	// First create a connection
	connectReq := models.ConnectRequest{
		ConnectionID: "test-disconnect",
		DbType:       "sqlite",
		Database:     ":memory:",
	}
	connectBytes, _ := json.Marshal(connectReq)
	req := httptest.NewRequest("POST", "/connect", bytes.NewReader(connectBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.Connect(rr, req)

	// Verify connection exists
	_, err := manager.GetExecutor("test-disconnect", "")
	require.NoError(t, err)

	t.Run("disconnect existing connection", func(t *testing.T) {
		body := models.DisconnectRequest{ConnectionID: "test-disconnect"}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/disconnect", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Disconnect(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("disconnect non-existent connection", func(t *testing.T) {
		body := models.DisconnectRequest{ConnectionID: "non-existent"}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/disconnect", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Disconnect(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})

	t.Run("invalid request body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/disconnect", bytes.NewReader([]byte("invalid")))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Disconnect(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Contains(t, resp.Error, "invalid request body")
	})
}

func TestTestConnection(t *testing.T) {
	handler, _ := setupTestHandler(t)

	t.Run("test sqlite connection", func(t *testing.T) {
		body := models.ConnectRequest{
			ConnectionID: "test-conn-test",
			DbType:       "sqlite",
			Database:     ":memory:",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/test", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Test(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Empty(t, resp.Error)
	})

	t.Run("invalid db type", func(t *testing.T) {
		body := models.ConnectRequest{
			ConnectionID: "test-conn-invalid",
			DbType:       "invalid",
			Host:         "localhost",
			Port:         3306,
			Username:     "test",
			Password:     "test",
		}
		bodyBytes, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/test", bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Test(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.NotEmpty(t, resp.Error)
	})

	t.Run("invalid request body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/test", bytes.NewReader([]byte("invalid")))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		handler.Test(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		var resp models.GenericResponse
		require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
		assert.Contains(t, resp.Error, "invalid request body")
	})
}

func TestHealthEndpoint(t *testing.T) {
	mux := http.NewServeMux()
	manager := db.NewManager()
	RegisterRoutes(mux, manager)

	req := httptest.NewRequest("GET", "/health", nil)
	rr := httptest.NewRecorder()

	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp map[string]string
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "ok", resp["status"])
}
