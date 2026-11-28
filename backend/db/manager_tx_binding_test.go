package db

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// useShortWatchdog 把看门狗阈值调短（恢复由 t.Cleanup 负责）。
// 包级变量，改它的用例不能并行。
func useShortWatchdog(t *testing.T) {
	t.Helper()
	prev := txWatchdogTimeout
	txWatchdogTimeout = 250 * time.Millisecond
	t.Cleanup(func() { txWatchdogTimeout = prev })
}

// waitForTxGone 等看门狗回收会话事务，超过 5 秒仍在则由调用方的断言报出来
func waitForTxGone(t *testing.T, m *Manager, connID, session string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for m.HasTransaction(connID, session) && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
}

func countReg(t *testing.T, exec Executor, table string) int {
	t.Helper()
	var n int
	require.NoError(t, exec.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM "+table).Scan(&n))
	return n
}

// 看门狗按「空闲」计时：一直在执行语句的事务不会因为总时长到了被回滚
// （此前从 BEGIN 起算，用到第 5 分钟的事务会在用户手里凭空消失）。
func TestWatchdogMeasuresIdleTime(t *testing.T) {
	manager := NewManager()
	connID := "tx-idle-watchdog"
	require.NoError(t, manager.Connect(connID, ConnectArgs{
		DbType: "sqlite", Database: filepath.Join(t.TempDir(), "idle.db"),
	}))
	defer manager.Disconnect(connID)

	pool, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	_, err = pool.ExecContext(context.Background(), "CREATE TABLE reg (id INTEGER PRIMARY KEY, v TEXT)")
	require.NoError(t, err)

	t.Run("一直在用的事务不会被回滚", func(t *testing.T) {
		useShortWatchdog(t)
		require.NoError(t, manager.BeginTransaction(connID, "busy", ""))
		tx, err := manager.GetExecutorForSession(connID, "", "busy", true)
		require.NoError(t, err)

		// 总时长是阈值的三倍，但语句间隔远小于阈值
		const rounds = 12
		for i := 0; i < rounds; i++ {
			_, err := tx.ExecContext(context.Background(), "INSERT INTO reg (v) VALUES ('busy')")
			require.NoError(t, err)
			time.Sleep(60 * time.Millisecond)
		}
		assert.True(t, manager.HasTransaction(connID, "busy"), "busy tx must survive past the timeout")

		active, err := manager.CommitTransaction(connID, "busy")
		require.NoError(t, err)
		assert.True(t, active)
		assert.Equal(t, rounds, countReg(t, pool, "reg"))
	})

	t.Run("停下之后按空闲时间回收", func(t *testing.T) {
		useShortWatchdog(t)
		require.NoError(t, manager.BeginTransaction(connID, "idle", ""))
		tx, err := manager.GetExecutorForSession(connID, "", "idle", true)
		require.NoError(t, err)
		_, err = tx.ExecContext(context.Background(), "INSERT INTO reg (v) VALUES ('lost')")
		require.NoError(t, err)

		waitForTxGone(t, manager, connID, "idle")
		assert.False(t, manager.HasTransaction(connID, "idle"), "idle tx must be reaped")
		assert.Equal(t, 12, countReg(t, pool, "reg"), "reaped tx must have been rolled back")
	})

	t.Run("正在执行的语句算作活动", func(t *testing.T) {
		useShortWatchdog(t)
		require.NoError(t, manager.BeginTransaction(connID, "long", ""))
		tx, err := manager.GetExecutorForSession(connID, "", "long", true)
		require.NoError(t, err)

		// 模拟一条执行中的长语句：SQLite 里不好造真实的长查询，直接走它的活跃计数
		tracked := tx.(*trackedTx)
		tracked.statementDone(1)
		time.Sleep(3 * txWatchdogTimeout)
		assert.True(t, manager.HasTransaction(connID, "long"), "a running statement keeps the tx alive")
		tracked.statementDone(-1)

		waitForTxGone(t, manager, connID, "long")
		assert.False(t, manager.HasTransaction(connID, "long"))
	})
}

// 事务被看门狗回收后，同会话的语句不能悄悄变成自动提交：
// 调用方多半还以为在事务里（界面仍显示手动模式），放行就是逐条立即生效。
func TestTimedOutSessionDoesNotFallBackToAutocommit(t *testing.T) {
	manager := NewManager()
	connID := "tx-timed-out"
	require.NoError(t, manager.Connect(connID, ConnectArgs{
		DbType: "sqlite", Database: filepath.Join(t.TempDir(), "timed_out.db"),
	}))
	defer manager.Disconnect(connID)

	pool, err := manager.GetExecutor(connID, "")
	require.NoError(t, err)
	_, err = pool.ExecContext(context.Background(), "CREATE TABLE reg (id INTEGER PRIMARY KEY, v TEXT)")
	require.NoError(t, err)

	useShortWatchdog(t)
	require.NoError(t, manager.BeginTransaction(connID, "s", ""))
	tx, err := manager.GetExecutorForSession(connID, "", "s", true)
	require.NoError(t, err)
	_, err = tx.ExecContext(context.Background(), "INSERT INTO reg (v) VALUES ('discarded')")
	require.NoError(t, err)
	waitForTxGone(t, manager, connID, "s")
	require.False(t, manager.HasTransaction(connID, "s"))

	// 没要求事务的调用方（MCP / 编辑器的 DDL）与明确要求事务的调用方都拒绝，
	// 且都报更具体的原因——「没有事务」不如「已被超时回滚」能说明发生了什么
	for _, requireTx := range []bool{false, true} {
		_, err = manager.GetExecutorForSession(connID, "", "s", requireTx)
		require.Error(t, err, "session that lost its tx must not fall back to autocommit")
		assert.Contains(t, err.Error(), "rolled back by the "+txWatchdogTimeout.String()+" inactivity timeout")
	}
	assert.Equal(t, 0, countReg(t, pool, "reg"))

	// 别的会话不受影响：没有事务、也没有丢过事务的会话照常自动提交
	_, err = manager.GetExecutorForSession(connID, "", "fresh", false)
	require.NoError(t, err)

	t.Run("提交或回滚之后恢复自动提交", func(t *testing.T) {
		active, err := manager.RollbackTransaction(connID, "s")
		require.NoError(t, err)
		assert.False(t, active, "nothing left to roll back, but the caller has now been told")

		exec, err := manager.GetExecutorForSession(connID, "", "s", false)
		require.NoError(t, err)
		_, err = exec.ExecContext(context.Background(), "INSERT INTO reg (v) VALUES ('after ack')")
		require.NoError(t, err)
		assert.Equal(t, 1, countReg(t, pool, "reg"))
	})

	t.Run("重新开启事务同样解除", func(t *testing.T) {
		useShortWatchdog(t)
		require.NoError(t, manager.BeginTransaction(connID, "s", ""))
		waitForTxGone(t, manager, connID, "s")
		require.False(t, manager.HasTransaction(connID, "s"))

		require.NoError(t, manager.BeginTransaction(connID, "s", ""))
		tx, err := manager.GetExecutorForSession(connID, "", "s", true)
		require.NoError(t, err)
		_, err = tx.ExecContext(context.Background(), "INSERT INTO reg (v) VALUES ('reopened')")
		require.NoError(t, err)
		active, err := manager.CommitTransaction(connID, "s")
		require.NoError(t, err)
		assert.True(t, active)
		assert.Equal(t, 2, countReg(t, pool, "reg"))
	})
}

// 明确要求在事务里执行的调用方（编辑器手动模式 use_transaction=true）：会话没有事务就报错
func TestRequireTxWithoutTransaction(t *testing.T) {
	manager := NewManager()
	connID := "tx-require"
	require.NoError(t, manager.Connect(connID, ConnectArgs{
		DbType: "sqlite", Database: filepath.Join(t.TempDir(), "require.db"),
	}))
	defer manager.Disconnect(connID)

	_, err := manager.GetExecutorForSession(connID, "", "none", true)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no active transaction")

	// 没要求事务的调用方保持原语义：会话没有事务就走连接池
	_, err = manager.GetExecutorForSession(connID, "", "none", false)
	require.NoError(t, err)
}

// 事务开在该会话语句要落的库上，并且只认这个库：
// 此前事务固定开在连接默认库上，选了别的库的查询 Tab 在手动模式下会写到默认库去。
func TestTransactionIsBoundToItsDatabase(t *testing.T) {
	manager := NewManager()
	connID := "tx-db-bound"
	dir := t.TempDir()
	dbA, dbB := filepath.Join(dir, "a.db"), filepath.Join(dir, "b.db")
	require.NoError(t, manager.Connect(connID, ConnectArgs{DbType: "sqlite", Database: dbA}))
	defer manager.Disconnect(connID)

	poolA, err := manager.GetExecutor(connID, dbA)
	require.NoError(t, err)
	_, err = poolA.ExecContext(context.Background(), "CREATE TABLE reg (id INTEGER PRIMARY KEY, v TEXT)")
	require.NoError(t, err)

	// 表要先建在库 B 里（事务里建的表对外面不可见，没法用来自检）；库 B 的连接池由此建出来
	poolB, err := manager.GetExecutor(connID, dbB)
	require.NoError(t, err)
	_, err = poolB.ExecContext(context.Background(), "CREATE TABLE reg (id INTEGER PRIMARY KEY, v TEXT)")
	require.NoError(t, err)

	require.NoError(t, manager.BeginTransaction(connID, "s", dbB))
	tx, err := manager.GetExecutorForSession(connID, dbB, "s", true)
	require.NoError(t, err)
	ctx := context.Background()
	_, err = tx.ExecContext(ctx, "INSERT INTO reg (v) VALUES ('in b')")
	require.NoError(t, err)

	// 带着别的库（或不带库）来的语句：既不进这个事务，也不改成自动提交
	for _, other := range []string{"", dbA} {
		_, err := manager.GetExecutorForSession(connID, other, "s", false)
		require.Error(t, err, "statement for database %q must not join a tx opened on another database", other)
		assert.Contains(t, err.Error(), "commit or roll back the transaction first")
		_, err = manager.GetExecutorForSession(connID, other, "s", true)
		require.Error(t, err)
	}

	// 事务开着时换库重开：报错；同库重开：幂等成功
	err = manager.BeginTransaction(connID, "s", dbA)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already has a transaction open on")
	require.NoError(t, manager.BeginTransaction(connID, "s", dbB))

	assert.Equal(t, 0, countReg(t, poolB, "reg"), "uncommitted rows are invisible outside the tx")
	assert.Equal(t, 0, countReg(t, poolA, "reg"), "nothing may be written to the default database")

	active, err := manager.CommitTransaction(connID, "s")
	require.NoError(t, err)
	assert.True(t, active)
	assert.Equal(t, 1, countReg(t, poolB, "reg"))
	assert.Equal(t, 0, countReg(t, poolA, "reg"))
}

// 选中的库还没有连接池时，开事务会把它建出来，而不是退回连接默认库
func TestBeginTransactionCreatesDatabasePool(t *testing.T) {
	manager := NewManager()
	connID := "tx-db-pool"
	dir := t.TempDir()
	require.NoError(t, manager.Connect(connID, ConnectArgs{
		DbType: "sqlite", Database: filepath.Join(dir, "a.db"),
	}))
	defer manager.Disconnect(connID)

	dbC := filepath.Join(dir, "c.db")
	_, ok := manager.pools[databasePoolKey(connID, dbC)]
	require.False(t, ok)

	require.NoError(t, manager.BeginTransaction(connID, "s", dbC))
	_, ok = manager.pools[databasePoolKey(connID, dbC)]
	assert.True(t, ok, "begin must open the pool for the selected database")

	tx, err := manager.GetExecutorForSession(connID, dbC, "s", true)
	require.NoError(t, err)
	_, err = tx.ExecContext(context.Background(), "CREATE TABLE reg (id INTEGER PRIMARY KEY)")
	require.NoError(t, err)
	_, err = manager.CommitTransaction(connID, "s")
	require.NoError(t, err)
}
