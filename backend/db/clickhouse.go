package db

import (
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"fmt"
	"os"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

// openClickHouse 连接 ClickHouse 系数据库（含社区版 ClickHouse 与
// ClickHouse 内核 fork，如公司自研的 AIoTHouse——已实测其 HTTP 端点
// 返回标准 ClickHouse 协议响应）。
// 走 HTTP 协议而非 Native：fork 的 Native 握手可能不兼容上游客户端，
// 而 HTTP SQL 接口是各 fork 保持兼容的最大公约数；且纯 Go 无 CGO。
// 社区版默认端口 8123，AIoTHouse 按部署配置常用 18123/28123（HTTP）。
func openClickHouse(args ConnectArgs) (*sql.DB, error) {
	database := args.Database
	if database == "" {
		database = "default"
	}
	username := args.Username
	if username == "" {
		username = "default"
	}

	opt := &clickhouse.Options{
		Protocol: clickhouse.HTTP,
		Addr:     []string{fmt.Sprintf("%s:%d", args.Host, args.Port)},
		Auth: clickhouse.Auth{
			Database: database,
			Username: username,
			Password: args.Password,
		},
		// 与 mysql 驱动同语义：拨号 10s 兜底（网络不通不等 OS 级重试）；
		// 读超时对齐 30 分钟 LongOpTimeout，大查询/大 ALTER 不误判超时
		DialTimeout: 10 * time.Second,
		ReadTimeout: 30 * time.Minute,
		ClientInfo: clickhouse.ClientInfo{
			Products: []struct {
				Name    string
				Version string
			}{{Name: "iDBLink", Version: "1.0"}},
		},
	}

	// SSL/TLS：走 https，证书语义与 mysql 驱动一致（CA/客户端证书/跳过校验）
	if args.SSL.Enabled {
		tlsConfig := &tls.Config{
			InsecureSkipVerify: args.SSL.SkipVerify,
		}
		if args.SSL.CAPath != "" {
			caCert, err := os.ReadFile(args.SSL.CAPath)
			if err != nil {
				return nil, fmt.Errorf("failed to read CA certificate: %w", err)
			}
			caCertPool := x509.NewCertPool()
			if !caCertPool.AppendCertsFromPEM(caCert) {
				return nil, fmt.Errorf("failed to parse CA certificate")
			}
			tlsConfig.RootCAs = caCertPool
		}
		if args.SSL.CertPath != "" && args.SSL.KeyPath != "" {
			cert, err := tls.LoadX509KeyPair(args.SSL.CertPath, args.SSL.KeyPath)
			if err != nil {
				return nil, fmt.Errorf("failed to load client certificate: %w", err)
			}
			tlsConfig.Certificates = []tls.Certificate{cert}
		}
		opt.TLS = tlsConfig
	}

	return sql.OpenDB(clickhouse.Connector(opt)), nil
}
