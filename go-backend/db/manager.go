package db

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"
)

// connInfo 保存连接池及其类型
type connInfo struct {
	db     *sql.DB
	dbType string
}

// Manager 管理所有数据库连接池
type Manager struct {
	mu    sync.RWMutex
	pools map[string]*connInfo
}

// NewManager 创建连接管理器
func NewManager() *Manager {
	return &Manager{
		pools: make(map[string]*connInfo),
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
	m.pools[connectionID] = &connInfo{db: db, dbType: req.DbType}
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
