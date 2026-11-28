package db

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 真实数据库上的会话级事务冒烟测试。
//
// SQLite 池是单连接，manager_session_test.go 只能验证键控是否正确；「同连接多会话
// 真并发互不影响」「看门狗超时回滚」必须在连接池 > 1 的库上验证。
//
// 默认跳过。用仓库根目录的 docker-compose.test.yml 起库后开启：
//
//	docker compose -f docker-compose.test.yml up -d
//	IDBLINK_TX_SMOKE_MYSQL=1 IDBLINK_TX_SMOKE_PG=1 go test ./backend/db -run Real -v
//
// 连接参数默认取 compose 文件里的账号（注意两个库的密码不一样：MySQL 用户是 testpass，
// PG 用户是 testpassword），可用 IDBLINK_TX_MYSQL_ADDR / _USER / _PASS / _DB 覆盖（PG 同理，
// 前缀 IDBLINK_TX_PG_）。

type smokeDB struct {
	dbType string
	on     bool
	args   ConnectArgs
}

func smokeTarget(t *testing.T, dbType, flag, defAddr, defUser, defPass, defDB string) smokeDB {
	t.Helper()
	if os.Getenv(flag) != "1" {
		t.Skipf("set %s=1 to run against a real %s", flag, dbType)
	}
	env := func(suffix, def string) string {
		prefix := "IDBLINK_TX_" + map[string]string{"mysql": "MYSQL", "postgresql": "PG"}[dbType] + "_" + suffix
		if v := os.Getenv(prefix); v != "" {
			return v
		}
		return def
	}
	addr := env("ADDR", defAddr)
	host, portText, ok := splitHostPort(addr)
	require.True(t, ok, "bad address %q", addr)
	port, err := strconv.Atoi(portText)
	require.NoError(t, err)
	return smokeDB{
		dbType: dbType,
		on:     true,
		args: ConnectArgs{
			DbType: dbType, Host: host, Port: port,
			Username: env("USER", defUser), Password: env("PASS", defPass), Database: env("DB", defDB),
		},
	}
}

func splitHostPort(addr string) (string, string, bool) {
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i], addr[i+1:], true
		}
	}
	return "", "", false
}

// smokeFixture 一个真实库 + 一张专用表；表名带时间戳，多次运行互不干扰
type smokeFixture struct {
	manager *Manager
	connID  string
	table   string
	ph      func(n int) string // 占位符风格
	dialect string
}

func newSmokeFixture(t *testing.T, target smokeDB) *smokeFixture {
	t.Helper()
	if !target.on {
		t.Skip("smoke target disabled")
	}
	manager := NewManager()
	connID := "tx-smoke-" + target.dbType
	require.NoError(t, manager.Connect(connID, target.args))
	t.Cleanup(func() { _ = manager.Disconnect(connID) })

	pool, err := manager.GetPool(connID)
	require.NoError(t, err)
	f := &smokeFixture{
		manager: manager,
		connID:  connID,
		table:   fmt.Sprintf("tx_smoke_%d", time.Now().UnixNano()),
		ph:      func(n int) string { return "?" },
	}
	if pool.DbType != "mysql" && pool.DbType != "sqlite" {
		f.ph = func(n int) string { return "$" + strconv.Itoa(n) }
	}
	// 真连一次：库没起来时给出明确失败而不是后面莫名超时
	require.NoError(t, manager.Ping(connID), "cannot reach %s at %s:%d", target.dbType, target.args.Host, target.args.Port)

	exec, err := manager.GetExecutorNoTx(connID, "")
	require.NoError(t, err)
	_, err = exec.ExecContext(context.Background(), fmt.Sprintf("DROP TABLE IF EXISTS %s", f.table))
	require.NoError(t, err)
	_, err = exec.ExecContext(context.Background(),
		fmt.Sprintf("CREATE TABLE %s (id INT PRIMARY KEY, v VARCHAR(32))", f.table))
	require.NoError(t, err)
	t.Cleanup(func() {
		if exec, err := manager.GetExecutorNoTx(connID, ""); err == nil {
			_, _ = exec.ExecContext(context.Background(), fmt.Sprintf("DROP TABLE IF EXISTS %s", f.table))
		}
	})
	return f
}

