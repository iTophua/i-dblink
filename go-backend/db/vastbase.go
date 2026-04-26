package db

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "github.com/lib/pq"
)

func openVastbase(args ConnectArgs) (*sql.DB, error) {
	// Vastbase DSN 格式: postgres://user:password@host:port/dbname?sslmode=disable
	dbName := args.Database
	if dbName == "" {
		dbName = "vastbase" // Vastbase 默认数据库
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable",
		args.Username,
		url.QueryEscape(args.Password),
		args.Host,
		args.Port,
		dbName,
	)

	return sql.Open("postgres", dsn)
}
