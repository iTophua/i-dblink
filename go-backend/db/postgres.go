package db

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "github.com/lib/pq"
)

func openPostgres(args ConnectArgs) (*sql.DB, error) {
	sslMode := "prefer"
	if args.Host == "localhost" || args.Host == "127.0.0.1" {
		sslMode = "disable"
	}

	dbName := args.Database
	if dbName == "" {
		dbName = "postgres"
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		args.Username,
		url.QueryEscape(args.Password),
		args.Host,
		args.Port,
		dbName,
		sslMode,
	)

	return sql.Open("postgres", dsn)
}
