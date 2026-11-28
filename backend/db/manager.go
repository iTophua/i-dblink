package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"
)

// isSQLite 判断是否为 SQLite 类型（单文件、写入需串行化）
func isSQLite(dbType string) bool {
	return dbType == "sqlite" || dbType == "sqlite3"
}

// Executor 统一的数据库执行器接口（*sql.DB / *sql.Tx / *sql.Conn 均实现）
type Executor interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

// connInfo 保存连接池及其类型和参数
type connInfo struct {
	db     *sql.DB
	dbType string
	args   ConnectArgs // 保存连接参数以便创建带数据库的连接
}

// txInfo 保存活跃事务
type txInfo struct {
	conn *sql.Conn
	tx   *sql.Tx
	// database 事务开在哪个库的连接池上（空 = 连接默认库）。事务创建后不再变：
	// 同一会话的语句只有带着同一个库来才能进这个事务
	database string
	started  time.Time
	// done 在 Commit/Rollback/超时回收后 close，用于停止看门狗 goroutine
	done chan struct{}
	// 以下两个字段由 m.mu 保护，看门狗据此判断事务是否还在使用
	lastActive time.Time // 最近一条语句开始 / 结束的时刻
	inflight   int       // 正在执行的语句数
}

// trackedTx 会话事务的执行器：语句开始 / 结束时更新事务的活跃状态，
// 看门狗按「最近一条语句」计时，而不是按「事务开启」计时
type trackedTx struct {
	m    *Manager
	key  string
	info *txInfo
}

func (t *trackedTx) statementDone(delta int) {
	t.m.mu.Lock()
	// 槽位里已经换了别的事务（提交 / 回滚之后）就不再碰它
	if cur, ok := t.m.txs[t.key]; ok && cur == t.info {
		cur.inflight += delta
		cur.lastActive = time.Now()
	}
	t.m.mu.Unlock()
}

func (t *trackedTx) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	t.statementDone(1)
	defer t.statementDone(-1)
	return t.info.tx.ExecContext(ctx, query, args...)
}

func (t *trackedTx) QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	t.statementDone(1)
	defer t.statementDone(-1)
	return t.info.tx.QueryContext(ctx, query, args...)
}

func (t *trackedTx) QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row {
	t.statementDone(1)
	defer t.statementDone(-1)
	return t.info.tx.QueryRowContext(ctx, query, args...)
}

// txDatabaseLabel 库名在报错里的写法（空库说成「连接默认库」而不是一对空引号）
func txDatabaseLabel(database string) string {
	if database == "" {
		return "the connection's default database"
	}
	return fmt.Sprintf("database %q", database)
}

// connectCancelEntry 包装取消函数：Go 的函数值不可用 == 比较，用指针做身份判断
type connectCancelEntry struct{ cancel context.CancelFunc }

// Manager 管理所有数据库连接池
type Manager struct {
	mu             sync.RWMutex
	pools          map[string]*connInfo
	txs            map[string]*txInfo
	txTimedOut     map[string]struct{}            // 上一笔事务被看门狗超时回滚的会话
	connectCancels map[string]*connectCancelEntry // 进行中的连接，可被 CancelConnect 取消
}

// NewManager 创建连接管理器
func NewManager() *Manager {
	return &Manager{
		pools:          make(map[string]*connInfo),
		txs:            make(map[string]*txInfo),
		txTimedOut:     make(map[string]struct{}),
		connectCancels: make(map[string]*connectCancelEntry),
	}
}

// SSHTunnelArgs SSH 隧道参数
type SSHTunnelArgs struct {
	Enabled        bool
	Host           string
	Port           int
	Username       string
	AuthMethod     string
	Password       string
	PrivateKeyPath string
	Passphrase     string
}

// SSLArgs SSL/TLS 参数
type SSLArgs struct {
	Enabled    bool
	CAPath     string
	CertPath   string
	KeyPath    string
	SkipVerify bool
}

