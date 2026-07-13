// Package mcpserver 实现 iDBLink 的 MCP（Model Context Protocol）Server，
// 将数据库操作能力暴露给外部 AI 客户端（Claude Desktop、Cursor 等）。
//
// 传输方式：stdio sidecar——通过 CLI 子命令 `iDBLink --mcp --stdio` 启动，
// 不启动 GUI，外部 AI 客户端以子进程方式拉起。
//
// 所有 tool 复用 backend.App 的现有方法，核心业务逻辑零重写。
package mcpserver

import (
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"idblink/backend"
)

// Server 封装 MCP server，复用 iDBLink 现有 App 逻辑。
type Server struct {
	mcp *server.MCPServer
	app *backend.App
}

// New 创建 MCP Server，注册所有 tool。
func New(app *backend.App) *Server {
	s := server.NewMCPServer(
		"iDBLink",
		"0.1.0",
		server.WithToolCapabilities(true),
	)
	srv := &Server{mcp: s, app: app}
	srv.registerTools()
	return srv
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
}

// ==================== 连接管理 tools ====================

func (s *Server) registerConnectionTools() {
	// list_connections — 列出所有已保存的连接
	s.mcp.AddTool(
		mcp.NewTool("list_connections",
			mcp.WithDescription("List all saved database connections in iDBLink. "+
				"Returns connection_id, name, db_type, host, port, and connection status. "+
				"Use the connection_id from the result to call other tools."),
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
			mcp.WithNumber("port", mcp.Required(),
				mcp.Description("Database port number")),
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
				"Pass password only when you want to change it; omit to keep the existing password."),
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
				mcp.Description("Connection ID (from list_connections)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleListDatabases,
	)

	// list_tables
	s.mcp.AddTool(
		mcp.NewTool("list_tables",
			mcp.WithDescription("List tables and views in a database. "+
				"Returns table names, types (table/view), and row counts where available. "+
				"Optionally filter by a search keyword."),
			mcp.WithString("connection_id", mcp.Required(),
				mcp.Description("Connection ID")),
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
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID")),
			mcp.WithString("table_name", mcp.Required(), mcp.Description("Table name")),
			mcp.WithString("database", mcp.Description("Database/schema (optional)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleDescribeTable,
	)

	// get_table_ddl
	s.mcp.AddTool(
		mcp.NewTool("get_table_ddl",
			mcp.WithDescription("Get the CREATE TABLE DDL statement for a table. "+
				"Useful to understand exact column definitions, constraints, and indexes."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID")),
			mcp.WithString("table_name", mcp.Required(), mcp.Description("Table name")),
			mcp.WithString("database", mcp.Description("Database/schema (optional)")),
			mcp.WithReadOnlyHintAnnotation(true),
		),
		s.handleGetTableDDL,
	)

	// execute_query — 只读查询，强制白名单
	s.mcp.AddTool(
		mcp.NewTool("execute_query",
			mcp.WithDescription("Execute a read-only SQL query (SELECT, WITH, EXPLAIN, SHOW, DESCRIBE). "+
				"Returns column names and rows as JSON. Only read-only statements are allowed; "+
				"use execute_update for INSERT/UPDATE/DELETE."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("A single read-only SQL statement (SELECT, WITH, SHOW, EXPLAIN, DESCRIBE)")),
			mcp.WithString("database", mcp.Description("Database/schema (optional)")),
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
			mcp.WithDescription("Execute a data modification statement (INSERT, UPDATE, DELETE). "+
				"Returns the number of rows affected. "+
				"DDL statements (CREATE, DROP, ALTER, TRUNCATE) are rejected."),
			mcp.WithString("connection_id", mcp.Required(), mcp.Description("Connection ID")),
			mcp.WithString("sql", mcp.Required(),
				mcp.Description("A single INSERT, UPDATE, or DELETE statement")),
			mcp.WithString("database", mcp.Description("Database/schema (optional)")),
			mcp.WithDestructiveHintAnnotation(true),
		),
		s.handleExecuteUpdate,
	)
}
