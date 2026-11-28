package db

import (
	"database/sql"
	"fmt"
	"net/url"
)

// postgresStatementTimeout 服务端语句超时（毫秒）。与上层的 30 分钟长操作上限、MySQL 的
// readTimeout 对齐，改一处要一起改。此前是 30 秒：跑得久一点的查询、大 ALTER、导入批次
// 都被服务端杀掉，界面上也改不了。
//
// 不设 lock_timeout（沿用服务器默认）：等锁是正常现象，由用户点「停止」取消。此前是
// 10 秒——手动事务里另一处改同一行、DDL 排在长查询后面，都会莫名失败。
const postgresStatementTimeoutMs = "1800000"

func openPostgres(args ConnectArgs) (*sql.DB, error) {
	return sql.Open("postgres", postgresDSN(args))
}

// postgresDSN 拼 PG 连接串
func postgresDSN(args ConnectArgs) string {
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
			"connect_timeout":   {"10"}, // 拨号兜底超时，网络不通时避免长时间挂起
			"statement_timeout": {postgresStatementTimeoutMs},
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

	return dsn.String()
}
