package db

import (
	"database/sql"
	"fmt"
	"net/url"

	_ "github.com/taosdata/driver-go/v3/taosRestful"
)

// openTDengine 连接 TDengine，走 taosAdapter 的 REST 接口（taosRestful
// 驱动，纯 Go）。不用 Native taosSql：那需要随包分发 libtaos 客户端库
// （CGO），会给 macOS/多平台打包引入额外负担；REST 功能覆盖 SQL
// 查询/写入/DDL 足够。taosAdapter 默认端口 6041。
// DSN 格式：user:password@http(host:port)/database（用户名/密码需转义，
// 驱动侧 tryUnescape 还原）。
func openTDengine(args ConnectArgs) (*sql.DB, error) {
	username := args.Username
	if username == "" {
		username = "root"
	}
	dsn := fmt.Sprintf("%s:%s@http(%s:%d)/%s",
		url.QueryEscape(username),
		url.QueryEscape(args.Password),
		args.Host,
		args.Port,
		args.Database,
	)
	return sql.Open("taosRestful", dsn)
}
