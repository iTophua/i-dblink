package mcpserver

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"

	"idblink/backend"
	"idblink/backend/models"
)

// mcpTxSession MCP 的固定事务会话名：MCP 端事务与桌面端各查询 Tab 隔离，
// 各自独立 commit/rollback，互不捕获语句。
const mcpTxSession = "mcp"

// connectionByID 按精确 ID 返回连接（MCP 中间件已把引用解析为真实 ID）。
func (s *Server) connectionByID(id string) (*backend.ConnectionOutput, error) {
	conns, err := s.app.GetConnections()
	if err != nil {
		return nil, err
	}
	for i := range conns {
		if conns[i].ID == id {
			return &conns[i], nil
		}
	}
	return nil, fmt.Errorf("connection %s not found", id)
}

// ==================== Schema / 列搜索 ====================

func (s *Server) handleListSchemas(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}
	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}
	schemas, err := s.app.GetSchemas(connID, database)
	return jsonListResult("schemas", schemas, err, "failed to list schemas")
}

// columnHit search_columns 的返回行。
type columnHit struct {
	Schema     string `json:"schema,omitempty"`
	Table      string `json:"table"`
	ColumnName string `json:"column_name"`
	DataType   string `json:"data_type"`
	IsNullable string `json:"is_nullable"`
	ColumnKey  string `json:"column_key,omitempty"`
}

func (s *Server) handleSearchColumns(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}
	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	all, err := s.app.GetAllColumns(connID, database)
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to load columns", err), nil
	}

	// 表 → schema 映射（GetAllColumns 的 key 在多数驱动里只有表名，不含 schema）
	schemaByTable := map[string]string{}
	if tables, terr := s.app.GetTablesCategorized(connID, database, nil); terr == nil {
		for _, t := range tables.Tables {
			if t.Schema != "" {
				schemaByTable[t.TableName] = t.Schema
			}
		}
		for _, v := range tables.Views {
			if v.Schema != "" {
				schemaByTable[v.TableName] = v.Schema
			}
		}
	}

	search := strings.ToLower(argStr(args, "search"))
	tableFilter := strings.ToLower(argStr(args, "table"))
	schemaFilter := argStr(args, "schema")
	maxResults := argInt(args, "max_results", 200)
	if maxResults <= 0 {
		maxResults = 200
	}
	if maxResults > 500 {
		maxResults = 500
	}

	splitKey := func(key string) (string, string) {
		if sc, ok := schemaByTable[key]; ok {
			return sc, key
		}
		if i := strings.IndexByte(key, '.'); i >= 0 {
			return key[:i], key[i+1:]
		}
		return "", key
	}

	rows := make([]columnHit, 0)
	for key, cols := range all.Tables {
		schema, table := splitKey(key)
		if schemaFilter != "" && !strings.EqualFold(schema, schemaFilter) {
			continue
		}
		if tableFilter != "" && !strings.Contains(strings.ToLower(table), tableFilter) {
			continue
		}
		for _, c := range cols {
			if search != "" && !strings.Contains(strings.ToLower(c.ColumnName), search) {
				continue
			}
			rows = append(rows, columnHit{
				Schema:     schema,
				Table:      table,
				ColumnName: c.ColumnName,
				DataType:   c.DataType,
				IsNullable: c.IsNullable,
				ColumnKey:  strValOrEmpty(c.ColumnKey),
			})
		}
	}

	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Schema != rows[j].Schema {
			return rows[i].Schema < rows[j].Schema
		}
		if rows[i].Table != rows[j].Table {
			return rows[i].Table < rows[j].Table
		}
		return rows[i].ColumnName < rows[j].ColumnName
	})

	truncated := len(rows) > maxResults
	if truncated {
		rows = rows[:maxResults]
	}
	return mcp.NewToolResultJSON(map[string]any{
		"columns":   rows,
		"count":     len(rows),
		"truncated": truncated,
	})
}

func strValOrEmpty(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// ==================== 表信息 ====================

func (s *Server) handleGetTableInfo(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
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
	schemaFilter := argStr(args, "schema")

	result, err := s.app.GetTablesCategorized(connID, database, &table)
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to load table info", err), nil
	}

	find := func(candidates []models.TableInfo) *models.TableInfo {
		for i := range candidates {
			c := &candidates[i]
			if c.TableName == table {
				return c
			}
		}
		for i := range candidates {
			if strings.EqualFold(candidates[i].TableName, table) {
				return &candidates[i]
			}
		}
		return nil
	}

	var hit *models.TableInfo
	if schemaFilter == "" {
		if hit = find(result.Tables); hit == nil {
			hit = find(result.Views)
		}
	} else {
		for i := range result.Tables {
			if strings.EqualFold(result.Tables[i].TableName, table) && strings.EqualFold(result.Tables[i].Schema, schemaFilter) {
				hit = &result.Tables[i]
				break
			}
		}
		if hit == nil {
			for i := range result.Views {
				if strings.EqualFold(result.Views[i].TableName, table) && strings.EqualFold(result.Views[i].Schema, schemaFilter) {
					hit = &result.Views[i]
					break
				}
			}
		}
	}
	if hit == nil {
		return mcp.NewToolResultError(fmt.Sprintf(
			"table %q not found%s. Use list_tables to see available tables.", table,
			map[bool]string{true: fmt.Sprintf(" in schema %q", schemaFilter), false: ""}[schemaFilter != ""])), nil
	}
	return mcp.NewToolResultJSON(hit)
}

// ==================== EXPLAIN ====================