func (f *smokeFixture) phs(n int) string {
	s := ""
	for i := 1; i <= n; i++ {
		if i > 1 {
			s += ", "
		}
		s += f.ph(i)
	}
	return s
}

// exec 在指定执行器上写入一行
func (f *smokeFixture) exec(t *testing.T, exec Executor, id int, v string) {
	t.Helper()
	_, err := exec.ExecContext(context.Background(),
		fmt.Sprintf("INSERT INTO %s (id, v) VALUES (%s)", f.table, f.phs(2)), id, v)
	require.NoError(t, err)
}

// rows 返回表外（自动提交）视角能看到的行数
func (f *smokeFixture) outsideRows(t *testing.T) int {
	t.Helper()
	exec, err := f.manager.GetExecutorNoTx(f.connID, "")
	require.NoError(t, err)
	rows, err := exec.QueryContext(context.Background(), fmt.Sprintf("SELECT id FROM %s", f.table))
	require.NoError(t, err)
	defer rows.Close()
	n := 0
	for rows.Next() {
		n++
	}
	require.NoError(t, rows.Err())
	return n
}

// count 在给定执行器的事务视角内数行
func (f *smokeFixture) count(t *testing.T, exec Executor) int {
	t.Helper()
	rows, err := exec.QueryContext(context.Background(), fmt.Sprintf("SELECT id FROM %s", f.table))
	require.NoError(t, err)
	defer rows.Close()
	n := 0
	for rows.Next() {
		n++
	}
	require.NoError(t, rows.Err())
	return n
}

func (f *smokeFixture) sessionExec(t *testing.T, session string) Executor {
	t.Helper()
	exec, err := f.manager.GetExecutorForSession(f.connID, "", session, false)
	require.NoError(t, err)
	return exec
}

// runSessionIsolation 两个会话同时开着事务、交叉读写：各自的提交 / 回滚只影响自己
func runSessionIsolation(t *testing.T, target smokeDB) {
	f := newSmokeFixture(t, target)
	require.NoError(t, f.manager.BeginTransaction(f.connID, "tab-a", ""))
	require.NoError(t, f.manager.BeginTransaction(f.connID, "tab-b", ""))
	a, b := f.sessionExec(t, "tab-a"), f.sessionExec(t, "tab-b")

	f.exec(t, a, 1, "from-a")
	// b 看不到 a 未提交的写入
	assert.Equal(t, 0, f.count(t, b), "session b must not see session a's uncommitted row")
	assert.Equal(t, 0, f.outsideRows(t), "outside readers must not see uncommitted rows")

	f.exec(t, b, 2, "from-b")
	// a 只看到自己写的那一行
	assert.Equal(t, 1, f.count(t, a), "session a must only see its own row")

	// 自动提交路径不被任一会话的事务捕获
	auto, err := f.manager.GetExecutorNoTx(f.connID, "")
	require.NoError(t, err)
	f.exec(t, auto, 100, "autocommit")
	assert.Equal(t, 1, f.outsideRows(t), "only the autocommit row is durable so far")

	// 提交 a：只落下 a 的行（和自动提交的那行）
	active, err := f.manager.CommitTransaction(f.connID, "tab-a")
	require.NoError(t, err)
	assert.True(t, active)
	assert.Equal(t, 2, f.outsideRows(t), "committing a must not commit b")

	// 回滚 b：b 的行消失，a 的行和自动提交的行都在
	active, err = f.manager.RollbackTransaction(f.connID, "tab-b")
	require.NoError(t, err)
	assert.True(t, active)
	assert.Equal(t, 2, f.outsideRows(t), "rolling back b must not touch a's committed row")

	// 两个会话都回到自动提交
	assert.False(t, f.manager.HasTransaction(f.connID, "tab-a"))
	assert.False(t, f.manager.HasTransaction(f.connID, "tab-b"))
	f.exec(t, f.sessionExec(t, "tab-a"), 3, "after")
	assert.Equal(t, 3, f.outsideRows(t))

	// 槽位空了以后提交/回滚是幂等的：不报错、返回 false
	active, err = f.manager.CommitTransaction(f.connID, "tab-a")
	require.NoError(t, err)
	assert.False(t, active)
	active, err = f.manager.RollbackTransaction(f.connID, "tab-b")
	require.NoError(t, err)
	assert.False(t, active)
}

