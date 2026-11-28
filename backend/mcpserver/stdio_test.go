package mcpserver

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mark3labs/mcp-go/server"

	"idblink/backend"
)

// 协议层冒烟：真实的 MCPServer + StdioServer，用管道代替进程的 stdio。
// 其余用例都停在纯函数上；「SQL 报错不算失败」「只读门禁放行了写操作」「工具清单和注册不一致」
// 这类问题只有在真实的 tools/call 往返上才看得出来

type stdioReply struct {
	ID     json.RawMessage `json:"id"`
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

type toolReply struct {
	IsError bool `json:"isError"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	StructuredContent json.RawMessage `json:"structuredContent"`
}

func (r toolReply) text() string {
	var b strings.Builder
	for _, c := range r.Content {
		b.WriteString(c.Text)
	}
	return b.String()
}

// describedTool 是 tools/list 里的一项（只取这里要用的字段）；readOnlyAnnotated 看它有没有标只读
type describedTool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema map[string]any  `json:"inputSchema"`
	Annotations map[string]bool `json:"annotations"`
}

func readOnlyAnnotated(tools []describedTool, name string) bool {
	for _, tool := range tools {
		if tool.Name == name {
			return tool.Annotations["readOnlyHint"]
		}
	}
	return false
}

// stdioClient 一次只发一个请求、等到应答再发下一个，所以应答顺序是确定的
type stdioClient struct {
	t    *testing.T
	inW  *io.PipeWriter
	dec  *json.Decoder
	next int
}

func (c *stdioClient) request(method string, params any) stdioReply {
	c.t.Helper()
	c.next++
	id := c.next
	if err := json.NewEncoder(c.inW).Encode(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params}); err != nil {
		c.t.Fatalf("%s: write request: %v", method, err)
	}
	type boxed struct {
		reply stdioReply
		err   error
	}
	ch := make(chan boxed, 1)
	go func() {
		var reply stdioReply
		err := c.dec.Decode(&reply)
		ch <- boxed{reply, err}
	}()
	select {
	case b := <-ch:
		if b.err != nil {
			c.t.Fatalf("%s: read reply: %v", method, b.err)
		}
		if string(b.reply.ID) != fmt.Sprint(id) {
			c.t.Fatalf("%s: got a reply for id %s, want %d", method, b.reply.ID, id)
		}
		return b.reply
	case <-time.After(15 * time.Second):
		c.t.Fatalf("%s: no reply within 15s", method)
	}
	return stdioReply{}
}

func (c *stdioClient) notify(method string) {
	c.t.Helper()
	if err := json.NewEncoder(c.inW).Encode(map[string]any{"jsonrpc": "2.0", "method": method}); err != nil {
		c.t.Fatalf("%s: write notification: %v", method, err)
	}
}

// call 返回原始应答：工具不存在时是 JSON-RPC 错误，要区分得出来
func (c *stdioClient) call(name string, args map[string]any) (toolReply, stdioReply) {
	c.t.Helper()
	raw := c.request("tools/call", map[string]any{"name": name, "arguments": args})
	var reply toolReply
	if raw.Error == nil {
		if err := json.Unmarshal(raw.Result, &reply); err != nil {
			c.t.Fatalf("tools/call %s: decode result: %v", name, err)
		}
	}
	return reply, raw
}

func (c *stdioClient) tool(name string, args map[string]any) toolReply {
	c.t.Helper()
	reply, raw := c.call(name, args)
	if raw.Error != nil {
		c.t.Fatalf("tools/call %s: JSON-RPC error %d: %s", name, raw.Error.Code, raw.Error.Message)
	}
	return reply
}

// startStdioServer 用管道代替进程的 stdio 起一个真实的 StdioServer，测试结束时停掉
func startStdioServer(t *testing.T, srv *Server) *stdioClient {
	t.Helper()
	inR, inW := io.Pipe()
	outR, outW := io.Pipe()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		_ = server.NewStdioServer(srv.mcp).Listen(ctx, inR, outW)
		close(done)
	}()
	t.Cleanup(func() {
		cancel()
		_ = inW.Close()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Error("stdio server did not stop")
		}
	})
	return &stdioClient{t: t, inW: inW, dec: json.NewDecoder(bufio.NewReader(outR))}
}

// handshake 走 initialize，并检查握手里该有的东西都在
func (c *stdioClient) handshake(t *testing.T) {
	t.Helper()
	init := c.request("initialize", map[string]any{
		"protocolVersion": "2025-06-18",
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "smoke", "version": "0"},
	})
	if init.Error != nil {
		t.Fatalf("initialize: %v", init.Error.Message)
	}
	var initResult struct {
		ProtocolVersion string `json:"protocolVersion"`
		ServerInfo      struct {
			Name string `json:"name"`
		} `json:"serverInfo"`
		Capabilities map[string]any `json:"capabilities"`
		Instructions string         `json:"instructions"`
	}
	if err := json.Unmarshal(init.Result, &initResult); err != nil {
		t.Fatalf("decode initialize result: %v", err)
	}
	if initResult.ServerInfo.Name != serverName || initResult.ProtocolVersion == "" {
		t.Errorf("initialize = %+v", initResult)
	}
	if _, ok := initResult.Capabilities["tools"]; !ok {
		t.Errorf("server must advertise the tools capability: %v", initResult.Capabilities)
	}
	if initResult.Instructions == "" {
		t.Error("server instructions must be sent")
	}
	c.notify("notifications/initialized")
}

func TestStdioRoundTrip(t *testing.T) {
	// 数据目录在 ~/.idblink 下：HOME 指到临时目录，不碰真实数据
	t.Setenv("HOME", t.TempDir())
	// 强制开发模式：callHandler 的 [API] 调试输出只在开发模式下打印，而协议流就是进程的
	// stdout。此前它打到 stdout，开发构建挂 MCP 时每次查元数据都往协议流里掺一行非 JSON
	t.Setenv("WAILS_DEV", "1")

	app := backend.NewApp()
	if err := app.InitStandalone(); err != nil {
		t.Fatalf("InitStandalone: %v", err)
	}
	app.SetMCPToolNamesFunc(ToolNames)
	dbPath := filepath.Join(t.TempDir(), "smoke.db")
	conn, err := app.SaveConnection(backend.ConnectionInput{Name: "smoke-db", DbType: "sqlite", Host: "localhost", Database: &dbPath})
	if err != nil {
		t.Fatalf("SaveConnection: %v", err)
	}

	origStdout := os.Stdout
	stdoutR, stdoutW, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = stdoutW
	t.Cleanup(func() { os.Stdout = origStdout })

	srv := New(app)
	client := startStdioServer(t, srv)
	client.handshake(t)

	// ---- 工具清单：和注册一致，设置页的清单也和它一致 ----
	list := client.request("tools/list", map[string]any{})
	var tools struct {
		Tools []describedTool `json:"tools"`
	}
	if err := json.Unmarshal(list.Result, &tools); err != nil {
		t.Fatalf("decode tools/list: %v", err)
	}
	want := ToolNames()
	if len(tools.Tools) != len(want) {
		t.Fatalf("tools/list returned %d tools, ToolNames() has %d", len(tools.Tools), len(want))
	}
	descriptions := map[string]string{}
	listed := map[string]bool{}
	for _, tool := range tools.Tools {
		listed[tool.Name] = true
		descriptions[tool.Name] = tool.Description
		if tool.Description == "" || tool.InputSchema["type"] != "object" {
			t.Errorf("tool %s: description or input schema missing", tool.Name)
		}
	}
	for _, name := range want {
		if !listed[name] {
			t.Errorf("tool %s is in ToolNames() but not in tools/list", name)
		}
	}
	// 只读工具必须带 readOnlyHint：客户端据此免确认放行，写类工具必须带 destructiveHint
	for _, name := range []string{"execute_query", "explain_query", "describe_table", "list_tables"} {
		if !readOnlyAnnotated(tools.Tools, name) {
			t.Errorf("tool %s must carry readOnlyHint=true", name)
		}
	}
	for _, name := range []string{"execute_update", "execute_ddl", "execute_script", "execute_procedure", "kill_process"} {
		if readOnlyAnnotated(tools.Tools, name) {
			t.Errorf("tool %s must not claim to be read-only", name)
		}
	}
	// 描述里的两处事实性错误不能再回来：MCP 事务和桌面端互不相干；get_database_ddl 只有建库语句
	if strings.Contains(descriptions["begin_transaction"], "desktop tab") {
		t.Error("begin_transaction must not claim to put the desktop app's tab into a transaction")
	}
	if !strings.Contains(descriptions["get_database_ddl"], "does NOT contain table definitions") {
		t.Error("get_database_ddl must say that it does not return table definitions")
	}
	cfg, err := app.GetMCPConfig()
	if err != nil {
		t.Fatalf("GetMCPConfig: %v", err)
	}
	if cfg.Tools != strings.Join(want, ", ") {
		t.Errorf("settings page tool list = %q, want %q", cfg.Tools, strings.Join(want, ", "))
	}

	// 连接引用按名字解析（中间件），不用先 list_connections 拿 UUID
	ref := conn.Name

	// ---- 建表、写入 ----
	if reply := client.tool("execute_ddl", map[string]any{"connection_id": ref, "sql": "CREATE TABLE probe (id INTEGER PRIMARY KEY)"}); reply.IsError {
		t.Fatalf("execute_ddl: %s", reply.text())
	}
	if reply := client.tool("execute_ddl", map[string]any{"connection_id": ref, "sql": "CREATE VIEW probe_v AS SELECT id FROM probe"}); reply.IsError {
		t.Fatalf("execute_ddl (view): %s", reply.text())
	}
	// list_views 在真实连接上可用（瘦身投影由 TestViewsPayloadIsSlim 盯着）
	views := client.tool("list_views", map[string]any{"connection_id": ref})
	var viewsBody struct {
		Views []map[string]any `json:"views"`
	}
	if err := json.Unmarshal([]byte(views.text()), &viewsBody); err != nil || len(viewsBody.Views) != 1 || viewsBody.Views[0]["table_name"] != "probe_v" {
		t.Fatalf("list_views: %v %s", err, views.text())
	}
	for _, sql := range []string{
		// 藏第二条语句：PG 上靠 \ 和 $$ 的那几套在这里（SQLite 同样把 \ 当普通字符）必须被拦下
		`SELECT '\'; DROP TABLE probe; SELECT ''`,
		"PRAGMA user_version = 7",
		"EXPLAIN ANALYZE DELETE FROM probe",
		"USE otherdb",
	} {
		reply := client.tool("execute_query", map[string]any{"connection_id": ref, "sql": sql})
		if !reply.IsError {
			t.Errorf("execute_query %q must be rejected, got: %s", sql, reply.text())
		}
	}

	// ---- 查询：成功与 SQL 报错 ----
	ok := client.tool("execute_query", map[string]any{"connection_id": ref, "sql": "SELECT count(*) AS n FROM probe"})
	if ok.IsError {
		t.Fatalf("execute_query: %s", ok.text())
	}
	var query struct {
		Columns []string `json:"columns"`
		Rows    [][]any  `json:"rows"`
	}
	if err := json.Unmarshal([]byte(ok.text()), &query); err != nil {
		t.Fatalf("result text is not JSON: %v", err)
	}
	// structuredContent 必须是 JSON object：顶层数组会被严格客户端拒绝
	var structured map[string]any
	if err := json.Unmarshal(ok.StructuredContent, &structured); err != nil || structured == nil {
		t.Errorf("structuredContent must be a JSON object: %v (%s)", err, ok.StructuredContent)
	}
	if len(query.Rows) != 1 || fmt.Sprint(query.Rows[0][0]) != "0" {
		t.Errorf("unexpected rows: %v", query.Rows)
	}
	// PRAGMA 的读形式照常可用
	if reply := client.tool("execute_query", map[string]any{"connection_id": ref, "sql": "PRAGMA user_version"}); reply.IsError || !strings.Contains(reply.text(), "[[0]]") {
		t.Errorf("read-only pragma must still work and see no write: isError=%v %s", reply.IsError, reply.text())
	}

	failed := client.tool("execute_query", map[string]any{"connection_id": ref, "sql": "SELECT * FROM no_such_table"})
	if !failed.IsError || !strings.Contains(failed.text(), "no such table") {
		t.Errorf("a SQL error must be an error result: isError=%v %s", failed.IsError, failed.text())
	}

	// ---- 写入：成功带 rows_affected，SQL 报错算失败 ----
	inserted := client.tool("execute_update", map[string]any{"connection_id": ref, "sql": "INSERT INTO probe (id) VALUES (1)"})
	if inserted.IsError || !strings.Contains(inserted.text(), `"rows_affected":1`) {
		t.Errorf("insert: isError=%v %s", inserted.IsError, inserted.text())
	}
	conflict := client.tool("execute_update", map[string]any{"connection_id": ref, "sql": "INSERT INTO probe (id) VALUES (1)"})
	if !conflict.IsError || !strings.Contains(conflict.text(), "constraint") {
		t.Errorf("a failed update must be an error result: isError=%v %s", conflict.IsError, conflict.text())
	}
	// WITH … DML 归 execute_update
	if reply := client.tool("execute_update", map[string]any{"connection_id": ref, "sql": "WITH c AS (SELECT 2 AS id) INSERT INTO probe SELECT id FROM c"}); reply.IsError {
		t.Errorf("WITH ... INSERT must run through execute_update: %s", reply.text())
	}

	// ---- explain_query：ANALYZE 拒绝，其余只出计划 ----
	if reply := client.tool("explain_query", map[string]any{"connection_id": ref, "sql": "ANALYZE DELETE FROM probe"}); !reply.IsError {
		t.Errorf("explain_query must reject ANALYZE: %s", reply.text())
	}
	plan := client.tool("explain_query", map[string]any{"connection_id": ref, "sql": "SELECT * FROM probe"})
	if plan.IsError || !strings.Contains(plan.text(), `"explain_sql":"EXPLAIN QUERY PLAN SELECT * FROM probe"`) {
		t.Errorf("explain_query: isError=%v %s", plan.IsError, plan.text())
	}

	// ---- execute_script：部分失败时整体算失败，计数只数成功的 ----
	script := client.tool("execute_script", map[string]any{
		"connection_id": ref, "stop_on_error": false,
		"sql": "SELECT 1; SELECT * FROM no_such_table; SELECT 2",
	})
	if !script.IsError {
		t.Errorf("a script with a failed statement must be an error result: %s", script.text())
	}
	if !strings.Contains(script.text(), `"executed":2`) || !strings.Contains(script.text(), `"failed":1`) {
		t.Errorf("script counters must count successes and failures: %s", script.text())
	}
	if reply := client.tool("execute_script", map[string]any{
		"connection_id": ref, "sql": "INSERT INTO probe (id) VALUES (3); INSERT INTO probe (id) VALUES (3)",
	}); !reply.IsError || !strings.Contains(reply.text(), "transaction rolled back") {
		t.Errorf("a failing DML script must report the rollback: isError=%v %s", reply.IsError, reply.text())
	}
	if left, _ := client.call("execute_query", map[string]any{"connection_id": conn.ID, "sql": "SELECT count(*) AS n FROM probe WHERE id = 3"}); left.IsError || !strings.Contains(left.text(), "[[0]]") {
		t.Errorf("the rolled-back insert must not persist: %s", left.text())
	}

	// ---- create_connection 命中已有连接：新密码先验证，验证不过不动已存的密码 ----
	// （SQLite 不校验密码，这里换成可控的验证器；验证器本身由 backend 的用例盯着）
	srv.verifyPassword = func(connectionID, pw string) error {
		if pw != "good" {
			return errors.New("password authentication failed for user \"u\"")
		}
		return nil
	}
	badPassword := client.tool("create_connection", map[string]any{
		"name": "smoke-again", "db_type": "sqlite", "host": "localhost", "password": "bad",
	})
	if !badPassword.IsError || !strings.Contains(badPassword.text(), "saved password was kept") ||
		!strings.Contains(badPassword.text(), "password authentication failed") {
		t.Errorf("an unverifiable password must be refused: isError=%v %s", badPassword.IsError, badPassword.text())
	}
	if stored, _ := app.GetConnectionPassword(conn.ID); stored != "" {
		t.Errorf("a password that fails verification must not replace the saved one: %q", stored)
	}
	reused := client.tool("create_connection", map[string]any{
		"name": "smoke-again", "db_type": "sqlite", "host": "localhost", "password": "good",
	})
	if reused.IsError || !strings.Contains(reused.text(), `"id":"`+conn.ID+`"`) {
		t.Errorf("a verified password must be applied to the reused connection: isError=%v %s", reused.IsError, reused.text())
	}
	if stored, _ := app.GetConnectionPassword(conn.ID); stored != "good" {
		t.Errorf("the verified password must replace the saved one, got %q", stored)
	}

	// ---- execute_procedure：只收过程调用；调用本身的成败由数据库回答 ----
	if reply := client.tool("execute_procedure", map[string]any{"connection_id": ref, "sql": "SELECT 1"}); !reply.IsError {
		t.Errorf("execute_procedure must reject anything but a procedure call: %s", reply.text())
	}
	if reply := client.tool("execute_procedure", map[string]any{"connection_id": ref, "sql": "CALL nope(); DROP TABLE probe"}); !reply.IsError {
		t.Errorf("execute_procedure must reject multiple statements: %s", reply.text())
	}
	// SQLite 没有 CALL：语句发到了数据库，报的是数据库的语法错误
	if reply := client.tool("execute_procedure", map[string]any{"connection_id": ref, "sql": "CALL nope()"}); !reply.IsError || !strings.Contains(reply.text(), "syntax error") {
		t.Errorf("execute_procedure must report the database error: isError=%v %s", reply.IsError, reply.text())
	}
	// GRANT / REVOKE / COMMENT 归 execute_ddl（SQLite 不支持，报的同样是数据库的错，不是门禁的）
	if reply := client.tool("execute_ddl", map[string]any{"connection_id": ref, "sql": "GRANT SELECT ON probe TO someone"}); !reply.IsError || strings.Contains(reply.text(), "only allows a single schema statement") {
		t.Errorf("GRANT must pass the gate and be answered by the database: isError=%v %s", reply.IsError, reply.text())
	}

	// ---- 其它 ----
	unknown, raw := client.call("no_such_tool", map[string]any{})
	if !unknown.IsError && raw.Error == nil {
		t.Errorf("calling an unknown tool must fail: %s", unknown.text())
	}
	if reply := client.tool("execute_query", map[string]any{"connection_id": "no-such-connection", "sql": "SELECT 1"}); !reply.IsError || !strings.Contains(reply.text(), "no saved connection matches") {
		t.Errorf("unknown connection ref: isError=%v %s", reply.IsError, reply.text())
	}

	// ---- 协议流之外不能有输出：真的 os.Stdout 一个字节都不该收到 ----
	os.Stdout = origStdout
	_ = stdoutW.Close()
	written, err := io.ReadAll(stdoutR)
	if err != nil {
		t.Fatalf("read stdout: %v", err)
	}
	if len(written) != 0 {
		t.Errorf("stdout carries the MCP protocol, nothing else may write to it; got %q", written)
	}
}
