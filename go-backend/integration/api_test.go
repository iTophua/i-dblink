package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"idblink-backend/api"
	"idblink-backend/db"
	"idblink-backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupIntegrationServer(t *testing.T) *httptest.Server {
	manager := db.NewManager()
	mux := http.NewServeMux()
	api.RegisterRoutes(mux, manager)
	return httptest.NewServer(mux)
}

func TestIntegrationFullFlow(t *testing.T) {
	server := setupIntegrationServer(t)
	defer server.Close()

	client := server.Client()
	baseURL := server.URL

	t.Run("health check", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/health")
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var result map[string]string
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
		assert.Equal(t, "ok", result["status"])
	})

	t.Run("connect and query flow", func(t *testing.T) {
		// 1. Connect to SQLite
		connectReq := models.ConnectRequest{
			ConnectionID: "integration-test-conn",
			DbType:       "sqlite",
			Database:     ":memory:",
		}
		connectBytes, _ := json.Marshal(connectReq)
		resp, err := client.Post(baseURL+"/connect", "application/json", bytes.NewReader(connectBytes))
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var connectResp models.ConnectResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&connectResp))
		assert.Equal(t, "integration-test-conn", connectResp.ConnectionID)
		assert.Empty(t, connectResp.Error)

		// 2. Create table
		ddlReq := models.ExecuteDDLRequest{
			ConnectionID: "integration-test-conn",
			SQL:          "CREATE TABLE integration_test (id INTEGER PRIMARY KEY, name TEXT)",
		}
		ddlBytes, _ := json.Marshal(ddlReq)
		resp, err = client.Post(baseURL+"/execute-ddl", "application/json", bytes.NewReader(ddlBytes))
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var ddlResp models.GenericResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&ddlResp))
		assert.Empty(t, ddlResp.Error)

		// 3. Insert data
		queryReq := models.QueryRequest{
			ConnectionID: "integration-test-conn",
			SQL:          "INSERT INTO integration_test (name) VALUES ('Alice'), ('Bob')",
		}
		queryBytes, _ := json.Marshal(queryReq)
		resp, err = client.Post(baseURL+"/query", "application/json", bytes.NewReader(queryBytes))
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		// 4. Query data
		queryReq.SQL = "SELECT * FROM integration_test ORDER BY id"
		queryBytes, _ = json.Marshal(queryReq)
		resp, err = client.Post(baseURL+"/query", "application/json", bytes.NewReader(queryBytes))
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var queryResp models.QueryResult
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&queryResp))
		assert.Empty(t, queryResp.Error)
		assert.Len(t, queryResp.Rows, 2)
		assert.Equal(t, "Alice", queryResp.Rows[0][1])
		assert.Equal(t, "Bob", queryResp.Rows[1][1])

		// 5. Get tables
		metaReq := api.MetadataRequest{
			ConnectionID: "integration-test-conn",
		}
		metaBytes, _ := json.Marshal(metaReq)
		resp, err = client.Post(baseURL+"/tables", "application/json", bytes.NewReader(metaBytes))
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var tables []models.TableInfo
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&tables))
		assert.GreaterOrEqual(t, len(tables), 1)

		// 6. Disconnect
		disconnectReq := models.DisconnectRequest{ConnectionID: "integration-test-conn"}
		disconnectBytes, _ := json.Marshal(disconnectReq)
		resp, err = client.Post(baseURL+"/disconnect", "application/json", bytes.NewReader(disconnectBytes))
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var disconnectResp models.GenericResponse
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&disconnectResp))
		assert.Empty(t, disconnectResp.Error)
	})

	t.Run("transaction flow", func(t *testing.T) {
		// Connect
		connectReq := models.ConnectRequest{
			ConnectionID: "tx-integration-conn",
			DbType:       "sqlite",
			Database:     ":memory:",
		}
		connectBytes, _ := json.Marshal(connectReq)
		resp, err := client.Post(baseURL+"/connect", "application/json", bytes.NewReader(connectBytes))
		require.NoError(t, err)
		defer resp.Body.Close()

		// Create table
		ddlReq := models.ExecuteDDLRequest{
			ConnectionID: "tx-integration-conn",
			SQL:          "CREATE TABLE tx_integration (id INTEGER PRIMARY KEY, value TEXT)",
		}
		ddlBytes, _ := json.Marshal(ddlReq)
		resp, err = client.Post(baseURL+"/execute-ddl", "application/json", bytes.NewReader(ddlBytes))
		require.NoError(t, err)
		resp.Body.Close()

		// Begin transaction
		beginReq := models.DisconnectRequest{ConnectionID: "tx-integration-conn"}
		beginBytes, _ := json.Marshal(beginReq)
		resp, err = client.Post(baseURL+"/begin-transaction", "application/json", bytes.NewReader(beginBytes))
		require.NoError(t, err)
		resp.Body.Close()

		// Insert in transaction
		queryReq := models.QueryRequest{
			ConnectionID: "tx-integration-conn",
			SQL:          "INSERT INTO tx_integration (value) VALUES ('test_value')",
		}
		queryBytes, _ := json.Marshal(queryReq)
		resp, err = client.Post(baseURL+"/query", "application/json", bytes.NewReader(queryBytes))
		require.NoError(t, err)
		resp.Body.Close()

		// Commit
		commitReq := models.DisconnectRequest{ConnectionID: "tx-integration-conn"}
		commitBytes, _ := json.Marshal(commitReq)
		resp, err = client.Post(baseURL+"/commit-transaction", "application/json", bytes.NewReader(commitBytes))
		require.NoError(t, err)
		resp.Body.Close()

		// Verify data
		queryReq.SQL = "SELECT * FROM tx_integration WHERE value = 'test_value'"
		queryBytes, _ = json.Marshal(queryReq)
		resp, err = client.Post(baseURL+"/query", "application/json", bytes.NewReader(queryBytes))
		require.NoError(t, err)
		defer resp.Body.Close()

		var queryResp models.QueryResult
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&queryResp))
		assert.Len(t, queryResp.Rows, 1)
	})

	t.Run("error handling", func(t *testing.T) {
		// Query with non-existent connection
		queryReq := models.QueryRequest{
			ConnectionID: "non-existent",
			SQL:          "SELECT 1",
		}
		queryBytes, _ := json.Marshal(queryReq)
		resp, err := client.Post(baseURL+"/query", "application/json", bytes.NewReader(queryBytes))
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var queryResp models.QueryResult
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&queryResp))
		assert.NotEmpty(t, queryResp.Error)
	})
}