// runNamedSessionIsolation 桌面查询 Tab / MCP / 导入 三个具名会话同连接并存
func runNamedSessionIsolation(t *testing.T, target smokeDB) {
	f := newSmokeFixture(t, target)
	sessions := []string{"sql-1730000000000-ab12cd", "mcp", "__import__"}
	for _, s := range sessions {
		require.NoError(t, f.manager.BeginTransaction(f.connID, s, ""))
		f.exec(t, f.sessionExec(t, s), len(s), "session-"+s)
	}
	// 事务进行中别的连接（连接 ID）不受影响
	assert.False(t, f.manager.HasTransaction("another-connection", "mcp"))

	_, err := f.manager.RollbackTransaction(f.connID, "sql-1730000000000-ab12cd")
	require.NoError(t, err)
	_, err = f.manager.CommitTransaction(f.connID, "mcp")
	require.NoError(t, err)
	_, err = f.manager.CommitTransaction(f.connID, "__import__")
	require.NoError(t, err)

	assert.Equal(t, 2, f.outsideRows(t), "only mcp and __import__ rows survive")
}

// runConcurrentSessions 多会话真并发：同时开事务、交错写、各自提交或回滚
func runConcurrentSessions(t *testing.T, target smokeDB) {
	f := newSmokeFixture(t, target)
	const n = 8
	var wg sync.WaitGroup
	errs := make(chan error, n*4)
	for i := 1; i <= n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			session := fmt.Sprintf("tab-%d", i)
			if err := f.manager.BeginTransaction(f.connID, session, ""); err != nil {
				errs <- err
				return
			}
			exec, err := f.manager.GetExecutorForSession(f.connID, "", session, false)
			if err != nil {
				errs <- err
				return
			}
			// 交错：奇数会话先歇一会儿再写，制造真实的并行窗口
			if i%2 == 1 {
				time.Sleep(time.Duration(20+i*7) * time.Millisecond)
			}
			if _, err := exec.ExecContext(context.Background(),
				fmt.Sprintf("INSERT INTO %s (id, v) VALUES (%s)", f.table, f.phs(2)), i, "parallel"); err != nil {
				errs <- err
				return
			}
			time.Sleep(time.Duration(10+i*5) * time.Millisecond)
			// 偶数提交、奇数回滚
			if i%2 == 0 {
				_, err = f.manager.CommitTransaction(f.connID, session)
			} else {
				_, err = f.manager.RollbackTransaction(f.connID, session)
			}
			if err != nil {
				errs <- err
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("concurrent session failed: %v", err)
	}
	assert.Equal(t, n/2, f.outsideRows(t), "exactly the committed sessions' rows must survive")
	for i := 1; i <= n; i++ {
		assert.False(t, f.manager.HasTransaction(f.connID, fmt.Sprintf("tab-%d", i)), "tx slot must be released")
	}
}

