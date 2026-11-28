package db

import (
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
)

// 密码原样进连接串：驱动按最后一个 @ 分隔账号和地址，也不做 %XX 解码。
// 此前把密码里最后一个 @ 换成 %40，带这种密码的库一律 Access denied
func TestMySQLDSNKeepsPasswordVerbatim(t *testing.T) {
	passwords := []string{
		"p@ss",
		"a@b@c", // 只有一个 @ 被换掉时，剩下的照旧能解析，掩盖了问题
		"p/w?x",
		"p:ss(word)",
		"100%",
		`pa'ss\`,
		"",
	}
	for _, password := range passwords {
		for _, ssl := range []bool{false, true} {
			args := ConnectArgs{
				Username: "u",
				Password: password,
				Host:     "127.0.0.1",
				Port:     3306,
				Database: "db",
			}
			args.SSL.Enabled = ssl

			dsn, err := mysqlDSN(args)
			if err != nil {
				t.Fatalf("mysqlDSN(password=%q, ssl=%v): %v", password, ssl, err)
			}
			cfg, err := mysql.ParseDSN(dsn)
			if err != nil {
				t.Fatalf("ParseDSN(%q): %v", dsn, err)
			}
			if cfg.Passwd != password {
				t.Errorf("ssl=%v: password %q became %q", ssl, password, cfg.Passwd)
			}
			if cfg.User != "u" || cfg.Addr != "127.0.0.1:3306" || cfg.DBName != "db" {
				t.Errorf("ssl=%v: unexpected user/addr/db %q %q %q", ssl, cfg.User, cfg.Addr, cfg.DBName)
			}
		}
	}
}

// 长查询不该被驱动的读超时判死：上限与上层的 30 分钟长操作超时对齐
func TestMySQLDSNTimeouts(t *testing.T) {
	dsn, err := mysqlDSN(ConnectArgs{Username: "u", Password: "p", Host: "h", Port: 3306, Database: "d"})
	if err != nil {
		t.Fatalf("mysqlDSN: %v", err)
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		t.Fatalf("ParseDSN: %v", err)
	}
	if cfg.ReadTimeout.Minutes() < 30 {
		t.Errorf("ReadTimeout = %v, want >= 30m", cfg.ReadTimeout)
	}
	if cfg.Timeout <= 0 || cfg.Timeout > 15*time.Second {
		t.Errorf("dial Timeout = %v, want a short fallback", cfg.Timeout)
	}
}