// ConnectArgs 连接参数
type ConnectArgs struct {
	DbType   string
	Host     string
	Port     int
	Username string
	Password string
	Database string
	SSH      SSHTunnelArgs
	SSL      SSLArgs
}

// Connect 建立数据库连接
func (m *Manager) Connect(connectionID string, req ConnectArgs) error {
	if connectionID == "" {
		return fmt.Errorf("connection_id is required")
	}

	m.mu.Lock()
	if _, exists := m.pools[connectionID]; exists {
		m.mu.Unlock()
		return fmt.Errorf("connection %s already exists", connectionID)
	}
	m.mu.Unlock()

	db, err := openDB(req)
	if err != nil {
		return err
	}

	// SQLite 单文件写入需要串行化（非 WAL 模式下并发会 database is locked 甚至损坏）
	// 其他数据库保留合理的连接池大小
	if isSQLite(req.DbType) {
		db.SetMaxOpenConns(1)
		db.SetMaxIdleConns(1)
	} else {
		db.SetMaxOpenConns(10)
		db.SetMaxIdleConns(5)
	}
	db.SetConnMaxLifetime(time.Hour)
	db.SetConnMaxIdleTime(time.Minute * 10)

	// ping ctx 可被 CancelConnect 取消（网络不通时用户不必等拨号超时）
	pingCtx, cancelPing := context.WithCancel(context.Background())
	cancelEntry := &connectCancelEntry{cancel: cancelPing}
	m.mu.Lock()
	m.connectCancels[connectionID] = cancelEntry
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		// 仅当仍是本次注册的条目才清理（CancelConnect 已抢先删除时不动作）
		if cur, ok := m.connectCancels[connectionID]; ok && cur == cancelEntry {
			delete(m.connectCancels, connectionID)
		}
		m.mu.Unlock()
		cancelPing()
	}()

	// 瞬时网络未就绪（首次访问本地网络权限/路由刚建立）时内核立即返回
	// EHOSTUNREACH 类错误——重试即恢复。带退避自动重试，避免"首次连接
	// 报 no route to host、手动重试才成功"。只匹配即时失败类错误，
	// 认证错误、超时、连接拒绝不会重试（重试也无济于事）
	retryDelays := []time.Duration{500 * time.Millisecond, time.Second, 2 * time.Second}
	var pingErr error
	for attempt := 0; ; attempt++ {
		pingTimeoutCtx, cancel := context.WithTimeout(pingCtx, 15*time.Second)
		pingErr = db.PingContext(pingTimeoutCtx)
		cancel()
		if pingErr == nil || pingCtx.Err() != nil {
			break
		}
		if attempt >= len(retryDelays) || !isTransientNetworkError(pingErr) {
			break
		}
		select {
		case <-time.After(retryDelays[attempt]):
		case <-pingCtx.Done():
		}
	}
	if pingErr != nil {
		_ = db.Close()
		if pingCtx.Err() != nil {
			return fmt.Errorf("connection cancelled")
		}
		return fmt.Errorf("ping failed: %w", pingErr)
	}

	m.mu.Lock()
	m.pools[connectionID] = &connInfo{db: db, dbType: req.DbType, args: req}
	m.mu.Unlock()

	return nil
}

// CancelConnect 取消进行中的连接（或断开刚建立完成的连接）。
// 网络不通时拨号可能长时间等待，用户可主动取消而不必等超时。
func (m *Manager) CancelConnect(connectionID string) error {
	m.mu.Lock()
	// 进行中：取消拨号/握手等待
	cancelEntry, connecting := m.connectCancels[connectionID]
	if connecting {
		delete(m.connectCancels, connectionID)
	}
	// 已完成注册：取消语义等同断开
	info, connected := m.pools[connectionID]
	if connected {
		delete(m.pools, connectionID)
	}
	databaseDbs := m.takeDatabasePools(connectionID)
	m.mu.Unlock()

	if connecting {
		cancelEntry.cancel()
	}
	if connected {
		_ = info.db.Close()
	}
	closePools(databaseDbs)
	return nil
}

