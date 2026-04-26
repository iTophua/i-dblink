package db

import (
	"database/sql"
	"fmt"

	_ "gitee.com/chunanyong/dm"
)

func openDameng(args ConnectArgs) (*sql.DB, error) {
	// 达梦 DSN 格式: dm://username:password@host:port?schema=schemaName
	// 注意：达梦驱动不会自动对 DSN 中的密码进行 URL decode，因此
	// 不能使用标准库的 url.URL（它会自动编码特殊字符）。
	// 如果密码中包含 @ 或 :，会导致 DSN 解析错误，但目前达梦驱动
	// 本身不支持这些字符出现在密码中（SplitN 只会处理第一个 :）。
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
