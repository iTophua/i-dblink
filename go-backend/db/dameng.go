package db

import (
	"database/sql"
	"fmt"

	_ "gitee.com/chunanyong/dm"
)

func openDameng(args ConnectArgs) (*sql.DB, error) {
	// 达梦驱动不使用 URL 编码，特殊字符直接拼接到 DSN
	// 参考: https://gitee.com/chunanyong/dm
	dsn := fmt.Sprintf("dm://%s:%s@%s:%d",
		args.Username,
		args.Password,
		args.Host,
		args.Port,
	)
	if args.Database != "" {
		dsn = dsn + "?schema=" + args.Database
	}

	return sql.Open("dm", dsn)
}
