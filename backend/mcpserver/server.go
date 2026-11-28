// Package mcpserver 实现 iDBLink 的 MCP（Model Context Protocol）Server，
// 将数据库操作能力暴露给外部 AI 客户端（Claude Desktop、Cursor 等）。
//
// 传输方式：stdio sidecar——通过 CLI 子命令 `iDBLink --mcp --stdio` 启动，
// 不启动 GUI，外部 AI 客户端以子进程方式拉起。
//
// 所有 tool 复用 backend.App 的现有方法，核心业务逻辑零重写。
package mcpserver

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"idblink/backend"
)

// serverName / serverVersion 是 initialize 握手里报给客户端的身份
const (
	serverName    = "iDBLink"
	serverVersion = "0.1.0"
)

// Server 封装 MCP server，复用 iDBLink 现有 App 逻辑。
type Server struct {
	mcp *server.MCPServer
	app *backend.App
	// 已注册的工具名，按注册顺序。设置页的「可用工具」从这来（ToolNames），
	// 和注册走同一份代码，不会像手写清单那样漏掉新加的工具
	toolNames []string
	// create_connection 命中已有连接时，用它确认调用方给的新密码连得上，再决定换不换（测试可替换）
	verifyPassword func(connectionID, password string) error
}

// addTool 注册工具并记下名字。注册一律经它，不要直接调 s.mcp.AddTool
func (s *Server) addTool(tool mcp.Tool, handler server.ToolHandlerFunc) {
	s.mcp.AddTool(tool, handler)
	s.toolNames = append(s.toolNames, tool.Name)
}

// ToolNames 返回全部已注册工具的名字。只跑注册、不装中间件：给 GUI 进程里的设置页用
// （backend 包引用不了 mcpserver——方向是反的——所以由 main 注入，见 App.SetMCPToolNamesFunc）
func ToolNames() []string {
	srv := &Server{mcp: server.NewMCPServer(serverName, serverVersion)}
	srv.registerTools()
	return append([]string(nil), srv.toolNames...)
}

// serverInstructions MCP initialize 握手下发的 server 级说明（规范字段）。
// 逐工具描述只回答「这个工具怎么用」，这里回答「什么时候该找这个 server」——
// 多 MCP 环境下 agent 缺的正是这层选型指引。支持该字段的客户端会注入系统提示。
const serverInstructions = `iDBLink MCP — local database access layer.
Use these tools for ANY database task: querying data, exploring schema (tables/columns/indexes/DDL), data modification, and connection management. Do not ask the user for another SQL execution environment.
Conventions:
- connection_id accepts a unique host/name fragment like "11.114" — no need to call list_connections first; ambiguous refs return candidate IDs in the error, retry with one.
- execute_query is read-only, returns at most max_rows rows (default 100, max 1000); truncated=true means more rows exist — page with LIMIT/OFFSET. String cells over 300 chars are truncated.
- Writes: execute_update for INSERT/UPDATE/DELETE, execute_ddl for CREATE/DROP/ALTER/GRANT/COMMENT, execute_procedure to call stored procedures. Confirm with the user before destructive statements.
- Slow/stuck queries: list_processes to inspect live sessions, kill_process to terminate one (human confirmation dialog by default; force only with explicit user approval).
- Reuse saved connections; create new ones only when asked.`

// New 创建 MCP Server，注册所有 tool。
func New(app *backend.App) *Server {
	s := server.NewMCPServer(
		serverName,
		serverVersion,
		server.WithToolCapabilities(true),
		server.WithInstructions(serverInstructions),
		server.WithToolHandlerMiddleware(binaryWatchMiddleware()),
		server.WithToolHandlerMiddleware(connectionRefMiddleware(app)),
	)
	srv := &Server{mcp: s, app: app, verifyPassword: app.CheckSavedConnectionPassword}
	srv.registerTools()
	return srv
}

// ==================== 二进制更新自回收 ====================
//
// MCP sidecar 由 agent 客户端按会话拉起并长驻。应用重装/升级替换二进制后，
// 已在跑的 sidecar 仍用旧文件映像（macOS 替换文件后旧进程继续用旧 inode），
// 新代码不生效——用户此前需要手动杀进程。
//
// 这里让 sidecar 自检：启动时快照自身可执行文件的 mtime/size，之后每次
// 工具调用（外加 30s 空闲巡检）对比一次；发现文件已更换 → 服务完当前调用
// 后延迟退出。客户端下次拉起 sidecar 即为新二进制，实现「重装即生效」。

type exeSnapshot struct {
	modTimeUnix int64
	size        int64
}