// buildExplainSQL 生成方言对应的执行计划 SQL。
func buildExplainSQL(dbType, sql string) (string, error) {
	switch dbType {
	case "mysql", "mariadb":
		return "EXPLAIN " + sql, nil
	case "postgresql", "kingbase", "highgo", "vastbase":
		return "EXPLAIN " + sql, nil
	case "sqlite":
		return "EXPLAIN QUERY PLAN " + sql, nil
	case "oracle", "dameng":
		return "EXPLAIN PLAN FOR " + sql, nil
	case "sqlserver":
		return "SET SHOWPLAN_XML ON;\n" + sql + ";\nSET SHOWPLAN_XML OFF;", nil
	default:
		return "", fmt.Errorf("explain is not supported for db_type %q", dbType)
	}
}

func (s *Server) handleExplainQuery(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	sqlText := argStr(args, "sql")
	if connID == "" || sqlText == "" {
		return mcp.NewToolResultError("connection_id and sql are required"), nil
	}

	conn, err := s.connectionByID(connID)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	trimmed := strings.TrimSpace(sqlText)
	trimmed = strings.TrimSuffix(trimmed, ";")
	trimmed = strings.TrimSpace(trimmed)
	if countUnquotedSemicolons(trimmed) > 0 {
		return mcp.NewToolResultError("explain_query accepts a single SQL statement"), nil
	}

	explainSQL, err := buildExplainSQL(conn.DbType, trimmed)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}

	result, qerr := s.app.ExecuteQuery(connID, explainSQL, database, nil, "")
	if qerr == nil {
		truncateCellStrings(result.Rows, mcpCellMaxChars)
	}
	errMsg := result.Error
	if qerr != nil {
		errMsg = qerr.Error()
	}
	return mcp.NewToolResultJSON(map[string]any{
		"db_type":     conn.DbType,
		"explain_sql": explainSQL,
		"columns":     result.Columns,
		"rows":        result.Rows,
		"truncated":   result.Truncated,
		"error":       errMsg,
	})
}

// ==================== 用户 / 服务器信息 ====================

func (s *Server) handleListUsers(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}
	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}
	data, err := s.app.GetUsers(connID, database)
	return jsonResult(data, err, "failed to list users")
}

func (s *Server) handleListPrivileges(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	username := argStr(args, "username")
	if connID == "" || username == "" {
		return mcp.NewToolResultError("connection_id and username are required"), nil
	}
	host := argStr(args, "host")
	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}
	data, err := s.app.GetUserPrivileges(connID, username, host, database)
	return jsonResult(data, err, "failed to list privileges")
}

func (s *Server) handleGetServerInfo(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}
	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}
	info, err := s.app.GetServerInfo(connID, database)
	return jsonResult(info, err, "failed to get server info")
}

// ==================== 事务 ====================

func (s *Server) handleBeginTransaction(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	connID := argStr(req.GetArguments(), "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}
	if err := s.app.BeginTransaction(connID, mcpTxSession); err != nil {
		return mcp.NewToolResultErrorFromErr("begin transaction failed", err), nil
	}
	return mcp.NewToolResultText("Transaction started"), nil
}

func (s *Server) handleCommitTransaction(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	connID := argStr(req.GetArguments(), "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}
	active, err := s.app.CommitTransaction(connID, mcpTxSession)
	if err != nil {
		return mcp.NewToolResultErrorFromErr("commit failed", err), nil
	}
	if !active {
		return mcp.NewToolResultText("No active transaction to commit (it may have been rolled back by the watchdog timeout)."), nil
	}
	return mcp.NewToolResultText("Transaction committed"), nil
}

func (s *Server) handleRollbackTransaction(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	connID := argStr(req.GetArguments(), "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}
	active, err := s.app.RollbackTransaction(connID, mcpTxSession)
	if err != nil {
		return mcp.NewToolResultErrorFromErr("rollback failed", err), nil
	}
	if !active {
		return mcp.NewToolResultText("No active transaction to roll back."), nil
	}
	return mcp.NewToolResultText("Transaction rolled back"), nil
}

func (s *Server) handleGetTransactionStatus(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	connID := argStr(req.GetArguments(), "connection_id")
	if connID == "" {
		return mcp.NewToolResultError("connection_id is required"), nil
	}
	active, err := s.app.GetTransactionStatus(connID, mcpTxSession)
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to get transaction status", err), nil
	}
	return mcp.NewToolResultJSON(map[string]any{"active": active})
}

// resolveScope 解析 database/schema 参数。
// MySQL/MariaDB/Dameng 的 schema 语义等同 database：schema 有值且 database 为空时，
// 把 schema 并入 database（此时返回 schema=nil），让下游按 database 处理。
func (s *Server) resolveScope(args map[string]any) (database, schema *string, err error) {
	database = argStrPtr(args, "database")
	schema = argStrPtr(args, "schema")
	if schema == nil || *schema == "" {
		return database, nil, nil
	}
	conn, err := s.connectionByID(argStr(args, "connection_id"))
	if err != nil {
		return nil, nil, err
	}
	switch conn.DbType {
	case "mysql", "mariadb", "dameng":
		if database == nil || *database == "" {
			database = schema
			schema = nil
		}
	}
	return database, schema, nil
}

// filterTablesBySchema 按 schema 过滤表/视图（TableInfo.Schema 已带 schema）。
func filterTablesBySchema(items []models.TableInfo, schema string) []models.TableInfo {
	if schema == "" {
		return items
	}
	out := make([]models.TableInfo, 0, len(items))
	for _, t := range items {
		if strings.EqualFold(t.Schema, schema) {
			out = append(out, t)
		}
	}
	return out
}
