package backend

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"idblink/backend/localdb"
)

func strPtr(s string) *string { return &s }

// newSQLiteTestApp 起一个带 SQLite 连接的应用（存储在临时 HOME 下，不碰真实数据）
func newSQLiteTestApp(t *testing.T) (*App, string) {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	app := NewApp()
	if err := app.ServiceStartup(context.Background(), application.ServiceOptions{}); err != nil {
		t.Fatalf("ServiceStartup: %v", err)
	}
	dbPath := filepath.Join(t.TempDir(), "ctx.db")
	conn, err := app.SaveConnection(ConnectionInput{Name: "ctx-test", DbType: "sqlite", Host: "localhost", Database: &dbPath})
	if err != nil {
		t.Fatalf("SaveConnection: %v", err)
	}
	t.Cleanup(func() {
		app.disconnectAll()
		_ = app.storage.Close()
	})
	return app, conn.ID
}

// MCP 把客户端的取消通知和 timeout_seconds 传进来：正在执行的语句要真的在数据库上被打断，
// 而不是等它跑完才返回
func TestExecuteQueryCtxStopsRunningStatement(t *testing.T) {
	app, connID := newSQLiteTestApp(t)
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		res, err := app.ExecuteQueryLimitedCtx(ctx, connID,
			"WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 200000000) SELECT max(x) FROM c",
			nil, nil, 1, "")
		if err == nil {
			err = fmt.Errorf("%s", res.Error)
		}
		done <- err
	}()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("a statement cancelled by its deadline must report an error")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("the statement was not interrupted by the context deadline")
	}

	// 被打断之后连接照常可用
	res, err := app.ExecuteQueryCtx(context.Background(), connID, "SELECT 1 AS n", nil, nil, "")
	if err != nil || res.Error != "" || len(res.Rows) != 1 {
		t.Fatalf("query after an interrupted one: err=%v result=%+v", err, res)
	}
}

// DDL 同样跟着 ctx 走：传进来的 ctx 已经取消时不能再把语句发出去
func TestExecuteDDLCtxHonoursCancelledContext(t *testing.T) {
	app, connID := newSQLiteTestApp(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if err := app.ExecuteDDLCtx(ctx, connID, "CREATE TABLE should_not_exist (id INTEGER PRIMARY KEY)", nil, ""); err == nil {
		t.Fatal("DDL with an already-cancelled context must not run")
	}
	res, err := app.ExecuteQueryCtx(context.Background(), connID, "SELECT count(*) AS n FROM sqlite_master WHERE name = 'should_not_exist'", nil, nil, "")
	if err != nil || res.Error != "" || len(res.Rows) != 1 || fmt.Sprint(res.Rows[0][0]) != "0" {
		t.Fatalf("the cancelled DDL must not have taken effect: err=%v result=%+v", err, res)
	}
}

// 连接参数的拼装从 doConnectDatabase 里抽了出来（密码验证也要用）：映射不能走样，
// 尤其是默认库——MySQL 靠它落到选中的库上
func TestConnectArgsOfSavedConnection(t *testing.T) {
	yes, db := "true", "app"
	saved := &localdb.DbConnection{
		ID: "c1", DbType: "mysql", Host: "10.0.0.1", Port: 3307, Username: "u", Database: &db,
		SSLEnabled: &yes, SSLCAPath: &db, SSLSkipVerify: &yes,
	}
	withPassword := connectArgsOf(saved, strPtr("secret"))
	if withPassword.DbType != "mysql" || withPassword.Host != "10.0.0.1" || withPassword.Port != 3307 ||
		withPassword.Username != "u" || withPassword.Password != "secret" || withPassword.Database != "app" {
		t.Errorf("connect args mismatch: %+v", withPassword)
	}
	if !withPassword.SSL.Enabled || withPassword.SSL.CAPath != "app" || !withPassword.SSL.SkipVerify {
		t.Errorf("ssl flags come from the stored \"true\" strings: %+v", withPassword.SSL)
	}
	no := "false"
	saved.SSLEnabled, saved.SSLSkipVerify = &no, &no
	withoutPassword := connectArgsOf(saved, nil)
	if withoutPassword.Password != "" || withoutPassword.SSL.Enabled || withoutPassword.SSL.SkipVerify {
		t.Errorf("nil password and \"false\" flags must stay off: %+v", withoutPassword)
	}

	// 没启用隧道：参数原样返回，不需要收尾
	app := NewApp()
	args, stop, err := app.viaSSHTunnel("k", saved, withoutPassword)
	if err != nil || stop != nil || args.Database != "app" || args.Host != "10.0.0.1" {
		t.Errorf("without SSH the args must pass through: err=%v stop=%v args=%+v", err, stop != nil, args)
	}
}

// 设置页的工具清单来自注入的名单；没注入时不显示（而不是一份过期的手抄清单）
func TestGetMCPConfigToolListComesFromRegistration(t *testing.T) {
	app := NewApp()
	cfg, err := app.GetMCPConfig()
	if err != nil {
		t.Fatalf("GetMCPConfig: %v", err)
	}
	if cfg.Tools != "" {
		t.Errorf("without a tool lister Tools must be empty, got %q", cfg.Tools)
	}
	if cfg.ConfigJSON == "" || cfg.Platform == "" {
		t.Errorf("config JSON and platform must always be present: %+v", cfg)
	}

	app.SetMCPToolNamesFunc(func() []string { return []string{"a", "b", "c"} })
	cfg, err = app.GetMCPConfig()
	if err != nil {
		t.Fatalf("GetMCPConfig: %v", err)
	}
	if cfg.Tools != "a, b, c" {
		t.Errorf("Tools = %q, want %q", cfg.Tools, "a, b, c")
	}
}

// create_connection 复用已有连接前靠它验证新密码：只试连、不落库，连不上就报错
func TestCheckSavedConnectionPassword(t *testing.T) {
	app, connID := newSQLiteTestApp(t)

	// SQLite 不校验密码：按已存连接的配置能连上就算通过
	if err := app.CheckSavedConnectionPassword(connID, "anything"); err != nil {
		t.Fatalf("CheckSavedConnectionPassword: %v", err)
	}
	if pw, _ := app.GetConnectionPassword(connID); pw != "" {
		t.Errorf("checking a password must not save it, stored %q", pw)
	}
	if err := app.CheckSavedConnectionPassword("no-such-connection", "x"); err == nil {
		t.Error("an unknown connection must fail")
	}
	// 试连用的是独立的连接池：这个连接在应用里仍然没有连上，之后照常可以连
	if app.isActiveConn(connID) {
		t.Error("checking a password must not register the connection as active")
	}
	if err := app.ConnectDatabase(connID); err != nil {
		t.Fatalf("ConnectDatabase after a password check: %v", err)
	}

	// 真连不上的时候要报错：这就是「新密码不对」在真实库上的样子
	unreachable, err := app.SaveConnection(ConnectionInput{
		Name: "closed-port", DbType: "mysql", Host: "127.0.0.1", Port: 1, Username: "u",
		Password: strPtr("whatever"),
	})
	if err != nil {
		t.Fatalf("SaveConnection: %v", err)
	}
	if err := app.CheckSavedConnectionPassword(unreachable.ID, "whatever"); err == nil {
		t.Error("a server that refuses the connection must make the check fail")
	}
	if app.isActiveConn(unreachable.ID) {
		t.Error("a failed check must not register the connection as active")
	}
}
