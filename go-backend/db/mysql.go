package db

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

func openMySQL(args ConnectArgs) (*sql.DB, error) {
	password := args.Password
	atIdx := -1
	for i := 0; i < len(password); i++ {
		if password[i] == '@' {
			atIdx = i
		}
	}
	if atIdx >= 0 {
		password = password[:atIdx] + "%40" + password[atIdx+1:]
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=Local",
		args.Username,
		password,
		args.Host,
		args.Port,
		args.Database,
	)

	return sql.Open("mysql", dsn)
}
