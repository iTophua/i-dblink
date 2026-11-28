package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"idblink/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSplitQualifiedTableName(t *testing.T) {
	cases := []struct {
		name          string
		in            string
		wantQualifier string
		wantTable     string
	}{
		{"库.表", "shop.users", "shop", "users"},
		{"schema.表", "sales.orders", "sales", "orders"},
		{"不带限定", "users", "", "users"},
		{"三段不拆", "db.dbo.users", "", "db.dbo.users"},
		{"点在开头", ".users", "", ".users"},
		{"点在结尾", "users.", "", "users."},
		{"只有点", ".", "", "."},
		{"空名字", "", "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			qualifier, table := splitQualifiedTableName(c.in)
			assert.Equal(t, c.wantQualifier, qualifier)
			assert.Equal(t, c.wantTable, table)
		})
	}
}

// 只有 MySQL / PG 系 / SQL Server 把「限定部分.」当真；其余库按原名查，
// 名字里带点的表不能被拆开后查成别的表
func TestSupportsTableQualifier(t *testing.T) {
	for _, dbType := range []string{"mysql", "postgresql", "kingbase", "highgo", "vastbase", "sqlserver"} {
		assert.True(t, supportsTableQualifier(dbType), dbType)
	}
	for _, dbType := range []string{"sqlite", "oracle", "dameng", "clickhouse", "tdengine"} {
		assert.False(t, supportsTableQualifier(dbType), dbType)
	}
}

// SQLite 里名字本身带点的表：按原名就能查到列
func TestGetColumnsKeepsDottedTableNameForSQLite(t *testing.T) {
	handler := setupMetadataTest(t)

	queryBytes, _ := json.Marshal(models.QueryRequest{
		ConnectionID: "test-meta-conn",
		SQL:          `CREATE TABLE "a.users" (id INTEGER PRIMARY KEY, note TEXT)`,
	})
	req := httptest.NewRequest("POST", "/query", bytes.NewReader(queryBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.Query(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	tableName := "a.users"
	body := MetadataRequest{ConnectionID: "test-meta-conn", TableName: &tableName}
	bodyBytes, _ := json.Marshal(body)
	req = httptest.NewRequest("POST", "/columns", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	handler.GetColumns(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var columns []models.ColumnInfo
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&columns))
	names := make([]string, len(columns))
	for i, c := range columns {
		names[i] = c.ColumnName
	}
	assert.Equal(t, []string{"id", "note"}, names, "dotted table name must not be split into another table's columns")
}
