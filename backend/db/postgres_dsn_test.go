package db

import (
	"net/url"
	"testing"
	"time"
)

// 服务端的语句超时不能比上层 / 其它库短：此前写死 30 秒，跑得久一点的查询、
// 大 ALTER、导入批次都被 PG 自己杀掉；锁等待写死 10 秒，等锁也会报错
func TestPostgresDSNTimeouts(t *testing.T) {
	for _, ssl := range []bool{false, true} {
		args := ConnectArgs{Username: "u", Password: "p@ s:/", Host: "h", Port: 5432, Database: "db"}
		args.SSL.Enabled = ssl
		parsed, err := url.Parse(postgresDSN(args))
		if err != nil {
			t.Fatalf("postgresDSN(ssl=%v): %v", ssl, err)
		}
		q := parsed.Query()

		statementMs, err := time.ParseDuration(q.Get("statement_timeout") + "ms")
		if err != nil {
			t.Fatalf("statement_timeout %q: %v", q.Get("statement_timeout"), err)
		}
		// 与 api.LongOpTimeout（30 分钟）、MySQL 的 readTimeout 对齐
		if statementMs != 30*time.Minute {
			t.Errorf("ssl=%v: statement_timeout = %v, want 30m", ssl, statementMs)
		}
		if _, ok := q["lock_timeout"]; ok {
			t.Errorf("ssl=%v: lock_timeout is set to %q; waiting for a lock is not an error", ssl, q.Get("lock_timeout"))
		}
		if q.Get("connect_timeout") != "10" {
			t.Errorf("ssl=%v: connect_timeout = %q, want the short dial fallback", ssl, q.Get("connect_timeout"))
		}

		// 账号和密码原样往返（经 url 编码），库里有特殊字符也不会连错
		if pass, _ := parsed.User.Password(); pass != args.Password {
			t.Errorf("ssl=%v: password %q became %q", ssl, args.Password, pass)
		}
	}
}

func TestPostgresDSNSSL(t *testing.T) {
	args := ConnectArgs{Username: "u", Password: "p", Host: "h", Port: 5432, Database: "db"}
	args.SSL = SSLArgs{Enabled: true, CAPath: "/certs/ca.pem", CertPath: "/certs/c.pem", KeyPath: "/certs/k.pem"}

	parsed, err := url.Parse(postgresDSN(args))
	if err != nil {
		t.Fatalf("postgresDSN: %v", err)
	}
	q := parsed.Query()
	if q.Get("sslmode") != "verify-ca" {
		t.Errorf("sslmode = %q, want verify-ca", q.Get("sslmode"))
	}
	for key, want := range map[string]string{
		"sslrootcert": "/certs/ca.pem",
		"sslcert":     "/certs/c.pem",
		"sslkey":      "/certs/k.pem",
	} {
		if q.Get(key) != want {
			t.Errorf("%s = %q, want %q", key, q.Get(key), want)
		}
	}

	args.SSL.SkipVerify = true
	parsed, _ = url.Parse(postgresDSN(args))
	if got := parsed.Query().Get("sslmode"); got != "require" {
		t.Errorf("sslmode with SkipVerify = %q, want require", got)
	}
}

// 没填库名时连 postgres 库
func TestPostgresDSNDefaultDatabase(t *testing.T) {
	parsed, err := url.Parse(postgresDSN(ConnectArgs{Username: "u", Host: "h", Port: 5432}))
	if err != nil {
		t.Fatalf("postgresDSN: %v", err)
	}
	if parsed.Path != "/postgres" {
		t.Errorf("path = %q, want /postgres", parsed.Path)
	}
}
