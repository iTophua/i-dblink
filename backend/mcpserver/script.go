package mcpserver

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"

	"idblink/backend/models"
)

// ==================== 批量执行（execute_script） ====================

// 脚本语句数量上限：防止 AI 一次塞入超大脚本拖垮连接/上下文
const maxScriptStatements = 100

// 只读脚本每条语句返回的行数上限：批量场景是跑脚本不是拉数据，
// 大结果集请用 execute_query
const scriptMaxRows = 50

// scriptCategory 脚本类别：所有语句必须属于同一类
type scriptCategory int

const (
	scriptRejected scriptCategory = iota // 含不属于三类的语句，或类别混合
	scriptReadOnly
	scriptDML
	scriptDDL
)

func (c scriptCategory) String() string {
	switch c {
	case scriptReadOnly:
		return "read-only"
	case scriptDML:
		return "dml"
	case scriptDDL:
		return "ddl"
	default:
		return "rejected"
	}
}

// splitSQLStatements 把多语句脚本拆分为单语句列表。
// 先剥离注释（stripSQLComments，引号内的注释符原样保留），
// 再在引号外按分号切分——字符串字面量中的分号不会切断语句。
func splitSQLStatements(sql string) []string {
	s := stripSQLComments(sql)
	var stmts []string
	var b strings.Builder
	r := []rune(s)
	n := len(r)
	flush := func() {
		if stmt := strings.TrimSpace(b.String()); stmt != "" {
			stmts = append(stmts, stmt)
		}
		b.Reset()
	}
	for i := 0; i < n; {
		c := r[i]
		if c == '\'' || c == '"' || c == '`' {
			// 字符串/标识符字面量：整段复制到闭合引号（处理 '' 转义与 \ 转义）
			quote := c
			b.WriteRune(c)
			i++
			for i < n {
				if r[i] == quote {
					b.WriteRune(quote)
					i++
					if i < n && r[i] == quote {
						b.WriteRune(quote)
						i++
						continue
					}
					break
				}
				if quote != '`' && r[i] == '\\' && i+1 < n {
					b.WriteRune(r[i])
					b.WriteRune(r[i+1])
					i += 2
					continue
				}
				b.WriteRune(r[i])
				i++
			}
			continue
		}
		if c == ';' {
			flush()
			i++
			continue
		}
		b.WriteRune(c)
		i++
	}
	flush()
	return stmts
}

// classifyScript 判定脚本类别：每条语句都必须通过三类白名单之一，
// 且全部语句属于同一类。任一语句不在白名单内、或类别混合，均拒绝。
// 这是批量执行的权限边界：与单语句工具共用同一套校验，不放开任何权限。
func classifyScript(stmts []string) scriptCategory {
	if len(stmts) == 0 {
		return scriptRejected
	}
	cat := scriptRejected
	for _, s := range stmts {
		var c scriptCategory
		switch {
		case IsReadOnlyQuery(s):
			c = scriptReadOnly
		case IsDMLStatement(s):
			c = scriptDML
		case IsDDLStatement(s):
			c = scriptDDL
		default:
			return scriptRejected
		}
		if cat == scriptRejected {
			cat = c
		} else if cat != c {
			return scriptRejected
		}
	}
	return cat
}

// scriptStmtResult 单条语句的执行结果
type scriptStmtResult struct {
	Index        int             `json:"index"`
	SQL          string          `json:"sql"`
	RowsAffected uint64          `json:"rows_affected,omitempty"`
	Columns      []string        `json:"columns,omitempty"`
	Rows         [][]interface{} `json:"rows,omitempty"`
	RowCount     int             `json:"row_count"`
	Truncated    bool            `json:"truncated,omitempty"`
	Error        string          `json:"error,omitempty"`
}

type scriptResult struct {
	Category        string             `json:"category"`
	StatementCount  int                `json:"statement_count"`
	Executed        int                `json:"executed"`
	TransactionUsed bool               `json:"transaction_used"`
	Transaction     string             `json:"transaction,omitempty"` // committed / rolled_back
	Results         []scriptStmtResult `json:"results"`
}

