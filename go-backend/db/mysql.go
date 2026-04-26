package db

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "github.com/go-sql-driver/mysql"
)

func openMySQL(args ConnectArgs) (*sql.DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=Local",
		args.Username,
		url.QueryEscape(args.Password),
		args.Host,
		args.Port,
		args.Database,
	)

	return sql.Open("mysql", dsn)
}
