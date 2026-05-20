package localdb

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Pool SQLite 连接池包装器
type Pool struct {
	db *sql.DB
}

// NewPool 创建新的 SQLite 连接池
func NewPool(dbPath string) (*Pool, error) {
	uri := fmt.Sprintf("file:%s?mode=rwc&cache=shared", dbPath)

	db, err := sql.Open("sqlite", uri)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite: %w", err)
	}

	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(10 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping sqlite: %w", err)
	}

	return &Pool{db: db}, nil
}

// Close 关闭连接池
func (p *Pool) Close() error {
	return p.db.Close()
}

// DB 获取底层数据库连接
func (p *Pool) DB() *sql.DB {
	return p.db
}
