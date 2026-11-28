package api

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"idblink/backend/db"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestClickHouseSmoke 对真实 ClickHouse/AIoTHouse 服务的端到端冒烟：
// 驱动拨号（clickhouse-go v2 HTTP）+ 四条元数据 SQL。默认 skip，
// 需要时用环境变量开启：
//
//	IDBLINK_CH_ADDR=172.98.14.41:18123 IDBLINK_CH_USER=xxx IDBLINK_CH_PASS=xxx \
//	IDBLINK_CH_DB=ems_aiot go test ./backend/api -run TestClickHouseSmoke -v
func TestClickHouseSmoke(t *testing.T) {
	addr := os.Getenv("IDBLINK_CH_ADDR")
	user := os.Getenv("IDBLINK_CH_USER")
	pass := os.Getenv("IDBLINK_CH_PASS")
	dbName := os.Getenv("IDBLINK_CH_DB")
	if addr == "" || user == "" || dbName == "" {
		t.Skip("set IDBLINK_CH_ADDR / IDBLINK_CH_USER / IDBLINK_CH_PASS / IDBLINK_CH_DB to run")
	}
	hostPort := strings.SplitN(addr, ":", 2)
	require.Len(t, hostPort, 2, "IDBLINK_CH_ADDR must be host:port")

	mgr := db.NewManager()
	connID := "smoke-ch"
	require.NoError(t, mgr.Connect(connID, db.ConnectArgs{
		DbType: "clickhouse", Host: hostPort[0], Port: atoi(t, hostPort[1]),
		Username: user, Password: pass, Database: dbName,
	}))
	defer mgr.Disconnect(connID)

	exec, err := mgr.GetExecutor(connID, dbName)
	require.NoError(t, err)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 1. 事务守卫：CH 必须明确拒绝交互式事务
	err = mgr.BeginTransaction(connID, "smoke", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "does not support interactive transactions")

	// 2. 库列表
	dbs, err := clickhouseGetDatabases(ctx, exec)
	require.NoError(t, err)
	assert.Contains(t, dbs, dbName)
	t.Logf("databases(%d): %v", len(dbs), dbs)

	// 3. 表/视图分类（真实 system.tables SQL 形态）
	dbPtr := &dbName
	tables, err := clickhouseGetTablesCategorized(ctx, exec, dbPtr, nil)
	require.NoError(t, err)
	t.Logf("tables=%d views=%d", len(tables.Tables), len(tables.Views))
	require.NotEmpty(t, tables.Tables, "ems_aiot 应有表")
	var firstTable string
	for _, tb := range tables.Tables {
		t.Logf("  table=%s engine=%s rows=%s size=%s", tb.TableName, strOrNil(tb.Engine), uint64OrNil(tb.RowCount), strOrNil(tb.DataSize))
		if firstTable == "" {
			firstTable = tb.TableName
		}
	}

	// 4. 列信息 + 表结构
	require.NotEmpty(t, firstTable)
	cols, err := clickhouseGetColumns(ctx, exec, firstTable, dbPtr)
	require.NoError(t, err)
	require.NotEmpty(t, cols)
	for _, c := range cols {
		t.Logf("  col=%s type=%s key=%s", c.ColumnName, c.DataType, strOrNil(c.ColumnKey))
	}
	structure, err := clickhouseGetTableStructure(ctx, exec, firstTable, dbPtr)
	require.NoError(t, err)
	assert.NotEmpty(t, structure.Columns)

	// 5. DDL
	ddl, err := clickhouseGetTableDDL(ctx, exec, firstTable, dbName)
	require.NoError(t, err)
	assert.Contains(t, strings.ToUpper(ddl), "CREATE TABLE")
	t.Logf("ddl head: %s", truncate(ddl, 120))

	// 6. 全库列（SQL 补全路径）
	allCols, err := clickhouseGetAllColumns(ctx, exec, dbPtr)
	require.NoError(t, err)
	assert.NotEmpty(t, allCols.Tables)
}

func atoi(t *testing.T, s string) int {
	t.Helper()
	var n int
	for _, ch := range s {
		require.True(t, ch >= '0' && ch <= '9', "bad port: %s", s)
		n = n*10 + int(ch-'0')
	}
	return n
}

func strOrNil(p *string) string {
	if p == nil {
		return "<nil>"
	}
	return *p
}

func uint64OrNil(p *uint64) string {
	if p == nil {
		return "<nil>"
	}
	return formatUint(*p)
}

func formatUint(n uint64) string {
	if n < 1000 {
		return itoa(int(n))
	}
	return itoa(int(n)) // 小表足够；大表看 UI 格式化
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
