package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"idblink/backend"
	"idblink/backend/api"
	"idblink/backend/models"
)

// ==================== 辅助函数 ====================

// MCP 返回体的 token 预算约束：超长字符串截断、行数默认上限。
const (
	mcpCellMaxChars   = 300 // 单元格字符串最大字符数，超出截断并标注原始长度
	mcpDefaultMaxRows = 100 // execute_query 默认返回行数
	mcpHardMaxRows    = 1000
)

// truncateCellStrings 就地截断行数据中的超长字符串。
// TEXT/JSON 列动辄数千字符，agent 通常只需开头预览；截断后附加原始长度提示。
func truncateCellStrings(rows [][]interface{}, maxChars int) {
	for _, row := range rows {
		for i, v := range row {
			s, ok := v.(string)
			if !ok {
				continue
			}
			r := []rune(s)
			if len(r) > maxChars {
				row[i] = string(r[:maxChars]) + fmt.Sprintf("…(truncated, %d chars total)", len(r))
			}
		}
	}
}

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

// argBool 提取布尔参数，不存在返回 default 值。
func argBool(args map[string]any, key string, def bool) bool {
	if v, ok := args[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
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

// jsonListResult 构造列表结果：数组包裹为 {"<key>": [...]}。
// MCP 规范要求 structuredContent 必须是 JSON object（record），
// 顶层数组会被严格客户端直接拒绝（"expected record, received array"），导致工具完全不可用。
func jsonListResult(key string, data any, err error, errMsg string) (*mcp.CallToolResult, error) {
	if err != nil {
		return mcp.NewToolResultErrorFromErr(errMsg, err), nil
	}
	return mcp.NewToolResultJSON(map[string]any{key: data})
}

// ==================== 连接管理 handlers ====================

// connectionSummary list_connections 的瘦身投影：agent 只需要定位连接的字段。
// 全量 ConnectionOutput（含 SSH/SSL 路径、颜色等）对调用方是纯 token 开销，
// 曾导致响应被客户端截断；需要完整字段时传 include_details=true。
type connectionSummary struct {
	ConnectionID string  `json:"connection_id"`
	Name         string  `json:"name"`
	DbType       string  `json:"db_type"`
	Host         string  `json:"host"`
	Port         int     `json:"port"`
	Username     string  `json:"username"`
	Database     *string `json:"database,omitempty"`
	Status       string  `json:"status"`
}

func connectionSummaries(conns []backend.ConnectionOutput) []connectionSummary {
	out := make([]connectionSummary, 0, len(conns))
	for _, c := range conns {
		out = append(out, connectionSummary{
			ConnectionID: c.ID,
			Name:         c.Name,
			DbType:       c.DbType,
			Host:         c.Host,
			Port:         c.Port,
			Username:     c.Username,
			Database:     c.Database,
			Status:       c.Status,
		})
	}
	return out
}

func (s *Server) handleListConnections(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	conns, err := s.app.GetConnections()
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to list connections", err), nil
	}

	// 内存过滤：按 name/host/db_type/username/database 模糊匹配
	search := strings.ToLower(strings.TrimSpace(argStr(req.GetArguments(), "search")))
	if search != "" {
		filtered := make([]backend.ConnectionOutput, 0, len(conns))
		for _, c := range conns {
			db := ""
			if c.Database != nil {
				db = *c.Database
			}
			if strings.Contains(strings.ToLower(c.Name), search) ||
				strings.Contains(strings.ToLower(c.Host), search) ||
				strings.Contains(strings.ToLower(c.DbType), search) ||
				strings.Contains(strings.ToLower(c.Username), search) ||
				strings.Contains(strings.ToLower(db), search) {
				filtered = append(filtered, c)
			}
		}
		conns = filtered
	}

	if v, ok := req.GetArguments()["include_details"].(bool); ok && v {
		return mcp.NewToolResultJSON(map[string]any{"connections": conns, "count": len(conns)})
	}
	return mcp.NewToolResultJSON(map[string]any{"connections": connectionSummaries(conns), "count": len(conns)})
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

	// port 未提供（0）时：优先继承同服务器+账号已有连接的端口，其次用库类型默认端口。
	// 避免因省略端口而复用失败、建出连不上的废连接（AI 客户端经常不知道端口）
	if port == 0 && dbType != "sqlite" {
		if hit := findConnectionByServerAccount(existing, dbType, host, username); hit != nil {
			port = hit.Port
		} else {
			port = defaultPortForDBType(dbType)
		}
	}

	if hit := findReusableConnection(existing, dbType, host, port, username, database); hit != nil {
		// 命中：传了新密码则更新（仅改密码，用专用方法避免覆盖现有 SSL/SSH/Name 等字段）
		if password != "" {
			if err := s.app.UpdateConnectionPassword(hit.ID, password); err != nil {
				return mcp.NewToolResultErrorFromErr("failed to update connection password", err), nil
			}
		}
		return s.connectionResult(hit.ID, *hit)
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
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to create connection", err), nil
	}
	return s.connectionResult(conn.ID, conn)
}

// connectionResult 返回连接信息，附带其真实可用状态。
// MCP 调用查询时会自动建连（ensureConnected），所以"未连接"不代表不可用；
// 这里立即建立连接（幂等）让 status 字段反映真实状态，避免 AI 误判连接失败。
// 建连失败不阻塞创建——首次查询时会再次尝试并报出具体的凭证/网络错误。
func (s *Server) connectionResult(connID string, conn backend.ConnectionOutput) (*mcp.CallToolResult, error) {
	if s.app.ConnectDatabase(connID) == nil {
		conn.Status = "connected"
	}
	return mcp.NewToolResultJSON(conn)
}

// findConnectionByServerAccount 按 db_type+host+username 查找已有连接（端口不限）。
// 用于 port 未提供时继承同服务器已有连接的实际端口。
func findConnectionByServerAccount(
	conns []backend.ConnectionOutput,
	dbType, host, username string,
) *backend.ConnectionOutput {
	for i := range conns {
		c := &conns[i]
		if c.DbType == dbType && c.Host == host && c.Username == username {
			return c
		}
	}
	return nil
}

// defaultPortForDBType 各数据库类型的默认端口（port 未提供且无同服务器连接可继承时）
func defaultPortForDBType(dbType string) int {
	switch dbType {
	case "mysql", "mariadb":
		return 3306
	case "postgresql", "highgo", "vastbase":
		return 5432
	case "oracle":
		return 1521
	case "sqlserver":
		return 1433
	case "dameng":
		return 5236
	case "kingbase":
		return 54321
	default:
		return 0
	}
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
			// 全量连接（未指定默认库）不允许收窄为单库连接：全量连接本可访问
			// 任意库（查询时带 database 参数即可），收窄只会降低能力且无法
			// 通过 MCP 恢复（update 无清空 database 的语义）
			if c.Database == nil && input.Database != nil {
				return mcp.NewToolResultError(
					"connection has no default database (full-server connection) and cannot be narrowed to a specific database. " +
						"Reuse it and pass the database parameter in query tools, or create a separate fixed-database connection."), nil
			}
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
	return jsonListResult("databases", dbs, err, "failed to list databases")
}

// tableSummary list_tables 的瘦身投影：agent 关心名称/类型/行数/注释。
// engine/尺寸/时间戳/排序规则对 MCP 调用方是 token 噪音（445 张表时差 3 倍体积），
// 需要完整定义时用 describe_table / get_table_ddl。
type tableSummary struct {
	TableName string  `json:"table_name"`
	TableType string  `json:"table_type"`
	Schema    string  `json:"schema,omitempty"`
	RowCount  *uint64 `json:"row_count,omitempty"`
	Comment   *string `json:"comment,omitempty"`
}

func tableSummaries(tables []models.TableInfo) []tableSummary {
	out := make([]tableSummary, 0, len(tables))
	for _, t := range tables {
		out = append(out, tableSummary{
			TableName: t.TableName,
			TableType: t.TableType,
			Schema:    t.Schema,
			RowCount:  t.RowCount,
			Comment:   t.Comment,
		})
	}
	return out
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
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to list tables", err), nil
	}
	return mcp.NewToolResultJSON(map[string]any{
		"tables": tableSummaries(result.Tables),
		"views":  tableSummaries(result.Views),
	})
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
	return jsonListResult("ddls", ddls, err, "failed to get table DDL")
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
				"For INSERT/UPDATE/DELETE/REPLACE, use execute_update."), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	// 行数上限：默认 100、硬上限 1000。防止 agent 无意中 SELECT 大表
	// 把调用方上下文撑爆；截断时结果带 truncated=true，调用方可用 LIMIT 细化。
	maxRows := argInt(args, "max_rows", mcpDefaultMaxRows)
	if maxRows <= 0 {
		maxRows = mcpDefaultMaxRows
	}
	if maxRows > mcpHardMaxRows {
		maxRows = mcpHardMaxRows
	}

	result, err := s.app.ExecuteQueryLimited(connID, sqlText, database, nil, maxRows)
	if err == nil {
		truncateCellStrings(result.Rows, mcpCellMaxChars)
	}
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
			"execute_update only allows INSERT, UPDATE, DELETE, REPLACE, or MERGE statements. " +
				"DDL (CREATE, DROP, ALTER, TRUNCATE) is not allowed."), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	result, err := s.app.ExecuteQuery(connID, sqlText, database, nil)
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
				"For INSERT/UPDATE/DELETE/REPLACE, use execute_update."), nil
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
	return mcp.NewToolResultJSON(map[string]any{"views": result.Views})
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
	return jsonListResult("procedures", procs, err, "failed to list procedures")
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
	return jsonResult(map[string]any{"body": body}, err, "failed to get procedure body")
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
	return jsonListResult("functions", funcs, err, "failed to list functions")
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
	return jsonResult(map[string]any{"body": body}, err, "failed to get function body")
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
	return jsonListResult("triggers", triggers, err, "failed to list triggers")
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
	return jsonListResult("sequences", seqs, err, "failed to list sequences")
}

