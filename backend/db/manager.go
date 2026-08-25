package db

import (
	"context"
	"database/sql"
	"fmt"
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
	conn    *sql.Conn
	tx      *sql.Tx
	started time.Time
	// done 在 Commit/Rollback/超时回收后 close，用于停止看门狗 goroutine
	done chan struct{}
}

// connectCancelEntry 包装取消函数：Go 的函数值不可用 == 比较，用指针做身份判断
type connectCancelEntry struct{ cancel context.CancelFunc }

// Manager 管理所有数据库连接池
type Manager struct {
	mu             sync.RWMutex
	pools          map[string]*connInfo
	txs            map[string]*txInfo
	connectCancels map[string]*connectCancelEntry // 进行中的连接，可被 CancelConnect 取消
}

// NewManager 创建连接管理器
func NewManager() *Manager {
	return &Manager{
		pools:          make(map[string]*connInfo),
		txs:            make(map[string]*txInfo),
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

	pingTimeoutCtx, cancel := context.WithTimeout(pingCtx, 15*time.Second)
	defer cancel()
	if err := db.PingContext(pingTimeoutCtx); err != nil {
		_ = db.Close()
		if pingCtx.Err() != nil {
			return fmt.Errorf("connection cancelled")
		}
		return fmt.Errorf("ping failed: %w", err)
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
	m.mu.Unlock()

	if connecting {
		cancelEntry.cancel()
	}
	if connected {
		_ = info.db.Close()
	}
	return nil
}

// Disconnect 断开连接并释放连接池
func (m *Manager) Disconnect(connectionID string) error {
	m.mu.Lock()
	info, ok := m.pools[connectionID]
	if ok {
		delete(m.pools, connectionID)
	}
	// 如果有活跃事务，先回滚
	if txInfo, txOk := m.txs[connectionID]; txOk {
		delete(m.txs, connectionID)
		close(txInfo.done) // 通知看门狗停止
		_ = txInfo.tx.Rollback()
		_ = txInfo.conn.Close()
	}
	m.mu.Unlock()

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

// ConnectWithDatabase 建立指定数据库的连接
func (m *Manager) ConnectWithDatabase(connectionID string, database string) error {
	m.mu.RLock()
	info, ok := m.pools[connectionID]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("connection %s not found", connectionID)
	}

	key := connectionID + ":" + database

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
	key := connectionID + ":" + database

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

// BeginTransaction 开启事务
func (m *Manager) BeginTransaction(connectionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.txs[connectionID]; exists {
		// 幂等：已在事务中视为成功，避免前端状态错位后再也无法进入事务
		return nil
	}

	info, ok := m.pools[connectionID]
	if !ok {
		return fmt.Errorf("connection %s not found", connectionID)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := info.db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("failed to reserve connection: %w", err)
	}

	ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel2()

	tx, err := conn.BeginTx(ctx2, nil)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	done := make(chan struct{})
	txEntry := &txInfo{
		conn:    conn,
		tx:      tx,
		started: time.Now(),
		done:    done,
	}
	m.txs[connectionID] = txEntry

	// 看门狗：事务超过 5 分钟未提交/回滚则自动回滚，避免连接被永久占用
	// （用户关闭查询 Tab 或前端崩溃时的事务兜底）
	go func() {
		timer := time.NewTimer(5 * time.Minute)
		defer timer.Stop()
		select {
		case <-done:
			return // 已正常结束
		case <-timer.C:
			m.mu.Lock()
			// 确认仍是同一个事务（避免 commit 后又被新事务占用槽位导致误回滚）
			if cur, ok := m.txs[connectionID]; ok && cur == txEntry {
				delete(m.txs, connectionID)
				_ = cur.tx.Rollback()
				_ = cur.conn.Close()
				close(cur.done)
			}
			m.mu.Unlock()
		}
	}()

	return nil
}

// CommitTransaction 提交事务
func (m *Manager) CommitTransaction(connectionID string) error {
	m.mu.Lock()
	txInfo, exists := m.txs[connectionID]
	delete(m.txs, connectionID)
	m.mu.Unlock()

	if !exists {
		// 幂等：没有活跃事务 = 已处于自动提交模式，直接成功。
		// 事务可能已被 5 分钟看门狗超时回滚，此前这里报错会导致前端
		// 事务状态永久卡死、无法退出事务模式
		return nil
	}

	// 通知看门狗停止
	close(txInfo.done)

	err := txInfo.tx.Commit()
	_ = txInfo.conn.Close()
	if err != nil {
		return fmt.Errorf("commit failed: %w", err)
	}
	return nil
}

// RollbackTransaction 回滚事务
func (m *Manager) RollbackTransaction(connectionID string) error {
	m.mu.Lock()
	txInfo, exists := m.txs[connectionID]
	delete(m.txs, connectionID)
	m.mu.Unlock()

	if !exists {
		// 幂等：同 CommitTransaction——没有活跃事务即已是自动提交模式
		return nil
	}

	// 通知看门狗停止
	close(txInfo.done)

	err := txInfo.tx.Rollback()
	_ = txInfo.conn.Close()
	if err != nil {
		return fmt.Errorf("rollback failed: %w", err)
	}
	return nil
}

// HasTransaction 检查是否有活跃事务
func (m *Manager) HasTransaction(connectionID string) bool {
	m.mu.RLock()
	_, exists := m.txs[connectionID]
	m.mu.RUnlock()
	return exists
}

// GetExecutor 获取执行器（优先返回活跃事务，其次返回连接池）
func (m *Manager) GetExecutor(connectionID string, database string) (Executor, error) {
	m.mu.RLock()
	if txInfo, exists := m.txs[connectionID]; exists {
		m.mu.RUnlock()
		return txInfo.tx, nil
	}
	m.mu.RUnlock()

	if database != "" {
		return m.GetWithDatabase(connectionID, database)
	}
	return m.Get(connectionID)
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
	default:
		return nil, fmt.Errorf("unsupported database type: %s", args.DbType)
	}
}