// handleExecuteScript 批量执行多语句脚本。
// 权限模型与单语句工具完全一致：每条语句独立过白名单，且要求整脚本同类。
// DML 脚本默认单事务执行（任一失败整体回滚）；DDL 顺序执行、默认遇错停止。
func (s *Server) handleExecuteScript(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()
	connID := argStr(args, "connection_id")
	sqlText := argStr(args, "sql")
	if connID == "" || sqlText == "" {
		return mcp.NewToolResultError("connection_id and sql are required"), nil
	}

	stmts := splitSQLStatements(sqlText)
	if len(stmts) == 0 {
		return mcp.NewToolResultError("script contains no executable statements"), nil
	}
	if len(stmts) > maxScriptStatements {
		return mcp.NewToolResultError(fmt.Sprintf(
			"script has %d statements, exceeding the limit of %d; split it into smaller batches", len(stmts), maxScriptStatements)), nil
	}

	cat := classifyScript(stmts)
	if cat == scriptRejected {
		return mcp.NewToolResultError(
			"every statement must pass the same whitelist and all statements must be the same category " +
				"(all read-only, all DML, or all DDL); mixed or non-whitelisted scripts are rejected. " +
				"Execute single statements with execute_query / execute_update / execute_ddl."), nil
	}

	var database *string
	if d := argStr(args, "database"); d != "" {
		database = &d
	}
	stopOnError := true
	if raw, ok := args["stop_on_error"]; ok {
		if b, ok2 := raw.(bool); ok2 {
			stopOnError = b
		}
	}

	// 确保连接已建立（事务需要连接池就绪；幂等）
	if err := s.app.ConnectDatabase(connID); err != nil {
		return mcp.NewToolResultErrorFromErr("connection failed", err), nil
	}

	result := scriptResult{
		Category:       cat.String(),
		StatementCount: len(stmts),
		Results:        make([]scriptStmtResult, 0, len(stmts)),
	}

	switch cat {
	case scriptDML:
		result.TransactionUsed = true
		if failed := runDMLScript(s.app, connID, stmts, database, &result); failed != nil {
			return failed, nil
		}

	case scriptDDL:
		for i, stmt := range stmts {
			if err := s.app.ExecuteDDL(connID, stmt, database, mcpTxSession); err != nil {
				if stopOnError {
					return mcp.NewToolResultError(fmt.Sprintf(
						"statement %d/%d failed: %v — execution stopped (%d statements succeeded). "+
							"Note: DDL is not transactional on most databases; succeeded statements are NOT rolled back",
						i+1, len(stmts), err, i)), nil
				}
				result.Results = append(result.Results, scriptStmtResult{
					Index: i, SQL: stmt, Error: err.Error(),
				})
				continue
			}
			result.Executed = i + 1
			result.Results = append(result.Results, scriptStmtResult{Index: i, SQL: stmt})
		}

	case scriptReadOnly:
		for i, stmt := range stmts {
			res, err := s.app.ExecuteQuery(connID, stmt, database, nil, mcpTxSession)
			// SQL 报错在 res.Error 里，只看 err 会把失败的查询当成「0 行」报成功
			stmtErr := res.Error
			if stmtErr == "" && err != nil {
				stmtErr = err.Error()
			}
			if stmtErr != "" {
				if stopOnError {
					return mcp.NewToolResultError(fmt.Sprintf(
						"statement %d/%d failed: %s (%d statements succeeded)", i+1, len(stmts), stmtErr, i)), nil
				}
				result.Results = append(result.Results, scriptStmtResult{
					Index: i, SQL: stmt, Error: stmtErr,
				})
				continue
			}
			result.Executed = i + 1
			sr := scriptStmtResult{Index: i, SQL: stmt, Columns: res.Columns}
			if res.RowsAffected != nil {
				sr.RowsAffected = *res.RowsAffected
			}
			if len(res.Rows) > scriptMaxRows {
				sr.Rows = res.Rows[:scriptMaxRows]
				sr.RowCount = len(res.Rows)
				sr.Truncated = true
			} else {
				sr.Rows = res.Rows
				sr.RowCount = len(res.Rows)
			}
			truncateCellStrings(sr.Rows, mcpCellMaxChars)
			result.Results = append(result.Results, sr)
		}
	}

	return mcp.NewToolResultJSON(result)
}