func (s *Server) handleGetDatabaseDDL(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	dbName := argStr(args, "database")
	if connID == "" || dbName == "" {
		return mcp.NewToolResultError("connection_id and database are required"), nil
	}

	ddl, err := s.app.GetDatabaseDDL(connID, dbName)
	return jsonResult(map[string]any{"ddl": ddl}, err, "failed to get database DDL")
}

// ==================== 进程管理 handlers ====================
//
// kill 是不可逆的高危操作，门禁分两层：
//  1. 默认走 MCP elicitation（协议级人工确认）：server 反向请求 MCP 客户端
//     弹原生确认框，人在框上点确认/拒绝——模型无法代替应答（请求/响应通道
//     与工具调用隔离），没有人点确认 kill 就不会执行。
//  2. force=true 跳过弹窗直接执行：留给不支持 elicitation 的客户端或用户
//     已在对话中明确同意的场景。注意 force 是模型可自行传递的参数，
//     它是"对话级"门禁而非"协议级"人工确认。

// handleListProcesses 列出数据库服务器的活动进程/会话（只读，无门禁）。
func (s *Server) handleListProcesses(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}
	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	processes, err := s.app.GetProcessList(connID, database)
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to list processes", err), nil
	}
	if processes == nil {
		processes = []api.ProcessInfo{}
	}
	return mcp.NewToolResultJSON(map[string]any{"processes": processes})
}

