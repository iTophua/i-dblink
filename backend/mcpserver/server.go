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

// Server 封装 MCP server，复用 iDBLink 现有 App 逻辑。
type Server struct {
	mcp *server.MCPServer
	app *backend.App
}

// serverInstructions MCP initialize 握手下发的 server 级说明（规范字段）。
// 逐工具描述只回答「这个工具怎么用」，这里回答「什么时候该找这个 server」——
// 多 MCP 环境下 agent 缺的正是这层选型指引。支持该字段的客户端会注入系统提示。
const serverInstructions = `iDBLink MCP — local database access layer.
Use these tools for ANY database task: querying data, exploring schema (tables/columns/indexes/DDL), data modification, and connection management. Do not ask the user for another SQL execution environment.
Conventions:
- connection_id accepts a unique host/name fragment like "11.114" — no need to call list_connections first; ambiguous refs return candidate IDs in the error, retry with one.
- execute_query is read-only, returns at most max_rows rows (default 100, max 1000); truncated=true means more rows exist — page with LIMIT/OFFSET. String cells over 300 chars are truncated.
- Writes: execute_update for INSERT/UPDATE/DELETE, execute_ddl for CREATE/DROP/ALTER. Confirm with the user before destructive statements.
- Reuse saved connections; create new ones only when asked.`

// New 创建 MCP Server，注册所有 tool。
func New(app *backend.App) *Server {
	s := server.NewMCPServer(
		"iDBLink",
		"0.1.0",
		server.WithToolCapabilities(true),
		server.WithInstructions(serverInstructions),
		server.WithToolHandlerMiddleware(binaryWatchMiddleware()),
		server.WithToolHandlerMiddleware(connectionRefMiddleware(app)),
	)
	srv := &Server{mcp: s, app: app}
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
	initial exeSnapshot
	valid   bool
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
}

// ==================== 连接管理 tools ====================

