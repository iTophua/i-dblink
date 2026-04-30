package db

import "database/sql"

// DBPool 包装数据库连接池及其类型信息
type DBPool struct {
	db     *sql.DB
	DbType string
}

// DB 返回底层 *sql.DB
func (p *DBPool) DB() *sql.DB {
	return p.db
}