// handleKillProcess 终止数据库进程/会话（高危，默认 elicitation 人工确认）。
func (s *Server) handleKillProcess(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	processID := argStr(args, "process_id")
	serial := argStr(args, "serial")
	force := argBool(args, "force", false)
	if connID == "" || processID == "" {
		return mcp.NewToolResultError("connection_id and process_id are required"), nil
	}
	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	// 与 GUI 同规则：ID/serial 必须为数字（防注入）
	if _, err := strconv.Atoi(processID); err != nil {
		return mcp.NewToolResultError("invalid process_id: must be numeric"), nil
	}
	if serial != "" {
		if _, err := strconv.Atoi(serial); err != nil {
			return mcp.NewToolResultError("invalid serial: must be numeric"), nil
		}
	}

	// 先查目标进程：给人看清楚要杀什么，也顺带确认进程仍存在
	processes, err := s.app.GetProcessList(connID, database)
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to fetch process list before kill", err), nil
	}
	var target *api.ProcessInfo
	for i := range processes {
		if processes[i].ID == processID {
			target = &processes[i]
			break
		}
	}
	if target == nil {
		return mcp.NewToolResultError(
			fmt.Sprintf("process %s not found (it may have already ended). Use list_processes to re-check.", processID)), nil
	}

	// 自杀保护：不允许 kill 掉本 sidecar 用来执行操作的连接本身
	if own := s.ownConnectionID(connID, database); own != "" && own == processID {
		return mcp.NewToolResultError(
			"refusing to kill process " + processID + ": it is the connection this tool is using"), nil
	}

	killSummary := fmt.Sprintf("id=%s user=%s host=%s db=%s command=%s state=%s time=%ss",
		target.ID, target.User, strOr(target.Host, "-"), strOr(target.Database, "-"),
		strOr(target.Command, "-"), strOr(target.State, "-"), strOr(target.Time, "?"))
	if target.Info != nil && *target.Info != "" {
		info := *target.Info
		if r := []rune(info); len(r) > 200 {
			info = string(r[:200]) + "…"
		}
		killSummary += "\nSQL: " + info
	}

	// 门禁：非 force 走 elicitation 协议级人工确认
	if !force {
		result, err := s.mcp.RequestElicitation(ctx, mcp.ElicitationRequest{
			Request: mcp.Request{Method: string(mcp.MethodElicitationCreate)},
			Params: mcp.ElicitationParams{
				Message: "Confirm killing this database process?\n" + killSummary,
				RequestedSchema: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"confirm": map[string]any{
							"type":        "boolean",
							"description": "true = terminate this process immediately",
						},
					},
					"required": []string{"confirm"},
				},
			},
		})
		if err != nil {
			if errors.Is(err, server.ErrElicitationNotSupported) || errors.Is(err, server.ErrNoActiveSession) {
				return mcp.NewToolResultError(
					"this MCP client does not support elicitation (human confirmation). "+
						"Ask the user to kill it via the iDBLink GUI process list, or get the user's explicit "+
						"approval in the conversation first and retry with force=true."), nil
			}
			return mcp.NewToolResultErrorFromErr("human confirmation failed", err), nil
		}
		switch result.Action {
		case mcp.ElicitationResponseActionDecline, mcp.ElicitationResponseActionCancel:
			return mcp.NewToolResultJSON(map[string]any{"killed": false, "reason": "declined by user"})
		}
		// fail-safe：只有显式 confirm==true 才放行。accept 但 content 缺失/
		// 类型异常一律视为未确认（宁可漏杀不可误杀）
		confirmed := false
		if content, ok := result.Content.(map[string]any); ok {
			confirmed, _ = content["confirm"].(bool)
		}
		if !confirmed {
			return mcp.NewToolResultJSON(map[string]any{"killed": false, "reason": "not confirmed by user"})
		}
	}

	if _, err := s.app.KillProcess(connID, strOr(database, ""), processID, serial); err != nil {
		return mcp.NewToolResultErrorFromErr("failed to kill process "+processID, err), nil
	}
	return mcp.NewToolResultJSON(map[string]any{"killed": true, "process_id": processID, "detail": killSummary})
}