// takeDatabasePools 摘掉某个连接上按库打开的连接池（键是「连接 ID:库名」），调用方负责关闭。
// 断开 / 取消时必须一起清掉：PG 不能在连接上切库，每选一个库就单开一个连接池，留着的话
// 重连之后按库的查询仍走旧的那套——改了地址、密码，或 SSH 隧道换了本地端口之后，
// 会一直连着旧的那套，直到重启应用。调用方需持有 m.mu
func (m *Manager) takeDatabasePools(connectionID string) []*sql.DB {
	prefix := connectionID + ":"
	var dbs []*sql.DB
	for key, info := range m.pools {
		if strings.HasPrefix(key, prefix) {
			delete(m.pools, key)
			dbs = append(dbs, info.db)
		}
	}
	return dbs
}

func closePools(dbs []*sql.DB) {
	for _, databaseDB := range dbs {
		_ = databaseDB.Close()
	}
}

// Disconnect 断开连接并释放连接池
func (m *Manager) Disconnect(connectionID string) error {
	m.mu.Lock()
	info, ok := m.pools[connectionID]
	if ok {
		delete(m.pools, connectionID)
	}
	// 按库打开的连接池也要关：即使主连接池已经不在了（比如被 CancelConnect 摘掉），也不能留着
	databaseDbs := m.takeDatabasePools(connectionID)
	// 如果有活跃事务（任一会话），先全部回滚
	prefix := connectionID + txKeySep
	for key, txInfo := range m.txs {
		if strings.HasPrefix(key, prefix) {
			delete(m.txs, key)
			close(txInfo.done) // 通知看门狗停止
			_ = txInfo.tx.Rollback()
			_ = txInfo.conn.Close()
		}
	}
	// 重连之后是全新的连接，旧事务的「超时被回滚」不再有意义
	for key := range m.txTimedOut {
		if strings.HasPrefix(key, prefix) {
			delete(m.txTimedOut, key)
		}
	}
	m.mu.Unlock()

	closePools(databaseDbs)

	if !ok {
		return fmt.Errorf("connection %s not found", connectionID)
	}

	return info.db.Close()
}

// Ping 检测数据库连接是否存活
func (m *Manager) Ping(connID string) error {
	m.mu.RLock()
	info, ok := m.pools[connID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("connection %s not found", connID)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return info.db.PingContext(ctx)
}

// Get 获取已存在的连接池
func (m *Manager) Get(connectionID string) (*sql.DB, error) {
	m.mu.RLock()
	info, ok := m.pools[connectionID]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("connection %s not found", connectionID)
	}

	return info.db, nil
}

// DBPool 数据库连接池结构体
type DBPool struct {
	db      *sql.DB
	DbType  string
	pool    *sql.DB // 连接池引用
	maxPool int     // 最大连接数
	minPool int     // 最小连接数
}

// DB 返回底层 *sql.DB
func (p *DBPool) DB() *sql.DB {
	return p.db
}

// GetPool 获取连接池及其类型信息
func (m *Manager) GetPool(connectionID string) (*DBPool, error) {
	m.mu.RLock()
	info, ok := m.pools[connectionID]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("connection %s not found", connectionID)
	}

	// 返回增强的连接池信息
	return &DBPool{
		db:      info.db,
		DbType:  info.dbType,
		pool:    info.db,
		maxPool: 10, // 默认最大连接数
		minPool: 2,  // 默认最小连接数
	}, nil
}

// GetDBType 获取连接的数据库类型
func (m *Manager) GetDBType(connectionID string) (string, error) {
	m.mu.RLock()
	info, ok := m.pools[connectionID]
	m.mu.RUnlock()

	if !ok {
		return "", fmt.Errorf("connection %s not found", connectionID)
	}

	return info.dbType, nil
}

