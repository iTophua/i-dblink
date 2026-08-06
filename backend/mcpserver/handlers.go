package mcpserver

import (
	"context"
	"fmt"
	"strconv"

	"github.com/mark3labs/mcp-go/mcp"

	"idblink/backend"
)

// ==================== 辅助函数 ====================

// argStr 从参数 map 中提取字符串，不存在返回空字符串。
func argStr(args map[string]any, key string) string {
	if v, ok := args[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// argStrPtr 提取字符串指针，空值返回 nil。
func argStrPtr(args map[string]any, key string) *string {
	s := argStr(args, key)
	if s == "" {
		return nil
	}
	return &s
}

// argIntPtr 提取 *int（MCP 传来的 number 是 float64）。
func argIntPtr(args map[string]any, key string) *int {
	if v, ok := args[key]; ok {
		switch n := v.(type) {
		case float64:
			i := int(n)
			return &i
		case int:
			return &n
		case string:
			if parsed, err := strconv.Atoi(n); err == nil {
				return &parsed
			}
		}
	}
	return nil
}

// argInt 提取 int，不存在返回 default 值。
func argInt(args map[string]any, key string, def int) int {
	if p := argIntPtr(args, key); p != nil {
		return *p
	}
	return def
}

// jsonResult 构造 JSON 结果（处理 error）。
func jsonResult(data any, err error, errMsg string) (*mcp.CallToolResult, error) {
	if err != nil {
		return mcp.NewToolResultErrorFromErr(errMsg, err), nil
	}
	return mcp.NewToolResultJSON(data)
}

// ==================== 连接管理 handlers ====================

func (s *Server) handleListConnections(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	conns, err := s.app.GetConnections()
	return jsonResult(conns, err, "failed to list connections")
}

func (s *Server) handleCreateConnection(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()

	name := argStr(args, "name")
	dbType := argStr(args, "db_type")
	host := argStr(args, "host")
	if name == "" || dbType == "" || host == "" {
		return mcp.NewToolResultError("name, db_type, and host are required"), nil
	}
	port := argInt(args, "port", 0)
	username := argStr(args, "username")
	database := argStrPtr(args, "database")
	password := argStr(args, "password")

	// 优先复用：同一服务器+账号（db_type+host+port+username）的连接已存在则复用，
	// database 仅作优先级参考，不参与身份判定（execute_query 可指定任意库）。
	existing, err := s.app.GetConnections()
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to check existing connections", err), nil
	}
	if hit := findReusableConnection(existing, dbType, host, port, username, database); hit != nil {
		// 命中：传了新密码则更新（仅改密码，用专用方法避免覆盖现有 SSL/SSH/Name 等字段）
		if password != "" {
			if err := s.app.UpdateConnectionPassword(hit.ID, password); err != nil {
				return mcp.NewToolResultErrorFromErr("failed to update connection password", err), nil
			}
		}
		return mcp.NewToolResultJSON(hit)
	}

	// 无匹配：正常新建
	input := backend.ConnectionInput{
		Name:     name,
		DbType:   dbType,
		Host:     host,
		Port:     port,
		Username: username,
		Database: database,
	}
	if password != "" {
		input.Password = &password
	}

	conn, err := s.app.SaveConnection(input)
	return jsonResult(conn, err, "failed to create connection")
}

// findReusableConnection 查找可复用的已存在连接（同一服务器+账号）。
// 身份匹配 = db_type + host + port + username（database 不参与身份判定，仅作优先级参考）。
// 多个匹配时按优先级挑一个：精确库（请求 X 且现有 X）> 通用连接（database=nil）> 其他指定库（兜底）。
// 返回 nil 表示无任何匹配，调用方应新建。
func findReusableConnection(
	conns []backend.ConnectionOutput,
	dbType, host string,
	port int,
	username string,
	database *string,
) *backend.ConnectionOutput {
	var general, anyMatch *backend.ConnectionOutput
	for i := range conns {
		c := &conns[i]
		if c.DbType != dbType || c.Host != host || c.Port != port || c.Username != username {
			continue
		}
		// 精确库命中：立即返回（最高优先级）
		if database != nil && c.Database != nil && *c.Database == *database {
			return c
		}
		// 通用连接（database=nil）：记为次优
		if c.Database == nil && general == nil {
			general = c
		}
		// 兜底：任意同服务器+账号匹配即可访问请求的库
		if anyMatch == nil {
			anyMatch = c
		}
	}
	// 优先通用连接（最灵活），其次任意兜底
	if general != nil {
		return general
	}
	return anyMatch
}

func (s *Server) handleUpdateConnection(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}

	input := backend.ConnectionInput{
		ID: connID,
	}
	// 只填入用户提供的字段（空值保持原样需要特殊处理——这里简化为：传了的就更新）
	if v := argStr(args, "name"); v != "" {
		input.Name = v
	}
	if v := argStr(args, "db_type"); v != "" {
		input.DbType = v
	}
	if v := argStr(args, "host"); v != "" {
		input.Host = v
	}
	if p := argIntPtr(args, "port"); p != nil {
		input.Port = *p
	}
	if v := argStr(args, "username"); v != "" {
		input.Username = v
	}
	if v := argStr(args, "password"); v != "" {
		input.Password = &v
	}
	if v := argStr(args, "database"); v != "" {
		input.Database = &v
	}

	// 先从存储取现有连接，合并更新
	existing, err := s.app.GetConnections()
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to get existing connections", err), nil
	}
	var found bool
	for _, c := range existing {
		if c.ID == connID {
			found = true
			// 用现有值补齐用户未传的字段（空值 = 不修改，回退到原值）
			if input.Name == "" {
				input.Name = c.Name
			}
			if input.DbType == "" {
				input.DbType = c.DbType
			}
			if input.Host == "" {
				input.Host = c.Host
			}
			if input.Port == 0 {
				input.Port = c.Port
			}
			if input.Username == "" {
				input.Username = c.Username
			}
			// database：用户未传则回退到原值
			if input.Database == nil {
				input.Database = c.Database
			}
			break
		}
	}
	if !found {
		return mcp.NewToolResultError(fmt.Sprintf("connection %s not found", connID)), nil
	}

	conn, err := s.app.SaveConnection(input)
	return jsonResult(conn, err, "failed to update connection")
}

