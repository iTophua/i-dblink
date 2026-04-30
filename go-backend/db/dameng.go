package db

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "gitee.com/chunanyong/dm"
)

func openDameng(args ConnectArgs) (*sql.DB, error) {
	encodedPassword := url.QueryEscape(args.Password)
	dsn := fmt.Sprintf("dm://%s:%s@%s:%d",
		args.Username,
		encodedPassword,
		args.Host,
		args.Port,
	)
	if args.Database != "" {
		dsn = dsn + "?schema=" + args.Database
	}

	return sql.Open("dm", dsn)
}
