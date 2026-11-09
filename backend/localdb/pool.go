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
	// synchronous 是 per-connection PRAGMA，用 DSN 参数保证池里每个连接都生效；
	// WAL 下 NORMAL 不做逐提交 fsync（掉电最多丢最后几条历史，库不损坏）。
	// 查询历史逐语句写入，FULL 的每次提交 fsync 会让脚本执行平添毫秒级/条开销。
	uri := fmt.Sprintf("file:%s?mode=rwc&cache=shared&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)", dbPath)

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
