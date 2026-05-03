package db

import (
	"database/sql"
	"fmt"
	"net/url"
)

func openPostgres(args ConnectArgs) (*sql.DB, error) {
	sslMode := "prefer"
	if args.Host == "localhost" || args.Host == "127.0.0.1" {
		sslMode = "disable"
	}

	dbName := args.Database
	if dbName == "" {
		dbName = "postgres"
	}

	// SSL/TLS 配置
	if args.SSL.Enabled {
		if args.SSL.SkipVerify {
			sslMode = "require"
		} else {
			sslMode = "verify-ca"
		}
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		args.Username,
		url.QueryEscape(args.Password),
		args.Host,
		args.Port,
		dbName,
		sslMode,
	)

	// 添加 SSL 证书参数
	if args.SSL.Enabled {
		if args.SSL.CAPath != "" {
			dsn += fmt.Sprintf("&sslrootcert=%s", url.QueryEscape(args.SSL.CAPath))
		}
		if args.SSL.CertPath != "" {
			dsn += fmt.Sprintf("&sslcert=%s", url.QueryEscape(args.SSL.CertPath))
		}
		if args.SSL.KeyPath != "" {
			dsn += fmt.Sprintf("&sslkey=%s", url.QueryEscape(args.SSL.KeyPath))
		}
	}

	return sql.Open("postgres", dsn)
}