func (s *Server) handleDeleteConnection(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}

	if err := s.app.DeleteConnection(connID); err != nil {
		return mcp.NewToolResultErrorFromErr("failed to delete connection", err), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("Connection %s deleted successfully", connID)), nil
}

func (s *Server) handleTestConnection(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()

	input := backend.ConnectionInput{
		DbType:   argStr(args, "db_type"),
		Host:     argStr(args, "host"),
		Port:     argInt(args, "port", 0),
		Username: argStr(args, "username"),
		Database: argStrPtr(args, "database"),
	}
	if pwd := argStr(args, "password"); pwd != "" {
		input.Password = &pwd
	}

	if input.DbType == "" || input.Host == "" {
		return mcp.NewToolResultError("db_type and host are required"), nil
	}

	if err := s.app.TestConnection(input); err != nil {
		return mcp.NewToolResultErrorFromErr("connection test failed", err), nil
	}
	return mcp.NewToolResultText("Connection test successful"), nil
}

// ==================== 查询 handlers ====================

func (s *Server) handleListDatabases(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}

	dbs, err := s.app.GetDatabases(connID)
	return jsonResult(dbs, err, "failed to list databases")
}

func (s *Server) handleListTables(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	result, err := s.app.GetTablesCategorized(connID, database, argStrPtr(args, "search"))
	return jsonResult(result, err, "failed to list tables")
}