func TestIntegrationMultipleConnections(t *testing.T) {
	server := setupIntegrationServer(t)
	defer server.Close()

	client := server.Client()
	baseURL := server.URL

	// Create multiple connections
	connections := []string{"conn-1", "conn-2", "conn-3"}
	for _, connID := range connections {
		connectReq := models.ConnectRequest{
			ConnectionID: connID,
			DbType:       "sqlite",
			Database:     ":memory:",
		}
		connectBytes, _ := json.Marshal(connectReq)
		resp, err := client.Post(baseURL+"/connect", "application/json", bytes.NewReader(connectBytes))
		require.NoError(t, err)
		resp.Body.Close()
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	}

	// Verify each connection works independently
	for _, connID := range connections {
		queryReq := models.QueryRequest{
			ConnectionID: connID,
			SQL:          "SELECT 1 as num",
		}
		queryBytes, _ := json.Marshal(queryReq)
		resp, err := client.Post(baseURL+"/query", "application/json", bytes.NewReader(queryBytes))
		require.NoError(t, err)

		var queryResp models.QueryResult
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&queryResp))
		resp.Body.Close()
		assert.Empty(t, queryResp.Error)
		assert.Len(t, queryResp.Rows, 1)
	}

	// Disconnect all
	for _, connID := range connections {
		disconnectReq := models.DisconnectRequest{ConnectionID: connID}
		disconnectBytes, _ := json.Marshal(disconnectReq)
		resp, err := client.Post(baseURL+"/disconnect", "application/json", bytes.NewReader(disconnectBytes))
		require.NoError(t, err)
		resp.Body.Close()
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	}
}