// dmlScriptRunner DML 脚本执行需要的后端能力。*backend.App 满足它；
// 抽成接口是为了不启动整个应用就能验证「任一语句失败整体回滚」。
type dmlScriptRunner interface {
	GetTransactionStatus(connectionID string, sessionID string) (bool, error)
	BeginTransaction(connectionID string, sessionID string, database string) error
	RollbackTransaction(connectionID string, sessionID string) (bool, error)
	CommitTransaction(connectionID string, sessionID string) (bool, error)
	ExecuteQuery(connectionID string, sql string, database *string, useTransaction *bool, sessionID string) (models.QueryResult, error)
}

// runDMLScript 在一笔事务里顺序执行 DML 脚本：任一语句失败即回滚并返回错误结果，
// 全部成功才提交。提交时事务已经不在（被看门狗回收）同样按失败返回。
// 返回 nil 表示已提交，逐语句明细写回 result。
func runDMLScript(runner dmlScriptRunner, connID string, stmts []string, database *string, result *scriptResult) *mcp.CallToolResult {
	// 已有手工事务时拒绝：脚本的 commit/rollback 会波及用户自己的事务
	if active, err := runner.GetTransactionStatus(connID, mcpTxSession); err == nil && active {
		return mcp.NewToolResultError(
			"connection has an active manual transaction; commit or roll it back before running a script")
	}
	// 事务开在脚本指定的库上（空 = 连接默认库）：语句带着 database 执行，
	// 事务开在别的库上会写到另一个库去
	scriptDB := ""
	if database != nil {
		scriptDB = *database
	}
	if err := runner.BeginTransaction(connID, mcpTxSession, scriptDB); err != nil {
		return mcp.NewToolResultErrorFromErr("failed to begin transaction", err)
	}

	// 语句必须在脚本自己的事务里执行：事务被看门狗回收后不能悄悄改成自动提交
	requireTx := true
	for i, stmt := range stmts {
		res, err := runner.ExecuteQuery(connID, stmt, database, &requireTx, mcpTxSession)
		// SQL 报错在 res.Error 里（ExecuteQuery 的 err 只表示没执行到数据库那一层）。
		// 此前只看 err：失败的语句被当成成功，脚本继续往下跑并提交了前面的语句
		stmtErr := res.Error
		if stmtErr == "" && err != nil {
			stmtErr = err.Error()
		}
		if stmtErr != "" {
			_, _ = runner.RollbackTransaction(connID, mcpTxSession)
			result.Transaction = "rolled_back"
			result.Results = append(result.Results, scriptStmtResult{
				Index: i, SQL: stmt, Error: stmtErr,
			})
			return mcp.NewToolResultError(fmt.Sprintf(
				"statement %d/%d failed: %s — transaction rolled back (%d statements had succeeded)",
				i+1, len(stmts), stmtErr, i))
		}
		var affected uint64
		if res.RowsAffected != nil {
			affected = *res.RowsAffected
		}
		result.Executed = i + 1
		result.Results = append(result.Results, scriptStmtResult{
			Index: i, SQL: stmt, RowsAffected: affected,
		})
	}

	committed, err := runner.CommitTransaction(connID, mcpTxSession)
	if err != nil {
		return mcp.NewToolResultErrorFromErr("failed to commit transaction", err)
	}
	if !committed {
		// 没有等待提交的事务：事务在脚本结束前就没了，不能报「已提交」
		return mcp.NewToolResultError(
			"the script's transaction was no longer active at commit time (rolled back by the inactivity timeout); " +
				"no statements from this script were committed. Re-run the script.")
	}
	result.Transaction = "committed"
	return nil
}