func statExe() (exeSnapshot, bool) {
	p, err := os.Executable()
	if err != nil {
		return exeSnapshot{}, false
	}
	fi, err := os.Stat(p)
	if err != nil {
		return exeSnapshot{}, false
	}
	return exeSnapshot{modTimeUnix: fi.ModTime().Unix(), size: fi.Size()}, true
}

func exeChanged(initial, current exeSnapshot) bool {
	return current.size != initial.size || current.modTimeUnix > initial.modTimeUnix
}

// binaryWatcher 单例：发现更新后只触发一次退出。
type binaryWatcher struct {
	initial  exeSnapshot
	valid    bool
	exitOnce sync.Once
}

func newBinaryWatcher() *binaryWatcher {
	snap, ok := statExe()
	return &binaryWatcher{initial: snap, valid: ok}
}

// check 检查二进制是否已被替换。changed=true 表示应当在响应完当前调用后退出。
func (w *binaryWatcher) check() bool {
	if !w.valid {
		return false
	}
	cur, ok := statExe()
	if !ok {
		return false // 安装中途文件暂不可见，下轮再看
	}
	return exeChanged(w.initial, cur)
}

// recycleAfter 延迟退出：给 mcp-go 留出把当前响应写回 stdout 的时间。
func (w *binaryWatcher) recycleAfter() {
	w.exitOnce.Do(func() {
		fmt.Fprintln(os.Stderr, "[mcp] executable updated on disk, recycling to pick up the new binary")
		time.AfterFunc(500*time.Millisecond, func() { os.Exit(0) })
	})
}

func binaryWatchMiddleware() server.ToolHandlerMiddleware {
	w := newBinaryWatcher()
	// 空闲时也巡检：长驻但不接调用的 sidecar 同样需要回收
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if w.check() {
				w.recycleAfter()
				return
			}
		}
	}()
	return func(next server.ToolHandlerFunc) server.ToolHandlerFunc {
		return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			result, err := next(ctx, req)
			if w.check() {
				w.recycleAfter()
			}
			return result, err
		}
	}
}

// connectionRefMiddleware 在工具分派前把 connection_id 参数里的
// 主机/名称片段（如 "11.114"）解析成唯一连接的真实 ID 并原地替换。
// 调用方因此不必先 list_connections 拿 UUID；歧义/无匹配时直接返回
// 带候选列表（含真实 ID）的错误，调用方一次重试即可定位。
func connectionRefMiddleware(app *backend.App) server.ToolHandlerMiddleware {
	return func(next server.ToolHandlerFunc) server.ToolHandlerFunc {
		return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			args := req.GetArguments()
			if ref, ok := args["connection_id"].(string); ok && ref != "" {
				conns, err := app.GetConnections()
				if err != nil {
					return mcp.NewToolResultErrorFromErr("failed to resolve connection_id", err), nil
				}
				resolved, errRes := resolveConnectionRef(conns, ref)
				if errRes != nil {
					return errRes, nil
				}
				args["connection_id"] = resolved
			}
			return next(ctx, req)
		}
	}
}

// resolveConnectionRef 解析连接引用。优先级：精确 ID > 唯一主机片段 > 唯一名称片段。
// 返回非 nil 的错误结果表示解析失败（错误信息已带指引）。
func resolveConnectionRef(conns []backend.ConnectionOutput, ref string) (string, *mcp.CallToolResult) {
	for _, c := range conns {
		if c.ID == ref {
			return c.ID, nil
		}
	}

	lower := strings.ToLower(ref)
	var byHost, byName []backend.ConnectionOutput
	for _, c := range conns {
		switch {
		case strings.Contains(strings.ToLower(c.Host), lower):
			byHost = append(byHost, c)
		case strings.Contains(strings.ToLower(c.Name), lower):
			byName = append(byName, c)
		}
	}
	if len(byHost) == 1 {
		return byHost[0].ID, nil
	}
	if len(byName) == 1 && len(byHost) == 0 {
		return byName[0].ID, nil
	}

	if len(byHost)+len(byName) == 0 {
		return "", mcp.NewToolResultError(fmt.Sprintf(
			"no saved connection matches %q. Call list_connections to see available connections.", ref))
	}
	all := append(byHost, byName...)
	var sb strings.Builder
	for i, c := range all {
		if i > 0 {
			sb.WriteString("; ")
		}
		fmt.Fprintf(&sb, "%s %s (%s) [id=%s]", c.DbType, c.Host, c.Name, c.ID)
	}
	return "", mcp.NewToolResultError(fmt.Sprintf(
		"connection_id %q is ambiguous, matches: %s. Retry with one of the listed connection_id values.", ref, sb.String()))
}

