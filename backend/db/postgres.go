package db

import (
	"database/sql"
	"fmt"
	"net/url"
)

func openPostgres(args ConnectArgs) (*sql.DB, error) {
	sslMode := "disable"

	dbName := args.Database
	if dbName == "" {
		dbName = "postgres"
	}

	// 使用参数化连接字符串构建
	dsn := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(args.Username, args.Password),
		Host:   fmt.Sprintf("%s:%d", args.Host, args.Port),
		Path:   dbName,
		RawQuery: url.Values{
			"sslmode":           {sslMode},
			"application_name":  {"iDBLink"},
			"connect_timeout":   {"10"},  // 拨号兜底超时，网络不通时避免长时间挂起
			"statement_timeout": {"30000"}, // 30s,防止慢查询把 PG 拖死
			"lock_timeout":      {"10000"}, // 10s,防止锁等待堆积
		}.Encode(),
	}

	// SSL/TLS 配置（用户主动启用时才使用）
	if args.SSL.Enabled {
		query := dsn.Query()
		if args.SSL.SkipVerify {
			query.Set("sslmode", "require")
		} else {
			query.Set("sslmode", "verify-ca")
		}
		if args.SSL.CAPath != "" {
			query.Set("sslrootcert", args.SSL.CAPath)
		}
		if args.SSL.CertPath != "" {
			query.Set("sslcert", args.SSL.CertPath)
		}
		if args.SSL.KeyPath != "" {
			query.Set("sslkey", args.SSL.KeyPath)
		}
		dsn.RawQuery = query.Encode()
	}

	return sql.Open("postgres", dsn.String())
}
