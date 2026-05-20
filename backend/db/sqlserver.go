package db

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "github.com/microsoft/go-mssqldb"
)

func openSQLServer(args ConnectArgs) (*sql.DB, error) {
	query := url.Values{}
	query.Set("database", args.Database)
	query.Set("encrypt", "disable")

	if args.SSL.Enabled {
		query.Set("encrypt", "true")
		if args.SSL.SkipVerify {
			query.Set("trustservercertificate", "true")
		}
		if args.SSL.CAPath != "" {
			query.Set("certificate", args.SSL.CAPath)
		}
	}

	dsn := fmt.Sprintf("sqlserver://%s:%s@%s:%d?%s",
		url.QueryEscape(args.Username),
		url.QueryEscape(args.Password),
		args.Host,
		args.Port,
		query.Encode(),
	)

	return sql.Open("sqlserver", dsn)
}
