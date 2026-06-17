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
	password := args.Password
	atIdx := -1
	for i := 0; i < len(password); i++ {
		if password[i] == '@' {
			atIdx = i
		}
	}
	if atIdx >= 0 {
		password = password[:atIdx] + "%40" + password[atIdx+1:]
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=Local",
		args.Username,
		password,
		args.Host,
		args.Port,
		args.Database,
	)

	// SSL/TLS 配置
	if args.SSL.Enabled {
		cfg, err := mysql.ParseDSN(dsn)
		if err != nil {
			return nil, fmt.Errorf("failed to parse DSN: %w", err)
		}

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

		if err := mysql.RegisterTLSConfig("custom", tlsConfig); err != nil {
			return nil, fmt.Errorf("failed to register TLS config: %w", err)
		}
		cfg.TLSConfig = "custom"
		dsn = cfg.FormatDSN()
	}

	return sql.Open("mysql", dsn)
}
