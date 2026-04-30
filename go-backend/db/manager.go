package db

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"
)

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
}

// Manager 管理所有数据库连接池
type Manager struct {
	mu    sync.RWMutex
	pools map[string]*connInfo
	txs   map[string]*txInfo
}

// NewManager 创建连接管理器
func NewManager() *Manager {
	return &Manager{
		pools: make(map[string]*connInfo),
		txs:   make(map[string]*txInfo),
	}
}

// ConnectArgs 连接参数
type ConnectArgs struct {
	DbType   string
	Host     string
	Port     int
	Username string
	Password string
	Database string
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

	m.mu.Lock()
	m.pools[connectionID] = &connInfo{db: db, dbType: req.DbType, args: req}
	m.mu.Unlock()

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
		_ = txInfo.tx.Rollback()
		_ = txInfo.conn.Close()
	}
	m.mu.Unlock()

	if !ok {
		return fmt.Errorf("connection %s not found", connectionID)
	}

	return info.db.Close()
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

// GetPool 获取连接池及其类型信息
func (m *Manager) GetPool(connectionID string) (*DBPool, error) {
	m.mu.RLock()
	info, ok := m.pools[connectionID]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("connection %s not found", connectionID)
	}

	return &DBPool{db: info.db, DbType: info.dbType}, nil
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

	fmt.Printf("[DEBUG] ConnectWithDatabase: connectionID=%s, database=%s, key=%s\n", connectionID, database, key)
	fmt.Printf("[DEBUG] original args.Database=%s\n", info.args.Database)

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.pools[key]; exists {
		fmt.Printf("[DEBUG] Connection already exists for key=%s\n", key)
		return nil
	}

	dbArgs := info.args
	dbArgs.Database = database
	fmt.Printf("[DEBUG] Creating new connection with Database=%s\n", dbArgs.Database)
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
		return fmt.Errorf("transaction already active for connection %s", connectionID)
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

	m.txs[connectionID] = &txInfo{conn: conn, tx: tx}
	return nil
}

// CommitTransaction 提交事务
func (m *Manager) CommitTransaction(connectionID string) error {
	m.mu.Lock()
	txInfo, exists := m.txs[connectionID]
	delete(m.txs, connectionID)
	m.mu.Unlock()

	if !exists {
		return fmt.Errorf("no active transaction for connection %s", connectionID)
	}

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
		return fmt.Errorf("no active transaction for connection %s", connectionID)
	}

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
	default:
		return nil, fmt.Errorf("unsupported database type: %s", args.DbType)
	}
}
