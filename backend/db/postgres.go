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
			"sslmode": {sslMode},
		}.Encode(),
	}

	// SSL/TLS 配置（用户主动启用时才使用）
	if args.SSL.Enabled {
		if args.SSL.SkipVerify {
			dsn.RawQuery = url.Values{
				"sslmode": {"require"},
			}.Encode()
		} else {
			dsn.RawQuery = url.Values{
				"sslmode": {"verify-ca"},
			}.Encode()
		}

		// 添加 SSL 证书参数
		query := dsn.Query()
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
