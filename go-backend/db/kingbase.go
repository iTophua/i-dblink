package db

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "gitea.com/kingbase/gokb"
)

func openKingbase(args ConnectArgs) (*sql.DB, error) {
	// Kingbase DSN 格式: kingbase://user:password@host:port/dbname?sslmode=disable
	dbName := args.Database
	if dbName == "" {
		dbName = "test" // Kingbase 默认数据库
	}

	dsn := fmt.Sprintf("kingbase://%s:%s@%s:%d/%s?sslmode=disable",
		args.Username,
		url.QueryEscape(args.Password),
		args.Host,
		args.Port,
		dbName,
	)

	return sql.Open("kingbase", dsn)
}
