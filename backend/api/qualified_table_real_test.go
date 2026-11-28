package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"idblink/backend/db"
	"idblink/backend/models"
)

// ── 真实库上的限定表名 ──
//
// 「库.表」「schema.表」的列定位只能在真库上验证（SQLite 没有这两层）。
// 开关与 backend/db 的事务冒烟共用：
//
//	docker compose -f docker-compose.test.yml up -d
//	IDBLINK_TX_SMOKE_MYSQL=1 IDBLINK_TX_SMOKE_PG=1 go test ./backend/api -run RealGetColumnsQualified -v

// 两处同名表，主键是不同的列：查限定名时拿到哪一边的主键一眼可辨
const (
	qcolsTable        = "qcols_same_name"
	qcolsDefaultTable = "CREATE TABLE qcols_same_name (id INT PRIMARY KEY, name VARCHAR(20))"
	qcolsOtherMySQL   = "CREATE TABLE idblink_compare_a.qcols_same_name (code VARCHAR(8) PRIMARY KEY, amount DECIMAL(10,2))"
	qcolsOtherPG      = "CREATE TABLE qcols_other.qcols_same_name (code VARCHAR(8) PRIMARY KEY, amount NUMERIC(10,2))"
)

func setupRealQualifiedColumns(t *testing.T, target realTarget) (*Handler, string) {
	t.Helper()
	host, portText, _ := strings.Cut(target.addr, ":")
	port, err := strconv.Atoi(portText)
	require.NoError(t, err)

	manager := db.NewManager()
	handler := &Handler{mgr: manager, tunnel: NewTunnelManager()}
	connID := "qcols-real-" + target.dbType
	require.NoError(t, manager.Connect(connID, db.ConnectArgs{
		DbType: target.dbType, Host: host, Port: port,
		Username: target.user, Password: target.pass, Database: target.dbName,
	}))
	t.Cleanup(func() { _ = manager.Disconnect(connID) })

	exec, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	ctx := context.Background()
	statements := []string{"DROP TABLE IF EXISTS qcols_same_name", qcolsDefaultTable}
	cleanup := []string{"DROP TABLE IF EXISTS qcols_same_name"}
	if target.dbType == "mysql" {
		other, err := manager.GetExecutor(connID, "idblink_compare_a")
		require.NoError(t, err)
		_, err = other.ExecContext(ctx, "DROP TABLE IF EXISTS qcols_same_name")
		require.NoError(t, err)
		t.Cleanup(func() {
			_, _ = other.ExecContext(ctx, "DROP TABLE IF EXISTS qcols_same_name")
		})
		statements = append(statements, qcolsOtherMySQL)
	} else {
		statements = append(statements,
			"DROP SCHEMA IF EXISTS qcols_other CASCADE", "CREATE SCHEMA qcols_other", qcolsOtherPG)
		cleanup = append(cleanup, "DROP SCHEMA IF EXISTS qcols_other CASCADE")
	}
	for _, stmt := range statements {
		_, err = exec.ExecContext(ctx, stmt)
		require.NoError(t, err, stmt)
	}
	t.Cleanup(func() {
		for _, stmt := range cleanup {
			_, _ = exec.ExecContext(ctx, stmt)
		}
	})
	return handler, connID
}

func realGetColumns(t *testing.T, handler *Handler, connID, tableName string) []models.ColumnInfo {
	t.Helper()
	body, _ := json.Marshal(MetadataRequest{ConnectionID: connID, TableName: &tableName})
	req := httptest.NewRequest("POST", "/columns", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.GetColumns(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)
	var columns []models.ColumnInfo
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&columns))
	return columns
}

func assertColumns(t *testing.T, columns []models.ColumnInfo, want ...string) {
	t.Helper()
	got := make([]string, len(columns))
	for i, c := range columns {
		pk := ""
		if c.ColumnKey != nil && *c.ColumnKey == "PRI" {
			pk = " (PK)"
		}
		got[i] = c.ColumnName + pk
	}
	assert.Equal(t, want, got)
}

func TestRealGetColumnsQualifiedTableMySQL(t *testing.T) {
	target := realERTarget(t, "mysql", "IDBLINK_TX_SMOKE_MYSQL", "IDBLINK_TX_MYSQL",
		"127.0.0.1:13306", "testuser", "testpass", "testdb")
	handler, connID := setupRealQualifiedColumns(t, target)

	// 不带限定：默认库里的表
	assertColumns(t, realGetColumns(t, handler, connID, qcolsTable), "id (PK)", "name")
	// 「库.表」：另一个库里的同名表，主键是它自己的
	assertColumns(t, realGetColumns(t, handler, connID, "idblink_compare_a."+qcolsTable),
		"code (PK)", "amount")
}

func TestRealGetColumnsQualifiedTablePostgres(t *testing.T) {
	target := realERTarget(t, "postgresql", "IDBLINK_TX_SMOKE_PG", "IDBLINK_TX_PG",
		"127.0.0.1:15432", "testuser", "testpassword", "testdb")
	handler, connID := setupRealQualifiedColumns(t, target)

	// 「schema.表」：只有这个 schema 里的表，不和其他 schema 的同名表混在一起
	assertColumns(t, realGetColumns(t, handler, connID, "qcols_other."+qcolsTable),
		"code (PK)", "amount")
	assertColumns(t, realGetColumns(t, handler, connID, "public."+qcolsTable), "id (PK)", "name")
}