// runWatchdogRollback 事务超时被看门狗自动回滚；之后同一连接、同一会话都能正常再开事务。
//
// 超时阈值是全局的（调成了 400ms），所以这里新开的每个事务自己也只有 400ms 寿命，
// 必须在超时前提交——不能靠「等一会儿看它还在不在」来验证，那样测到的是它自己的看门狗。
func runWatchdogRollback(t *testing.T, target smokeDB) {
	f := newSmokeFixture(t, target)
	prev := txWatchdogTimeout
	txWatchdogTimeout = 400 * time.Millisecond
	t.Cleanup(func() { txWatchdogTimeout = prev })

	require.NoError(t, f.manager.BeginTransaction(f.connID, "watched", ""))
	f.exec(t, f.sessionExec(t, "watched"), 1, "should-vanish")

	deadline := time.Now().Add(5 * time.Second)
	for f.manager.HasTransaction(f.connID, "watched") && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	assert.False(t, f.manager.HasTransaction(f.connID, "watched"), "watchdog must release the timed-out tx")
	assert.Equal(t, 0, f.outsideRows(t), "timed-out tx must have been rolled back")

	// 回收之后，同会话的语句不能悄悄变成自动提交（调用方多半还以为在事务里）
	_, execErr := f.manager.GetExecutorForSession(f.connID, "", "watched", false)
	require.Error(t, execErr, "a session that lost its tx must not fall back to autocommit")
	assert.Equal(t, 0, f.outsideRows(t))

	// 被回滚后再提交：如实返回「没有待提交的事务」，不报错
	active, err := f.manager.CommitTransaction(f.connID, "watched")
	require.NoError(t, err)
	assert.False(t, active)

	// 同一会话马上开新事务：槽位已被看门狗释放，开得了、写得进、提交后生效
	require.NoError(t, f.manager.BeginTransaction(f.connID, "watched", ""))
	f.exec(t, f.sessionExec(t, "watched"), 2, "fresh")
	assert.True(t, f.manager.HasTransaction(f.connID, "watched"), "new tx on the same session must be alive")
	active, err = f.manager.CommitTransaction(f.connID, "watched")
	require.NoError(t, err)
	assert.True(t, active)
	assert.Equal(t, 1, f.outsideRows(t))

	// 换一个会话也开一个：各自有各自的看门狗，互不影响
	require.NoError(t, f.manager.BeginTransaction(f.connID, "watched", ""), "same session reused after watchdog")
	f.exec(t, f.sessionExec(t, "watched"), 3, "again")
	require.NoError(t, f.manager.BeginTransaction(f.connID, "other", ""))
	f.exec(t, f.sessionExec(t, "other"), 4, "other")
	for _, session := range []string{"watched", "other"} {
		active, err := f.manager.CommitTransaction(f.connID, session)
		require.NoError(t, err)
		assert.True(t, active)
	}
	assert.Equal(t, 3, f.outsideRows(t))

	// 事务里没提交的写入，在看门狗回滚后对自动提交的连接完全不可见
	require.NoError(t, f.manager.BeginTransaction(f.connID, "watched", ""))
	f.exec(t, f.sessionExec(t, "watched"), 5, "ghost")
	for f.manager.HasTransaction(f.connID, "watched") {
		time.Sleep(20 * time.Millisecond)
	}
	assert.Equal(t, 3, f.outsideRows(t))
}

func TestRealMySQLSessionTransactions(t *testing.T) {
	target := smokeTarget(t, "mysql", "IDBLINK_TX_SMOKE_MYSQL", "127.0.0.1:13306", "testuser", "testpass", "testdb")
	runSessionIsolation(t, target)
	runNamedSessionIsolation(t, target)
	runConcurrentSessions(t, target)
	runWatchdogRollback(t, target)
	runTxBoundToDatabase(t, target, "idblink_compare_a")
}

func TestRealPostgresSessionTransactions(t *testing.T) {
	target := smokeTarget(t, "postgresql", "IDBLINK_TX_SMOKE_PG", "127.0.0.1:15432", "testuser", "testpassword", "testdb")
	runSessionIsolation(t, target)
	runNamedSessionIsolation(t, target)
	runConcurrentSessions(t, target)
	runWatchdogRollback(t, target)
	// PG 的第二个库由测试自己建删（MySQL 那边 testuser 没有建库权限，用初始化脚本建好的库）
	otherDB := fmt.Sprintf("idblink_tx_other_%d", time.Now().UnixNano())
	createPGSmokeDatabase(t, target, otherDB)
	runTxBoundToDatabase(t, target, otherDB)
}

