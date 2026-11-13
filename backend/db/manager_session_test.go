package db

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSessionScopedTransactionIsolation 会话级事务的核心语义：
// 同一连接的不同会话（查询 Tab / MCP）拥有独立事务槽位，互不影响。
// SQLite 池为单连接，无法真并发写，这里用「顺序开启/结束」验证键控正确性；
// 真实并发隔离需 MySQL/PG 等连接池 >1 的库做人工冒烟。
func TestSessionScopedTransactionIsolation(t *testing.T) {
	manager := NewManager()
	connID := "tx-session-isolation"
	require.NoError(t, manager.Connect(connID, ConnectArgs{
		DbType: "sqlite", Database: filepath.Join(t.TempDir(), "tx_sess.db"),
	}))
	defer manager.Disconnect(connID)

	pool, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	_, err = pool.ExecContext(context.Background(), "CREATE TABLE s (id INTEGER PRIMARY KEY, v TEXT)")
	require.NoError(t, err)

	// 会话 a 开启事务
	require.NoError(t, manager.BeginTransaction(connID, "a"))
	assert.True(t, manager.HasTransaction(connID, "a"))
	assert.False(t, manager.HasTransaction(connID, "b"), "同连接不同会话应互不影响")
	assert.False(t, manager.HasTransaction("other", "a"), "不同连接不应受影响")

	// 会话 a 的事务执行器写入
	txExec, err := manager.GetExecutorForSession(connID, "", "a")
	require.NoError(t, err)
	_, err = txExec.ExecContext(context.Background(), "INSERT INTO s (v) VALUES ('a')")
	require.NoError(t, err)

	// 提交 a；b 从未有事务，槽位保持独立
	active, err := manager.CommitTransaction(connID, "a")
	require.NoError(t, err)
	assert.True(t, active)
	assert.False(t, manager.HasTransaction(connID, "a"))
	assert.False(t, manager.HasTransaction(connID, "b"))

	// 会话 b 独立开启并回滚
	require.NoError(t, manager.BeginTransaction(connID, "b"))
	assert.True(t, manager.HasTransaction(connID, "b"))
	assert.False(t, manager.HasTransaction(connID, "a"))
	active, err = manager.RollbackTransaction(connID, "b")
	require.NoError(t, err)
	assert.True(t, active)
	assert.False(t, manager.HasTransaction(connID, "b"))

	// 空 session 拒绝开启事务
	err = manager.BeginTransaction(connID, "")
	require.Error(t, err)
}