func (s *Server) handleDescribeTable(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	table := argStr(args, "table_name")
	if connID == "" || table == "" {
		return mcp.NewToolResultError("connection_id and table_name are required"), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	structure, err := s.app.GetTableStructure(connID, table, database)
	return jsonResult(structure, err, "failed to describe table")
}

func (s *Server) handleGetTableDDL(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	table := argStr(args, "table_name")
	if connID == "" || table == "" {
		return mcp.NewToolResultError("connection_id and table_name are required"), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	ddls, err := s.app.GetTableDDL(connID, table, database)
	return jsonResult(ddls, err, "failed to get table DDL")
}

func (s *Server) handleExecuteQuery(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	sqlText := argStr(args, "sql")
	if connID == "" || sqlText == "" {
		return mcp.NewToolResultError("connection_id and sql are required"), nil
	}

	// 安全检查：强制只读
	if !IsReadOnlyQuery(sqlText) {
		return mcp.NewToolResultError(
			"execute_query only allows read-only statements (SELECT, WITH, EXPLAIN, SHOW, DESCRIBE). " +
				"For INSERT/UPDATE/DELETE, use execute_update."), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	result, err := s.app.ExecuteQuery(connID, sqlText, database)
	return jsonResult(result, err, "query failed")
}

// ==================== 写操作 handlers ====================

func (s *Server) handleExecuteUpdate(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	sqlText := argStr(args, "sql")
	if connID == "" || sqlText == "" {
		return mcp.NewToolResultError("connection_id and sql are required"), nil
	}

	// 安全检查：仅允许 DML
	if !IsDMLStatement(sqlText) {
		return mcp.NewToolResultError(
			"execute_update only allows INSERT, UPDATE, or DELETE statements. " +
				"DDL (CREATE, DROP, ALTER, TRUNCATE) is not allowed."), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	result, err := s.app.ExecuteQuery(connID, sqlText, database)
	return jsonResult(result, err, "update failed")
}

// ==================== 元数据/DDL handlers ====================

func (s *Server) handleExecuteDDL(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	sqlText := argStr(args, "sql")
	if connID == "" || sqlText == "" {
		return mcp.NewToolResultError("connection_id and sql are required"), nil
	}

	// 安全检查：仅允许 DDL
	if !IsDDLStatement(sqlText) {
		return mcp.NewToolResultError(
			"execute_ddl only allows DDL statements (CREATE, DROP, ALTER, TRUNCATE, RENAME). " +
				"For INSERT/UPDATE/DELETE, use execute_update."), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	if err := s.app.ExecuteDDL(connID, sqlText, database); err != nil {
		return mcp.NewToolResultErrorFromErr("DDL execution failed", err), nil
	}
	return mcp.NewToolResultJSON(map[string]any{"success": true, "message": "DDL executed successfully"})
}

func (s *Server) handleListViews(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	// 复用 GetTablesCategorized，只返回 views 部分
	result, err := s.app.GetTablesCategorized(connID, database, nil)
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to list views", err), nil
	}
	return mcp.NewToolResultJSON(result.Views)
}

func (s *Server) handleListProcedures(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	procs, err := s.app.GetProcedures(connID, database)
	return jsonResult(procs, err, "failed to list procedures")
}

func (s *Server) handleGetProcedureBody(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	procName := argStr(args, "procedure_name")
	if connID == "" || procName == "" {
		return mcp.NewToolResultError("connection_id and procedure_name are required"), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	body, err := s.app.GetProcedureBody(connID, procName, database)
	return jsonResult(body, err, "failed to get procedure body")
}

func (s *Server) handleListFunctions(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	funcs, err := s.app.GetFunctions(connID, database)
	return jsonResult(funcs, err, "failed to list functions")
}

func (s *Server) handleGetFunctionBody(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	funcName := argStr(args, "function_name")
	if connID == "" || funcName == "" {
		return mcp.NewToolResultError("connection_id and function_name are required"), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	body, err := s.app.GetFunctionBody(connID, funcName, database)
	return jsonResult(body, err, "failed to get function body")
}

func (s *Server) handleListTriggers(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	triggers, err := s.app.GetTriggers(connID, database)
	return jsonResult(triggers, err, "failed to list triggers")
}

func (s *Server) handleListSequences(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	seqs, err := s.app.GetSequences(connID, database)
	return jsonResult(seqs, err, "failed to list sequences")
}

func (s *Server) handleGetDatabaseDDL(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	dbName := argStr(args, "database")
	if connID == "" || dbName == "" {
		return mcp.NewToolResultError("connection_id and database are required"), nil
	}

	ddl, err := s.app.GetDatabaseDDL(connID, dbName)
	return jsonResult(ddl, err, "failed to get database DDL")
}