// GetConnectArgs 获取连接的参数
func (m *Manager) GetConnectArgs(connectionID string) (ConnectArgs, error) {
	m.mu.RLock()
	info, ok := m.pools[connectionID]
	m.mu.RUnlock()

	if !ok {
		return ConnectArgs{}, fmt.Errorf("connection %s not found", connectionID)
	}

	return info.args, nil
}

// databasePoolKey 「连接 ID:库名」形式的按库连接池键
func databasePoolKey(connectionID, database string) string {
	return connectionID + ":" + database
}

// ConnectWithDatabase 建立指定数据库的连接
func (m *Manager) ConnectWithDatabase(connectionID string, database string) error {
	m.mu.RLock()
	info, ok := m.pools[connectionID]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("connection %s not found", connectionID)
	}

	key := databasePoolKey(connectionID, database)

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.pools[key]; exists {
		return nil
	}

	dbArgs := info.args
	dbArgs.Database = database
	db, err := openDB(dbArgs)
	if err != nil {
		return err
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)
	db.SetConnMaxIdleTime(time.Minute * 10)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return fmt.Errorf("ping failed: %w", err)
	}

	m.pools[key] = &connInfo{db: db, dbType: dbArgs.DbType, args: dbArgs}
	return nil
}

// GetWithDatabase 获取指定数据库的连接，如果不存在则创建
func (m *Manager) GetWithDatabase(connectionID string, database string) (*sql.DB, error) {
	key := databasePoolKey(connectionID, database)

	m.mu.RLock()
	info, ok := m.pools[key]
	m.mu.RUnlock()

	if ok {
		return info.db, nil
	}

	// 连接不存在，尝试创建
	if err := m.ConnectWithDatabase(connectionID, database); err != nil {
		return nil, err
	}

	m.mu.RLock()
	info, ok = m.pools[key]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("failed to create connection for database %s", database)
	}

	return info.db, nil
}

// txKeySep 事务槽位键分隔符：连接 ID 与会话 ID（查询 Tab / MCP）之间用 NUL 分隔，
// 保证「连接 A 会话 1」与「连接 A\x00B 会话 1」不会碰撞。
const txKeySep = "\x00"

// txWatchdogTimeout 事务空闲多久被看门狗自动回滚（从最近一条语句结束算起）。
// 包级变量仅为让测试缩短等待，生产路径保持 5 分钟。
var txWatchdogTimeout = 5 * time.Minute

// txKey 构造事务槽位键。会话级隔离：同一连接的不同查询 Tab、MCP 各自拥有独立事务。
func txKey(connectionID, sessionID string) string {
	return connectionID + txKeySep + sessionID
}

