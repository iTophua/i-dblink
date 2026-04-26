package db

import (
	"database/sql"
	"fmt"

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
		dsn = fmt.Sprintf("file:%s?mode=rwc", dbPath)
	}

	return sql.Open("sqlite", dsn)
}
