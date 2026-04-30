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
		encodedPath := url.PathEscape(dbPath)
		dsn = fmt.Sprintf("file:%s?mode=rwc", encodedPath)
	}

	return sql.Open("sqlite", dsn)
}