func (s *Server) registerConnectionTools() {
	// list_connections — 列出所有已保存的连接（默认瘦身投影）
	s.mcp.AddTool(
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
	s.mcp.AddTool(
		mcp.NewTool("create_connection",
			mcp.WithDescription("Create a new database connection in iDBLink. "+
				"The connection is saved persistently and can be used by other tools. "+
				"Supported db_type: mysql, postgresql, oracle, sqlserver, sqlite, dameng, kingbase, highgo, vastbase."),
			mcp.WithString("name", mcp.Required(),
				mcp.Description("A human-readable name for this connection, e.g. 'Production MySQL'")),
			mcp.WithString("db_type", mcp.Required(),
				mcp.Description("Database type"),
				mcp.Enum("mysql", "postgresql", "oracle", "sqlserver", "sqlite", "dameng", "kingbase", "highgo", "vastbase")),
			mcp.WithString("host", mcp.Required(),
				mcp.Description("Database host address")),
			mcp.WithNumber("port",
				mcp.Description("Database port. Optional: when omitted, inherits the port of an existing connection to the same server, else the default port for db_type")),
			mcp.WithString("username", mcp.Required(),
				mcp.Description("Database username")),
			mcp.WithString("password",
				mcp.Description("Database password (will be encrypted before storage)")),
			mcp.WithString("database",
				mcp.Description("Default database/schema name (optional for some db types)")),
		),
		s.handleCreateConnection,
	)

	// update_connection — 修改连接
	s.mcp.AddTool(
		mcp.NewTool("update_connection",
			mcp.WithDescription("Update an existing database connection. "+
				"Only provided fields are updated; omitted fields keep their current values. "+
				"Pass password only when you want to change it; omit to keep the existing password. "+
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
		),
		s.handleUpdateConnection,
	)

	// delete_connection — 删除连接
	s.mcp.AddTool(
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
	s.mcp.AddTool(
		mcp.NewTool("test_connection",
			mcp.WithDescription("Test a database connection without saving it. "+
				"Useful to verify credentials before calling create_connection."),
			mcp.WithString("db_type", mcp.Required(), mcp.Description("Database type")),
			mcp.WithString("host", mcp.Required(), mcp.Description("Database host")),
			mcp.WithNumber("port", mcp.Required(), mcp.Description("Database port")),
			mcp.WithString("username", mcp.Required(), mcp.Description("Database username")),
			mcp.WithString("password", mcp.Description("Database password")),
			mcp.WithString("database", mcp.Description("Database name")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleTestConnection,
	)
}

// ==================== 查询 tools ====================

func (s *Server) registerQueryTools() {
	// list_databases
	s.mcp.AddTool(
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
		s.mcp.AddTool(
			mcp.NewTool("list_tables",
				mcp.WithDescription("List tables and views in a database. "+
					"Returns table_name, table_type, row_count, and comment. "+
					"For full column/index details use describe_table; for exact DDL use get_table_ddl. "+
					"Optionally filter by a search keyword."),
				mcp.WithString("connection_id", mcp.Required(),
					mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
				mcp.WithString("database",
					mcp.Description("Database/schema name (optional, uses default if omitted)")),
				mcp.WithString("search",
					mcp.Description("Optional keyword to filter table names")),
				mcp.WithReadOnlyHintAnnotation(true),
			),
			s.handleListTables,
		)

	// describe_table
	s.mcp.AddTool(
		mcp.NewTool("describe_table",
			mcp.WithDescription("Get the full structure of a table: columns (name, type, nullable, default), "+
				"primary keys, indexes, and foreign keys. Use this before writing complex queries "+
				"to understand the schema."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("table_name", mcp.Required(), mcp.Description("Table name")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleDescribeTable,
	)

	// get_table_ddl
	s.mcp.AddTool(
		mcp.NewTool("get_table_ddl",
			mcp.WithDescription("Get the CREATE TABLE DDL statement for a table. "+
				"Useful to understand exact column definitions, constraints, and indexes."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("table_name", mcp.Required(), mcp.Description("Table name")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetTableDDL,
	)

	// execute_query — 只读查询，强制白名单，带行数/单元格预算
	s.mcp.AddTool(
		mcp.NewTool("execute_query",
			mcp.WithDescription("Execute a read-only SQL query (SELECT, WITH, EXPLAIN, SHOW, DESCRIBE). "+
				"Returns columns and rows as JSON. Rows are capped at max_rows (default 100, max 1000); "+
				"when truncated=true is set, more rows exist — add LIMIT/OFFSET or raise max_rows to page through. "+
				"String cells longer than 300 chars are truncated with a length note. "+
				"Only read-only statements are allowed; use execute_update for INSERT/UPDATE/DELETE, execute_ddl for schema changes. "+
				"connection_id accepts a unique host/name fragment like '11.114' — no need to call list_connections first."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("A single read-only SQL statement (SELECT, WITH, SHOW, EXPLAIN, DESCRIBE)")),
			mcp.WithNumber("max_rows",
				mcp.Description("Max rows to return, 1-1000 (default 100). Result carries truncated=true when more rows exist")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleExecuteQuery,
	)
}

// ==================== 写操作 tools ====================

func (s *Server) registerMutationTools() {
	// execute_update — DML only
	s.mcp.AddTool(
		mcp.NewTool("execute_update",
			mcp.WithDescription("Execute a data modification statement (INSERT, UPDATE, DELETE, REPLACE, MERGE). "+
				"Returns the number of rows affected. "+
				"For schema changes (CREATE/DROP/ALTER TABLE), use execute_ddl."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("A single INSERT, UPDATE, DELETE, or REPLACE statement")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithDestructiveHintAnnotation(true),
		),
		s.handleExecuteUpdate,
	)

	// execute_script — 批量执行多语句脚本
	s.mcp.AddTool(
		mcp.NewTool("execute_script",
			mcp.WithDescription("Execute a multi-statement SQL script in batch (up to 100 statements). "+
				"All statements must belong to the SAME category — all read-only (SELECT/SHOW/...), "+
				"all DML (INSERT/UPDATE/DELETE/REPLACE/MERGE), or all DDL (CREATE/DROP/ALTER/TRUNCATE/RENAME); "+
				"mixed or non-whitelisted scripts are rejected. "+
				"DML scripts run in a single transaction and roll back on any error; "+
				"DDL runs sequentially and stops on error by default (succeeded DDL is not rolled back). "+
				"Useful for migrations, seed data, and schema scripts."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("Multi-statement SQL script, statements separated by semicolons "+
					"(semicolons inside string literals are respected)")),
			mcp.WithString("database",
				mcp.Description("Database/schema to execute against (optional, temporary — does NOT modify the saved connection)")),
			mcp.WithBoolean("stop_on_error",
				mcp.Description("Stop at the first failing statement instead of continuing (default true; applies to read-only and DDL scripts — DML always stops and rolls back)")),
			mcp.WithDestructiveHintAnnotation(true),
		),
		s.handleExecuteScript,
	)
}

// ==================== 元数据/DDL tools ====================

func (s *Server) registerMetadataTools() {
	// execute_ddl — DDL（CREATE/DROP/ALTER/TRUNCATE/RENAME）
	s.mcp.AddTool(
		mcp.NewTool("execute_ddl",
			mcp.WithDescription("Execute a DDL statement (CREATE, DROP, ALTER, TRUNCATE, RENAME) "+
				"to create or modify database structure (tables, views, indexes, etc). "+
				"DML (INSERT/UPDATE/DELETE/REPLACE) is rejected; use execute_update for data changes."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("A single DDL statement (CREATE TABLE, ALTER TABLE, DROP TABLE, CREATE VIEW, etc.)")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithDestructiveHintAnnotation(true),
		),
		s.handleExecuteDDL,
	)

	// list_views — 列出视图
	s.mcp.AddTool(
		mcp.NewTool("list_views",
			mcp.WithDescription("List all views in a database/schema. "+
				"Returns view names. Use get_table_ddl to get the view definition."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListViews,
	)

	// list_procedures — 列出存储过程
	s.mcp.AddTool(
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
	s.mcp.AddTool(
		mcp.NewTool("get_procedure_body",
			mcp.WithDescription("Get the source code (body) of a stored procedure."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("procedure_name", mcp.Required(), mcp.Description("Procedure name")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetProcedureBody,
	)

	// list_functions — 列出函数
	s.mcp.AddTool(
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
	s.mcp.AddTool(
		mcp.NewTool("get_function_body",
			mcp.WithDescription("Get the source code (body) of a function."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("function_name", mcp.Required(), mcp.Description("Function name")),
			mcp.WithString("database",
				mcp.Description("Database/schema to query (optional, temporary — does NOT modify the saved connection. "+
					"If omitted, uses the connection's default database)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetFunctionBody,
	)

	// list_triggers — 列出触发器
	s.mcp.AddTool(
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
	s.mcp.AddTool(
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
	s.mcp.AddTool(
		mcp.NewTool("get_database_ddl",
			mcp.WithDescription("Get DDL statements for all tables (and optionally views) in a database/schema. "+
				"Returns a concatenated script of CREATE statements. Useful for schema export and documentation."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID, or a unique host/name fragment like '11.114'")),
			mcp.WithString("database", mcp.Required(), mcp.Description("Database/schema name")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetDatabaseDDL,
	)
}
