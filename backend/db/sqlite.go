package db

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "modernc.org/sqlite"
)

func openSQLite(args ConnectArgs) (*sql.DB, error) {
	dbPath := args.Database
	if dbPath == "" {
		dbPath = ":memory:"
	}

	var dsn string
	if dbPath == ":memory:" {
		dsn = ":memory:"
	} else {
		// 用 url.URL 构造 DSN，避免 PathEscape 把 / 转义成 %2F 导致绝对路径打不开
		u := &url.URL{Path: dbPath}
		dsn = fmt.Sprintf("file:%s?mode=rwc", u.String())
	}

	return sql.Open("sqlite", dsn)
}