// createPGSmokeDatabase 建一个临时库，用例结束后删掉。要在 newSmokeFixture 之前调用：
// 清理按注册的逆序执行，删库必须排在连接池全部关闭之后
func createPGSmokeDatabase(t *testing.T, target smokeDB, name string) {
	t.Helper()
	run := func(sqlText string) {
		manager := NewManager()
		connID := "tx-smoke-pg-admin"
		require.NoError(t, manager.Connect(connID, target.args))
		defer manager.Disconnect(connID)
		pool, err := manager.GetExecutor(connID, "")
		require.NoError(t, err)
		_, err = pool.ExecContext(context.Background(), sqlText)
		require.NoError(t, err)
	}
	run("CREATE DATABASE " + name)
	t.Cleanup(func() { run("DROP DATABASE IF EXISTS " + name) })
}

// runTxBoundToDatabase 手动事务开在会话选中的库上，而不是连接的默认库。
// 此前事务固定开在默认库的连接池上，选了别的库的查询 Tab 在手动模式下会把
// 不带库名的语句写到默认库去。两个库里各建一张同名表：行只能出现在选中的那个库里。
func runTxBoundToDatabase(t *testing.T, target smokeDB, otherDB string) {
	f := newSmokeFixture(t, target)
	ctx := context.Background()

	otherPool, err := f.manager.GetExecutor(f.connID, otherDB)
	require.NoError(t, err)
	_, err = otherPool.ExecContext(ctx, fmt.Sprintf("CREATE TABLE %s (id INT PRIMARY KEY, v VARCHAR(32))", f.table))
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = otherPool.ExecContext(ctx, fmt.Sprintf("DROP TABLE IF EXISTS %s", f.table))
	})
	countOther := func() int {
		rows, err := otherPool.QueryContext(ctx, "SELECT id FROM "+f.table)
		require.NoError(t, err)
		defer rows.Close()
		n := 0
		for rows.Next() {
			n++
		}
		require.NoError(t, rows.Err())
		return n
	}

	require.NoError(t, f.manager.BeginTransaction(f.connID, "tab", otherDB))
	tx, err := f.manager.GetExecutorForSession(f.connID, otherDB, "tab", true)
	require.NoError(t, err)
	f.exec(t, tx, 1, "selected-db")

	assert.Equal(t, 0, countOther(), "uncommitted row must be invisible")
	assert.Equal(t, 0, f.outsideRows(t))

	// 带默认库（或不带库）来的同会话语句：不能进这个事务
	_, err = f.manager.GetExecutorForSession(f.connID, "", "tab", false)
	require.Error(t, err)

	active, err := f.manager.CommitTransaction(f.connID, "tab")
	require.NoError(t, err)
	assert.True(t, active)
	assert.Equal(t, 1, countOther(), "the row must land in the database the session selected")
	assert.Equal(t, 0, f.outsideRows(t), "the connection's default database must stay untouched")
}

// 真实库没开开关时，用例代码在 SQLite 上至少要能跑起来（否则长期没人开开关，
// 测试自己会腐烂而没人发现）。SQLite 池是单连接，同时只能有一个事务：
// 这里逐个会话开关，验证具名会话的键控互不串槽。
func TestRealNamedSessionFallbackOnSQLite(t *testing.T) {
	f := newSmokeFixture(t, smokeDB{
		on: true,
		args: ConnectArgs{
			DbType: "sqlite", Database: t.TempDir() + "/smoke.db",
		},
	})
	sessions := []string{"tab-1", "mcp", "__import__"}
	for _, s := range sessions {
		require.NoError(t, f.manager.BeginTransaction(f.connID, s, ""))
		for _, other := range sessions {
			assert.Equal(t, other == s, f.manager.HasTransaction(f.connID, other), "session %q vs %q", s, other)
		}
		active, err := f.manager.RollbackTransaction(f.connID, s)
		require.NoError(t, err)
		assert.True(t, active)
		for _, other := range sessions {
			assert.False(t, f.manager.HasTransaction(f.connID, other))
		}
	}
}