// ServeStdio 以 stdio 传输模式启动 MCP Server（阻塞，直到客户端断开）。
func (s *Server) ServeStdio() error {
	return server.ServeStdio(s.mcp)
}

// registerTools 注册所有 MCP tool。
func (s *Server) registerTools() {
	s.registerConnectionTools()
	s.registerQueryTools()
	s.registerMutationTools()
	s.registerMetadataTools()
	s.registerProcessTools()
	s.registerAdvancedTools()
}

// timeoutParam 执行类工具共用的 timeout_seconds 参数
func timeoutParam() mcp.ToolOption {
	return mcp.WithNumber("timeout_seconds",
		mcp.Description("Optional timeout for this call in seconds (1-1800). A statement still running when it expires is "+
			"cancelled on the database; for execute_script the whole script shares this budget. "+
			"Omit to use the 30-minute long-operation limit"))
}

// ==================== 连接管理 tools ====================

func (s *Server) registerConnectionTools() {
	// list_connections — 列出所有已保存的连接（默认瘦身投影）
	s.addTool(
		mcp.NewTool("list_connections",
			mcp.WithDescription("List saved database connections. "+
				"Returns connection_id, name, db_type, host, port, username, database, status. "+
				"Use the connection_id to call other tools. "+
				"Set include_details=true only if you need SSH/SSL tunnel fields."),
			mcp.WithString("search",
				mcp.Description("Optional keyword to filter connections by name, host, db_type, or username")),
			mcp.WithBoolean("include_details",
				mcp.Description("Include SSH/SSL tunnel configuration fields (default false, omitted for brevity)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListConnections,
	)

	// create_connection — 新建连接
	s.addTool(
		mcp.NewTool("create_connection",
			mcp.WithDescription("Create a new database connection in iDBLink. "+
				"The connection is saved persistently and can be used by other tools. "+
				"Supported db_type: mysql, postgresql, oracle, sqlserver, sqlite, dameng, kingbase, highgo, vastbase, clickhouse, tdengine. "+
				"clickhouse covers ClickHouse-compatible forks (e.g. AIoTHouse) over the standard HTTP port. "+
				"Set ssh_host (or ssh_enabled=true) to reach databases through an SSH tunnel."),
			mcp.WithString("name", mcp.Required(),
				mcp.Description("A human-readable name for this connection, e.g. 'Production MySQL'")),
			mcp.WithString("db_type", mcp.Required(),
				mcp.Description("Database type"),
				mcp.Enum("mysql", "postgresql", "oracle", "sqlserver", "sqlite", "dameng", "kingbase", "highgo", "vastbase", "clickhouse", "tdengine")),
			mcp.WithString("host", mcp.Required(),
				mcp.Description("Database host address. With an SSH tunnel this is the database address as seen from the SSH host (e.g. 127.0.0.1 or an internal IP)")),
			mcp.WithNumber("port",
				mcp.Description("Database port. Optional: when omitted, inherits the port of an existing connection to the same server, else the default port for db_type")),
			mcp.WithString("username", mcp.Required(),
				mcp.Description("Database username")),
			mcp.WithString("password",
				mcp.Description("Database password (will be encrypted before storage). If a connection to the same server "+
					"and account already exists it is reused, and the password replaces the saved one only after "+
					"connecting with it succeeds")),
			mcp.WithString("database",
				mcp.Description("Default database/schema name (optional for some db types)")),
			mcp.WithBoolean("ssh_enabled",
				mcp.Description("Enable the SSH tunnel. Providing ssh_host implies true; set false to force a direct connection")),
			mcp.WithString("ssh_host", mcp.Description("SSH jump host address")),
			mcp.WithNumber("ssh_port", mcp.Description("SSH port (default 22)")),
			mcp.WithString("ssh_username", mcp.Description("SSH username")),
			mcp.WithString("ssh_auth_method",
				mcp.Description("SSH authentication method. Inferred from ssh_password/ssh_private_key_path when omitted"),
				mcp.Enum("password", "key")),
			mcp.WithString("ssh_password", mcp.Description("SSH password (encrypted before storage)")),
			mcp.WithString("ssh_private_key_path",
				mcp.Description("Path to the SSH private key on the machine running iDBLink (required when ssh_auth_method is \"key\")")),
			mcp.WithString("ssh_passphrase", mcp.Description("Passphrase of the SSH private key (encrypted before storage)")),
			mcp.WithBoolean("ssl_enabled",
				mcp.Description("Enable TLS/SSL. Providing any ssl_* path implies true; set false for plaintext")),
			mcp.WithString("ssl_ca_path", mcp.Description("Path to the CA certificate on the iDBLink host")),
			mcp.WithString("ssl_cert_path", mcp.Description("Path to the client certificate on the iDBLink host")),
			mcp.WithString("ssl_key_path", mcp.Description("Path to the client private key on the iDBLink host")),
			mcp.WithBoolean("ssl_skip_verify", mcp.Description("Skip server certificate verification (insecure, testing only)")),
		),
		s.handleCreateConnection,
	)

	// update_connection — 修改连接
	s.addTool(
		mcp.NewTool("update_connection",
			mcp.WithDescription("Update an existing database connection. "+
				"Only provided fields are updated; omitted fields keep their current values. "+
				"Pass password only when you want to change it; omit to keep the existing password. "+
				"SSH tunnel settings are kept unless ssh_* is provided; ssh_enabled=false disables the tunnel. "+
				"A full-server connection (no default database) cannot be narrowed to a specific database."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("The ID of the connection to update (from list_connections)")),
			mcp.WithString("name", mcp.Description("New display name")),
			mcp.WithString("db_type", mcp.Description("Database type")),
			mcp.WithString("host", mcp.Description("Database host")),
			mcp.WithNumber("port", mcp.Description("Database port")),
			mcp.WithString("username", mcp.Description("Database username")),
			mcp.WithString("password", mcp.Description("New password (omit to keep existing)")),
			mcp.WithString("database", mcp.Description("Default database/schema")),
			mcp.WithBoolean("ssh_enabled",
				mcp.Description("Omit to keep the current SSH settings; true enables the tunnel; false disables it")),
			mcp.WithString("ssh_host", mcp.Description("SSH jump host address (keeps the current value when omitted)")),
			mcp.WithNumber("ssh_port", mcp.Description("SSH port (keeps the current value when omitted)")),
			mcp.WithString("ssh_username", mcp.Description("SSH username (keeps the current value when omitted)")),
			mcp.WithString("ssh_auth_method",
				mcp.Description("SSH authentication method (keeps the current value when omitted)"),
				mcp.Enum("password", "key")),
			mcp.WithString("ssh_password", mcp.Description("New SSH password (omit to keep existing)")),
			mcp.WithString("ssh_private_key_path", mcp.Description("Path to the SSH private key on the iDBLink host")),
			mcp.WithString("ssh_passphrase", mcp.Description("New SSH key passphrase (omit to keep existing)")),
			mcp.WithBoolean("ssl_enabled",
				mcp.Description("Omit to keep the current SSL settings; true enables TLS; false disables it")),
			mcp.WithString("ssl_ca_path", mcp.Description("CA certificate path (keeps the current value when omitted)")),
			mcp.WithString("ssl_cert_path", mcp.Description("Client certificate path (keeps the current value when omitted)")),
			mcp.WithString("ssl_key_path", mcp.Description("Client private key path (keeps the current value when omitted)")),
			mcp.WithBoolean("ssl_skip_verify", mcp.Description("Skip server certificate verification")),
		),
		s.handleUpdateConnection,
	)

	// delete_connection — 删除连接
	s.addTool(
		mcp.NewTool("delete_connection",
			mcp.WithDescription("Delete a database connection permanently. "+
				"This does NOT drop the actual database; it only removes the connection config from iDBLink."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("The ID of the connection to delete")),
			mcp.WithDestructiveHintAnnotation(true),
		),
		s.handleDeleteConnection,
	)

	// test_connection — 测试连接配置（不保存）
	s.addTool(
		mcp.NewTool("test_connection",
			mcp.WithDescription("Test a database connection without saving it. "+
				"Useful to verify credentials before calling create_connection. "+
				"Pass ssh_host to test through an SSH tunnel."),
			mcp.WithString("db_type", mcp.Required(), mcp.Description("Database type")),
			mcp.WithString("host", mcp.Required(), mcp.Description("Database host")),
			mcp.WithNumber("port", mcp.Required(), mcp.Description("Database port")),
			mcp.WithString("username", mcp.Required(), mcp.Description("Database username")),
			mcp.WithString("password", mcp.Description("Database password")),
			mcp.WithString("database", mcp.Description("Database name")),
			mcp.WithString("ssh_host", mcp.Description("SSH jump host address")),
			mcp.WithNumber("ssh_port", mcp.Description("SSH port (default 22)")),
			mcp.WithString("ssh_username", mcp.Description("SSH username")),
			mcp.WithString("ssh_auth_method",
				mcp.Description("SSH authentication method. Inferred from ssh_password/ssh_private_key_path when omitted"),
				mcp.Enum("password", "key")),
			mcp.WithString("ssh_password", mcp.Description("SSH password")),
			mcp.WithString("ssh_private_key_path",
				mcp.Description("Path to the SSH private key on the machine running iDBLink")),
			mcp.WithString("ssh_passphrase", mcp.Description("Passphrase of the SSH private key")),
			mcp.WithBoolean("ssl_enabled", mcp.Description("Enable TLS/SSL")),
			mcp.WithString("ssl_ca_path", mcp.Description("CA certificate path")),
			mcp.WithString("ssl_cert_path", mcp.Description("Client certificate path")),
			mcp.WithString("ssl_key_path", mcp.Description("Client private key path")),
			mcp.WithBoolean("ssl_skip_verify", mcp.Description("Skip server certificate verification")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleTestConnection,
	)
}

// ==================== 查询 tools ====================

func (s *Server) registerQueryTools() {
	// list_databases
	s.addTool(
		mcp.NewTool("list_databases",
			mcp.WithDescription("List all available databases/schemas on a connection. "+
				"Useful when you need to find which databases exist before querying tables."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListDatabases,
	)

	// list_tables
	s.addTool(
		mcp.NewTool("list_tables",
			mcp.WithDescription("List tables and views in a database. "+
				"Returns table_name, table_type, row_count, and comment. "+
				"For full column/index details use describe_table; for exact DDL use get_table_ddl. "+
				"Optionally filter by a search keyword."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database/schema name (optional, uses default if omitted)")),
			mcp.WithString("schema",
				mcp.Description("Only return tables from this schema (PostgreSQL/SQL Server/Oracle)")),
			mcp.WithString("search",
				mcp.Description("Optional keyword to filter table names")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListTables,
	)

	// describe_table
	s.addTool(
		mcp.NewTool("describe_table",
			mcp.WithDescription("Get the full structure of a table: columns (name, type, nullable, default), "+
				"primary keys, indexes, and foreign keys. Use this before writing complex queries "+
				"to understand the schema."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("table_name", mcp.Required(), mcp.Description("Table name")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithString("schema",
				mcp.Description("Schema name for PostgreSQL/SQL Server/Oracle (optional)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleDescribeTable,
	)

	// get_table_ddl
	s.addTool(
		mcp.NewTool("get_table_ddl",
			mcp.WithDescription("Get the CREATE TABLE DDL statement for a table. "+
				"Useful to understand exact column definitions, constraints, and indexes."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("table_name", mcp.Required(), mcp.Description("Table name")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithString("schema",
				mcp.Description("Schema name for PostgreSQL/SQL Server/Oracle (optional)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetTableDDL,
	)

	// execute_query — 只读查询，强制白名单，带行数/单元格预算
	s.addTool(
		mcp.NewTool("execute_query",
			mcp.WithDescription("Execute a single read-only SQL statement (SELECT, WITH ... SELECT, SHOW, DESCRIBE, TABLE, "+
				"read-only PRAGMA, EXPLAIN without ANALYZE). "+
				"Returns columns and rows as JSON; isError=true when the database rejects the statement (details in the error field). "+
				"Rows are capped at max_rows (default 100, max 1000); "+
				"when truncated=true is set, more rows exist — add LIMIT/OFFSET or raise max_rows to page through. "+
				"String cells longer than 300 chars are truncated with a length note. "+
				"Rejected: multiple statements, SELECT ... INTO, data-modifying CTEs, EXPLAIN ANALYZE (it executes the statement), "+
				"USE (pass the database parameter instead). "+
				"Use execute_update for INSERT/UPDATE/DELETE, execute_ddl for schema changes. "+
				"connection_id accepts a unique host/name fragment like '11.114' — no need to call list_connections first."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("A single read-only SQL statement (SELECT, WITH, SHOW, DESCRIBE)")),
			mcp.WithNumber("max_rows",
				mcp.Description("Max rows to return, 1-1000 (default 100). Result carries truncated=true when more rows exist")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			timeoutParam(),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleExecuteQuery,
	)
}

// ==================== 写操作 tools ====================

func (s *Server) registerMutationTools() {
	// execute_update — DML only
	s.addTool(
		mcp.NewTool("execute_update",
			mcp.WithDescription("Execute a single data modification statement (INSERT, UPDATE, DELETE, REPLACE, MERGE), "+
				"optionally starting with a WITH clause. "+
				"Returns the number of rows affected; isError=true when the database rejects the statement (details in the error field). "+
				"For schema changes (CREATE/DROP/ALTER TABLE), use execute_ddl."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("A single INSERT, UPDATE, DELETE, REPLACE, or MERGE statement (may start with WITH)")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			timeoutParam(),
			mcp.WithDestructiveHintAnnotation(true),
		),
		s.handleExecuteUpdate,
	)

	// execute_script — 批量执行多语句脚本
	s.addTool(
		mcp.NewTool("execute_script",
			mcp.WithDescription("Execute a multi-statement SQL script in batch (up to 100 statements). "+
				"All statements must belong to the SAME category — all read-only (SELECT/SHOW/...), "+
				"all DML (INSERT/UPDATE/DELETE/REPLACE/MERGE), or all DDL (CREATE/DROP/ALTER/TRUNCATE/RENAME); "+
				"mixed or non-whitelisted scripts are rejected. "+
				"DML scripts run in a single transaction and roll back on any error; "+
				"DDL runs sequentially and stops on error by default (succeeded DDL is not rolled back). "+
				"On PostgreSQL-family databases a $tag$ function body counts as one statement, "+
				"so CREATE FUNCTION scripts with semicolons inside the body are accepted. "+
				"Read-only statements return at most 50 rows each. "+
				"With stop_on_error=false the result lists each failure and the call is reported as an error (isError=true). "+
				"Useful for migrations, seed data, and schema scripts."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("Multi-statement SQL script, statements separated by semicolons "+
					"(semicolons inside string literals are respected)")),
			mcp.WithString("database",
				mcp.Description("Database/schema to execute against (optional, temporary — does NOT modify the saved connection)")),
			mcp.WithBoolean("stop_on_error",
				mcp.Description("Stop at the first failing statement instead of continuing (default true; applies to read-only and DDL scripts — DML always stops and rolls back)")),
			timeoutParam(),
			mcp.WithDestructiveHintAnnotation(true),
		),
		s.handleExecuteScript,
	)
}

// ==================== 元数据/DDL tools ====================

func (s *Server) registerMetadataTools() {
	// execute_ddl — DDL 及同级的结构类语句（CREATE/DROP/ALTER/TRUNCATE/RENAME/GRANT/REVOKE/COMMENT）
	s.addTool(
		mcp.NewTool("execute_ddl",
			mcp.WithDescription("Execute a single schema statement (CREATE, DROP, ALTER, TRUNCATE, RENAME, "+
				"GRANT, REVOKE, COMMENT ON) to create or modify database structure and privileges "+
				"(tables, views, indexes, functions, grants, object comments). "+
				"On PostgreSQL-family databases a $tag$ body counts as one statement, so CREATE FUNCTION / "+
				"PROCEDURE / TRIGGER with semicolons in the body can be sent as is; on other databases "+
				"a body containing semicolons is rejected (execute it from the SQL editor instead). "+
				"DML (INSERT/UPDATE/DELETE/REPLACE) is rejected; use execute_update for data changes, "+
				"execute_procedure to call a stored procedure."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("A single statement (CREATE TABLE, ALTER TABLE, DROP TABLE, CREATE VIEW, GRANT SELECT ON ..., COMMENT ON TABLE ... IS ...)")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			timeoutParam(),
			mcp.WithDestructiveHintAnnotation(true),
		),
		s.handleExecuteDDL,
	)

	// execute_procedure — 调用存储过程（过程体里做了什么由数据库决定）
	s.addTool(
		mcp.NewTool("execute_procedure",
			mcp.WithDescription("Call a stored procedure, or run a PostgreSQL anonymous block. "+
				"Accepted forms: CALL name(args) — MySQL, PostgreSQL, Dameng, Kingbase, Oracle; "+
				"EXEC / EXECUTE name args — SQL Server; DO $$ ... $$ — PostgreSQL. "+
				"Any result set the call returns comes back as rows (capped at 1000); "+
				"isError=true when the call fails (details in the error field). "+
				"A procedure can change data, so check what it does before calling it. "+
				"Anonymous blocks written as BEGIN ... END; are rejected (run them from the SQL editor); "+
				"for plain DML use execute_update, for DDL use execute_ddl."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("A single procedure call (CALL calc_totals(2024), EXEC dbo.calc_totals @year = 2024, DO $$ ... $$)")),
			mcp.WithString("database",
				mcp.Description("Database/schema to use (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			timeoutParam(),
			mcp.WithDestructiveHintAnnotation(true),
		),
		s.handleExecuteProcedure,
	)

	// list_views — 列出视图
	s.addTool(
		mcp.NewTool("list_views",
			mcp.WithDescription("List all views in a database/schema. "+
				"Returns view names. Use get_table_ddl to get the view definition."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithString("schema",
				mcp.Description("Only return views from this schema (PostgreSQL/SQL Server/Oracle)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListViews,
	)

	// list_procedures — 列出存储过程
	s.addTool(
		mcp.NewTool("list_procedures",
			mcp.WithDescription("List all stored procedures in a database/schema. "+
				"Use get_procedure_body to get the source code of a specific procedure."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListProcedures,
	)

	// get_procedure_body — 获取存储过程源码
	s.addTool(
		mcp.NewTool("get_procedure_body",
			mcp.WithDescription("Get the source code (body) of a stored procedure. "+
				"On PostgreSQL-family databases the procedure can be picked by schema (schema parameter, or schema.name); "+
				"on other databases only its name is used."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("procedure_name", mcp.Required(), mcp.Description("Procedure name")),
			mcp.WithString("schema",
				mcp.Description("Schema the procedure lives in (PostgreSQL family only; may also be written as schema.name)")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetProcedureBody,
	)

	// list_functions — 列出函数
	s.addTool(
		mcp.NewTool("list_functions",
			mcp.WithDescription("List all functions in a database/schema. "+
				"Use get_function_body to get the source code of a specific function."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListFunctions,
	)

	// get_function_body — 获取函数源码
	s.addTool(
		mcp.NewTool("get_function_body",
			mcp.WithDescription("Get the source code (body) of a function. "+
				"On PostgreSQL-family databases the function can be picked by schema (schema parameter, or schema.name); "+
				"overloads that share a name cannot be selected individually — the first match is returned."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("function_name", mcp.Required(), mcp.Description("Function name")),
			mcp.WithString("schema",
				mcp.Description("Schema the function lives in (PostgreSQL family only; may also be written as schema.name)")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetFunctionBody,
	)

	// list_triggers — 列出触发器
	s.addTool(
		mcp.NewTool("list_triggers",
			mcp.WithDescription("List all triggers in a database/schema, "+
				"including their associated table, timing (BEFORE/AFTER), and event (INSERT/UPDATE/DELETE)."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListTriggers,
	)

	// list_sequences — 列出序列
	s.addTool(
		mcp.NewTool("list_sequences",
			mcp.WithDescription("List all sequences in a database/schema, "+
				"including current value, min/max, and increment."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListSequences,
	)

	// get_database_ddl — 整库 DDL
	s.addTool(
		mcp.NewTool("get_database_ddl",
			mcp.WithDescription("Get the CREATE statement of the database/schema itself "+
				"(on MySQL the real SHOW CREATE DATABASE output with charset and collation; on other databases a plain "+
				"CREATE DATABASE <name> template). It does NOT contain table definitions — "+
				"use list_tables and get_table_ddl for those."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database", mcp.Required(), mcp.Description("Database/schema name")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetDatabaseDDL,
	)
}

// ==================== 进程管理 tools ====================

func (s *Server) registerProcessTools() {
	// list_processes — 只读，无门禁
	s.addTool(
		mcp.NewTool("list_processes",
			mcp.WithDescription("List active database sessions/processes (equivalent to SHOW PROCESSLIST). "+
				"Use it to find slow or stuck queries: look at time/duration, state, and the info column (running SQL). "+
				"Use kill_process to terminate one after human confirmation."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database/schema (optional, for servers that scope the process list)")),
		),
		s.handleListProcesses,
	)

	// kill_process — 高危，默认 elicitation 协议级人工确认
	s.addTool(
		mcp.NewTool("kill_process",
			mcp.WithDescription("Terminate a database process/session (KILL / pg_terminate_backend / "+
				"ALTER SYSTEM KILL SESSION). DANGEROUS and irreversible. "+
				"By default a human-confirmation dialog (elicitation) is shown to the user with the process details; "+
				"the kill only runs if the user approves — you cannot answer it yourself. "+
				"If the client does not support elicitation the call fails with guidance; only retry with force=true "+
				"after the user explicitly approved in the conversation. "+
				"Always call list_processes first to show the user what you intend to kill."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("process_id", mcp.Required(),
				mcp.Description("Process/session ID (numeric), from list_processes")),
			mcp.WithString("serial",
				mcp.Description("SERIAL# of the session — required for Oracle/Dameng")),
			mcp.WithString("database",
				mcp.Description("Database/schema (optional)")),
			mcp.WithBoolean("force",
				mcp.Description("Skip the human-confirmation dialog and execute immediately. "+
					"Only use after the user explicitly approved in the conversation.")),
			mcp.WithDestructiveHintAnnotation(true),
			mcp.WithIdempotentHintAnnotation(false),
		),
		s.handleKillProcess,
	)
}

// ==================== 高级工具 ====================

func (s *Server) registerAdvancedTools() {
	// list_schemas — 列出 Schema（PostgreSQL/SQL Server/Oracle 等 database 下的命名空间）
	s.addTool(
		mcp.NewTool("list_schemas",
			mcp.WithDescription("List schemas in a database (PostgreSQL, SQL Server, Oracle, Dameng). "+
				"For MySQL a schema equals a database, so this is less useful there."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database to list schemas for (optional; uses the connection default)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListSchemas,
	)

	// search_columns — 跨表搜索列名
	s.addTool(
		mcp.NewTool("search_columns",
			mcp.WithDescription("Search columns across all tables in a database. "+
				"Returns table, schema, column_name, data_type, is_nullable, column_key. "+
				"Useful for finding which tables contain a given field."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database/schema to search (optional)")),
			mcp.WithString("search",
				mcp.Description("Case-insensitive substring to match against column names")),
			mcp.WithString("table",
				mcp.Description("Case-insensitive substring to match against table names")),
			mcp.WithString("schema",
				mcp.Description("Only return columns from this schema (PostgreSQL/SQL Server/Oracle)")),
			mcp.WithNumber("max_results",
				mcp.Description("Maximum rows to return (default 200, max 500)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleSearchColumns,
	)

	// get_table_info — 单表元信息（大小/引擎/字符集/注释）
	s.addTool(
		mcp.NewTool("get_table_info",
			mcp.WithDescription("Get detailed info for a single table: row count, data/index size, "+
				"engine, collation, comment, timestamps. Use it to gauge table scale before querying."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("table_name", mcp.Required(),
				mcp.Description("Table name")),
			mcp.WithString("database",
				mcp.Description("Database/schema containing the table (optional)")),
			mcp.WithString("schema",
				mcp.Description("Schema name for PostgreSQL/SQL Server/Oracle (optional)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetTableInfo,
	)

	// explain_query — 方言感知的执行计划
	s.addTool(
		mcp.NewTool("explain_query",
			mcp.WithDescription("Return the query execution plan for a single statement "+
				"(SELECT, WITH, INSERT, UPDATE, DELETE, MERGE). "+
				"Read-only: EXPLAIN only produces the plan, it never executes the statement — which is why "+
				"ANALYZE is rejected here (EXPLAIN ANALYZE does run the statement). "+
				"Useful to diagnose slow queries."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("A single SQL statement to explain (no ANALYZE, no multiple statements)")),
			mcp.WithString("database",
				mcp.Description("Database to run the plan in (optional)")),
			timeoutParam(),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleExplainQuery,
	)

	// list_users / list_privileges
	s.addTool(
		mcp.NewTool("list_users",
			mcp.WithDescription("List database users/roles and their type (superuser vs normal)."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database to scope (optional)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListUsers,
	)
	s.addTool(
		mcp.NewTool("list_privileges",
			mcp.WithDescription("List privileges granted to a database user. "+
				"For MySQL, pass the user's host too (e.g. '%' or 'localhost')."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("username", mcp.Required(),
				mcp.Description("Database username")),
			mcp.WithString("host",
				mcp.Description("Host part of a MySQL account (optional; '%' for wildcard)")),
			mcp.WithString("database",
				mcp.Description("Database to scope (optional)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListPrivileges,
	)

	// get_server_info — 服务器版本/字符集/运行信息
	s.addTool(
		mcp.NewTool("get_server_info",
			mcp.WithDescription("Get database server info: version, character set, collation, uptime, max connections. "+
				"Useful for generating version-correct SQL."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database to scope (optional)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetServerInfo,
	)

	// 事务工具
	s.addTool(
		mcp.NewTool("begin_transaction",
			mcp.WithDescription("Begin a transaction for this MCP session on the connection. "+
				"It is independent of the desktop app (separate process) and of its editor tabs; "+
				"only the execute_* calls you make on this connection join it. "+
				"Wrap multi-step writes with begin/commit/rollback for atomicity; the server watchdog auto-rolls-back transactions "+
				"that have been idle for 5 minutes (counted from the last statement). Statements inside the transaction must pass the same `database` value "+
				"(or omit it if the transaction was begun without one): a transaction cannot span databases. "+
				"If the watchdog rolled the transaction back, further statements are refused until you call "+
				"begin_transaction again or commit/rollback_transaction."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database the transaction applies to. Omit to use the connection's default database. "+
					"Pass the same value to the execute_* tools you want inside this transaction.")),
		),
		s.handleBeginTransaction,
	)
	s.addTool(
		mcp.NewTool("commit_transaction",
			mcp.WithDescription("Commit the active transaction on the connection."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
		),
		s.handleCommitTransaction,
	)
	s.addTool(
		mcp.NewTool("rollback_transaction",
			mcp.WithDescription("Roll back the active transaction on the connection."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
		),
		s.handleRollbackTransaction,
	)
	s.addTool(
		mcp.NewTool("get_transaction_status",
			mcp.WithDescription("Check whether the connection currently has an active transaction."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetTransactionStatus,
	)
}