// BeginTransaction 开启会话级事务（sessionID 为空表示调用方未提供会话，拒绝开启）。
//
// database 是这个会话的语句要落的库（空 = 连接默认库）。事务固定开在该库的连接池上：
// PG 不能在连接上切库，默认库上开的事务对别的库不可见；MySQL 不带库名的语句会落到
// 默认库。不开在同一个池上，同一条语句在自动提交和手动事务下会写到不同的库。
func (m *Manager) BeginTransaction(connectionID, sessionID, database string) error {
	if sessionID == "" {
		return fmt.Errorf("session_id is required to begin a transaction")
	}

	key := txKey(connectionID, sessionID)
	// 已有事务且是同一个库：幂等成功，避免前端状态错位后再也进不了事务
	reopenErr := func(cur *txInfo) error {
		if cur.database == database {
			return nil
		}
		// 换了库：一笔事务跨不了两个连接池
		return fmt.Errorf("this session already has a transaction open on %s; commit or roll back it before opening one on %s",
			txDatabaseLabel(cur.database), txDatabaseLabel(database))
	}
	m.mu.RLock()
	cur, exists := m.txs[key]
	m.mu.RUnlock()
	if exists {
		return reopenErr(cur)
	}

	// ClickHouse/TDengine 无交互式事务：明确报错而非静默成功，前端事务按钮据此提示
	// （语句各自原子提交，无需事务也够用）。先判再取池，免得白建一个按库的连接池
	dbType, err := m.GetDBType(connectionID)
	if err != nil {
		return err
	}
	if !SupportsTx(dbType) {
		return fmt.Errorf("%s does not support interactive transactions", dbType)
	}

	// 按库的池要在锁外拿：ConnectWithDatabase 自己会加锁
	var pool *connInfo
	if database != "" {
		if _, err := m.GetWithDatabase(connectionID, database); err != nil {
			return err
		}
		m.mu.RLock()
		pool = m.pools[databasePoolKey(connectionID, database)]
		m.mu.RUnlock()
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// 并发开启：后到的那次直接返回
	if cur, exists := m.txs[key]; exists {
		return reopenErr(cur)
	}

	if pool == nil {
		info, ok := m.pools[connectionID]
		if !ok {
			return fmt.Errorf("connection %s not found", connectionID)
		}
		pool = info
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := pool.db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("failed to reserve connection: %w", err)
	}

	// 传给 BeginTx 的 ctx 会绑定整个事务生命周期：ctx 一取消 database/sql
	// 就自动回滚事务。因此这里绝不能用函数级 ctx + defer cancel——那样
	// Begin 返回的瞬间事务即被回滚，事务内所有语句都会报 ErrTxDone。
	// 事务生命周期由 Commit/Rollback 和看门狗管理，不走 ctx。
	tx, err := conn.BeginTx(context.Background(), nil)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	done := make(chan struct{})
	now := time.Now()
	txEntry := &txInfo{
		conn:       conn,
		tx:         tx,
		database:   database,
		started:    now,
		lastActive: now,
		done:       done,
	}
	m.txs[key] = txEntry
	// 调用方得知上一笔事务的结局（提交 / 回滚 / 重新开启）之后，才解除「不许悄悄
	// 回到自动提交」的限制
	delete(m.txTimedOut, key)

	// 看门狗：事务空闲超过阈值（没有语句在执行、且距上一条语句结束已满阈值）则
	// 自动回滚，避免连接被永久占用（用户关闭查询 Tab 或前端崩溃时的事务兜底）。
	// 从 BEGIN 起算总时长的话，一直在用的事务也会在 5 分钟整被回滚。
	go func() {
		timer := time.NewTimer(txWatchdogTimeout)
		defer timer.Stop()
		for {
			select {
			case <-done:
				return // 已正常结束
			case <-timer.C:
				m.mu.Lock()
				// 确认仍是同一个事务（避免 commit 后又被新事务占用槽位导致误回滚）
				cur, ok := m.txs[key]
				if !ok || cur != txEntry {
					m.mu.Unlock()
					return
				}
				wait := txWatchdogTimeout - time.Since(cur.lastActive)
				if cur.inflight > 0 {
					// 正在执行的语句算作活动（单条语句自有 30 分钟上限兜底）
					wait = txWatchdogTimeout
				}
				if wait > 0 {
					m.mu.Unlock()
					timer.Reset(wait)
					continue
				}
				delete(m.txs, key)
				m.txTimedOut[key] = struct{}{}
				m.mu.Unlock()

				_ = cur.tx.Rollback()
				_ = cur.conn.Close()
				close(cur.done)
				return
			}
		}
	}()

	return nil
}

// CommitTransaction 提交事务。返回值表示是否确有活跃事务被提交：
// false = 没有事务在等待（可能已被看门狗超时回滚），前端据此提示
// 真实结果，避免"实际已回滚却提示已提交"。
func (m *Manager) CommitTransaction(connectionID, sessionID string) (bool, error) {
	key := txKey(connectionID, sessionID)
	m.mu.Lock()
	txInfo, exists := m.txs[key]
	delete(m.txs, key)
	delete(m.txTimedOut, key)
	m.mu.Unlock()

	if !exists {
		// 幂等：没有活跃事务 = 已处于自动提交模式，直接成功。
		// 事务可能已被看门狗超时回滚，此前这里报错会导致前端
		// 事务状态永久卡死、无法退出事务模式
		return false, nil
	}

	// 通知看门狗停止
	close(txInfo.done)

	err := txInfo.tx.Commit()
	_ = txInfo.conn.Close()
	if err != nil {
		return true, fmt.Errorf("commit failed: %w", err)
	}
	return true, nil
}

// RollbackTransaction 回滚事务。返回值语义同 CommitTransaction。
func (m *Manager) RollbackTransaction(connectionID, sessionID string) (bool, error) {
	key := txKey(connectionID, sessionID)
	m.mu.Lock()
	txInfo, exists := m.txs[key]
	delete(m.txs, key)
	delete(m.txTimedOut, key)
	m.mu.Unlock()

	if !exists {
		// 幂等：同 CommitTransaction——没有活跃事务即已是自动提交模式
		return false, nil
	}

	// 通知看门狗停止
	close(txInfo.done)

	err := txInfo.tx.Rollback()
	_ = txInfo.conn.Close()
	if err != nil {
		return true, fmt.Errorf("rollback failed: %w", err)
	}
	return true, nil
}

// HasTransaction 检查指定会话是否有活跃事务。
func (m *Manager) HasTransaction(connectionID, sessionID string) bool {
	m.mu.RLock()
	_, exists := m.txs[txKey(connectionID, sessionID)]
	m.mu.RUnlock()
	return exists
}

// hasAnyTransaction 检查连接上是否存在任一会话的事务（SQLite 单连接守护用）。
func (m *Manager) hasAnyTransaction(connectionID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	prefix := connectionID + txKeySep
	for k := range m.txs {
		if strings.HasPrefix(k, prefix) {
			return true
		}
	}
	return false
}

// GetExecutor 获取自动提交执行器（不加入任何会话事务）。
// 结构操作、元数据读写等无会话上下文的调用走这里。
func (m *Manager) GetExecutor(connectionID string, database string) (Executor, error) {
	return m.GetExecutorForSession(connectionID, database, "", false)
}

// GetExecutorForSession 获取执行器：指定会话存在活跃事务时返回该事务，否则返回连接池。
//
//   - 会话的事务开在别的库上：报错。既不能把语句塞进那个库的事务，也不能悄悄改成
//     自动提交——调用方以为还能回滚，其实已经生效
//   - 会话没有事务，但上一笔是被看门狗超时回滚的：报错。调用方多半还以为在事务里，
//     放行的话语句会逐条自动提交，等它去提交时才发现「事务已结束」
//   - requireTx（调用方明确要求在事务里执行，如编辑器的手动模式）：没有事务同样报错
//
// 没有事务时的两种原因里，被看门狗回收的报错优先（更具体）。
// 后两种情况要等调用方显式 begin / commit / rollback 之后才恢复自动提交。
func (m *Manager) GetExecutorForSession(connectionID string, database string, sessionID string, requireTx bool) (Executor, error) {
	if sessionID != "" {
		key := txKey(connectionID, sessionID)
		m.mu.RLock()
		info, exists := m.txs[key]
		_, timedOut := m.txTimedOut[key]
		m.mu.RUnlock()
		if exists {
			if info.database != database {
				return nil, fmt.Errorf("this session's transaction is open on %s but the statement targets %s; commit or roll back the transaction first",
					txDatabaseLabel(info.database), txDatabaseLabel(database))
			}
			return &trackedTx{m: m, key: key, info: info}, nil
		}
		// 两种原因同时成立时报更具体的那个
		if timedOut {
			return nil, fmt.Errorf("this session's transaction was rolled back by the %s inactivity timeout and its changes were discarded; the statement was NOT executed. Call begin_transaction to start a new transaction, or commit/rollback_transaction to return to autocommit", txWatchdogTimeout)
		}
		if requireTx {
			return nil, fmt.Errorf("this session has no active transaction (it may have been rolled back or ended); the statement was NOT executed")
		}
	}

	if database != "" {
		return m.GetWithDatabase(connectionID, database)
	}
	return m.Get(connectionID)
}

// GetExecutorNoTx 获取绕过活跃事务的执行器（自动提交路径）。
// 事务按连接全局唯一，GetExecutor 会把该连接上所有语句路由进活跃事务——
// 自动提交模式的查询和表数据编辑必须显式绕过，否则会被别处（如另一查询
// Tab 的手动事务）开启的事务捕获，随其回滚而静默丢失。
func (m *Manager) GetExecutorNoTx(connectionID string, database string) (Executor, error) {
	if m.hasAnyTransaction(connectionID) {
		// SQLite 连接池是单连接（写入串行化），事务独占该连接时其他语句
		// 只会在池里排队直到 60s 超时；直接报明确错误胜过挂起
		if pool, err := m.GetPool(connectionID); err == nil && isSQLite(pool.DbType) {
			return nil, fmt.Errorf("connection has an active transaction holding the only SQLite connection; commit or roll back it first")
		}
	}
	if database != "" {
		return m.GetWithDatabase(connectionID, database)
	}
	return m.Get(connectionID)
}

// isTransientNetworkError 判断是否为"瞬时网络未就绪"类拨号错误。
// EHOSTUNREACH（no route to host）等错误由内核立即返回，常见于 macOS
// 首次本地网络访问授权、VPN/路由刚建立的场景，稍后重试即恢复。
// 用错误文本匹配（跨平台统一，Windows 的 WSAEHOSTUNREACH 文本不同）；
// i/o timeout、connection refused、认证错误等不匹配，不会被重试。
func isTransientNetworkError(err error) bool {
	if err == nil {
		return false
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		msg := opErr.Err.Error()
		return strings.Contains(msg, "no route to host") ||
			strings.Contains(msg, "network is down") ||
			strings.Contains(msg, "network is unreachable") ||
			strings.Contains(msg, "host is down") ||
			strings.Contains(msg, "unreachable host") // Windows WSAEHOSTUNREACH
	}
	// 达梦等国产驱动把拨号失败包装成自有错误类型（"Error 6001: 网络通信异常
	// dial address: host:port"），errors.As 解不出 net.OpError，底层 errno 也被
	// 丢弃——无法精确区分"网络未就绪"与"服务器不可达"。对这类拨号阶段错误
	// 一律按瞬时处理重试：最坏多等 ~3.5s 才报错，换来首连自动恢复。
	return strings.Contains(err.Error(), "dial address")
}

func openDB(args ConnectArgs) (*sql.DB, error) {
	switch args.DbType {
	case "mysql":
		return openMySQL(args)
	case "postgresql":
		return openPostgres(args)
	case "sqlite":
		return openSQLite(args)
	case "dameng":
		return openDameng(args)
	case "kingbase":
		return openKingbase(args)
	case "highgo":
		return openHighgo(args)
	case "vastbase":
		return openVastbase(args)
	case "sqlserver":
		return openSQLServer(args)
	case "oracle":
		return openOracle(args)
	case "clickhouse":
		return openClickHouse(args)
	case "tdengine":
		return openTDengine(args)
	default:
		return nil, fmt.Errorf("unsupported database type: %s", args.DbType)
	}
}

// SupportsTx 该类型是否支持交互式事务（BeginTransaction 的前置判断；
// api 层导入流程也用它决定是否包事务）
func SupportsTx(dbType string) bool {
	switch dbType {
	case "clickhouse", "tdengine":
		return false
	}
	return true
}
