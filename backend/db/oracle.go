package db

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "github.com/sijms/go-ora/v2"
)

func openOracle(args ConnectArgs) (*sql.DB, error) {
	dsn := fmt.Sprintf("oracle://%s:%s@%s:%d/%s",
		url.QueryEscape(args.Username),
		url.QueryEscape(args.Password),
		args.Host,
		args.Port,
		args.Database,
	)
	return sql.Open("oracle", dsn)
}
