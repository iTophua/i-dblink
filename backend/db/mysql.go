package db

import (
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"fmt"
	"os"

	"github.com/go-sql-driver/mysql"
)

func openMySQL(args ConnectArgs) (*sql.DB, error) {
	dsn, err := mysqlDSN(args)
	if err != nil {
		return nil, err
	}
	return sql.Open("mysql", dsn)
}

// mysqlDSN 拼连接串。密码原样写进去：驱动按最后一个 @ 分隔账号和地址，密码里带
// @ / : / ? / / 都不用转义，驱动也不做 %XX 解码——此前把 @ 换成 %40，带这种密码
// 的库一律 Access denied
func mysqlDSN(args ConnectArgs) (string, error) {
	// 超时语义：
	//   timeout=10s    拨号与握手兜底（网络不通时不等 OS 级重试，可达数分钟）
	//   readTimeout=30m 每次网络读的截止。查询执行期间服务器不回包，大查询/
	//                   大 ALTER 服务端跑几分钟属正常——此前 30s 会把这类语句
	//                   直接判死（i/o timeout），与上层 30 分钟 LongOpTimeout 对齐
	//   writeTimeout=10m 上传超大 SQL 文本（整库脚本）的余量
	// parseTime=false：时间列以原始字节直通 convertValue 的字符串路径，
	// 免去驱动逐值 字符串→time.Time(含时区换算)→再 Format 回字符串 的双转换
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&timeout=10s&readTimeout=30m&writeTimeout=10m",
		args.Username,
		args.Password,
		args.Host,
		args.Port,
		args.Database,
	)

	// SSL/TLS 配置
	if args.SSL.Enabled {
		cfg, err := mysql.ParseDSN(dsn)
		if err != nil {
			return "", fmt.Errorf("failed to parse DSN: %w", err)
		}

		tlsConfig := &tls.Config{
			InsecureSkipVerify: args.SSL.SkipVerify,
		}

		if args.SSL.CAPath != "" {
			caCert, err := os.ReadFile(args.SSL.CAPath)
			if err != nil {
				return "", fmt.Errorf("failed to read CA certificate: %w", err)
			}
			caCertPool := x509.NewCertPool()
			if !caCertPool.AppendCertsFromPEM(caCert) {
				return "", fmt.Errorf("failed to parse CA certificate")
			}
			tlsConfig.RootCAs = caCertPool
		}

		if args.SSL.CertPath != "" && args.SSL.KeyPath != "" {
			cert, err := tls.LoadX509KeyPair(args.SSL.CertPath, args.SSL.KeyPath)
			if err != nil {
				return "", fmt.Errorf("failed to load client certificate: %w", err)
			}
			tlsConfig.Certificates = []tls.Certificate{cert}
		}

		// 用 host:port 生成唯一 TLS 配置名，避免多个 SSL 连接并发建立时
		// 用固定名称 "custom" 互相覆盖（RegisterTLSConfig 是全局注册表）。
		tlsName := fmt.Sprintf("idblink-%s-%d", args.Host, args.Port)
		if err := mysql.RegisterTLSConfig(tlsName, tlsConfig); err != nil {
			return "", fmt.Errorf("failed to register TLS config: %w", err)
		}
		cfg.TLSConfig = tlsName
		dsn = cfg.FormatDSN()
	}

	return dsn, nil
}