// ownConnectionID 返回本 sidecar 当前连接自身的进程/会话 ID（用于自杀保护）。
// 查询失败或方言不支持时返回空串（跳过保护，保持可用性优先）。
func (s *Server) ownConnectionID(connID string, database *string) string {
	dbType := s.dbTypeOf(connID)
	var q string
	switch dbType {
	case "mysql", "mariadb":
		q = "SELECT CONNECTION_ID()"
	case "postgresql", "kingbase", "highgo", "vastbase":
		q = "SELECT pg_backend_pid()"
	case "sqlserver":
		q = "SELECT @@SPID"
	default:
		// Oracle/DM 需查 v$session（权限复杂）、SQLite 无进程概念：跳过
		return ""
	}
	res, err := s.app.ExecuteQueryLimited(connID, q, database, nil, 1)
	if err != nil || res.Error != "" || len(res.Rows) == 0 || len(res.Rows[0]) == 0 {
		return ""
	}
	switch v := res.Rows[0][0].(type) {
	case string:
		return v
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return strconv.FormatInt(int64(v), 10)
	default:
		return fmt.Sprintf("%v", v)
	}
}

// dbTypeOf 查连接的数据库类型（自杀保护选查询用）。
func (s *Server) dbTypeOf(connID string) string {
	conns, err := s.app.GetConnections()
	if err != nil {
		return ""
	}
	for _, c := range conns {
		if c.ID == connID {
			return c.DbType
		}
	}
	return ""
}

// strOr 字符串指针解引用，nil 返回默认值。
func strOr(p *string, def string) string {
	if p == nil {
		return def
	}
	return *p
}
