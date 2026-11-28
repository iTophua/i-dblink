package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"idblink/backend/db"
	"idblink/backend/models"
)

// isDMLStatement 判断 SQL 是否为无结果集的写语句（需用 ExecContext 获取 RowsAffected）。
// REPLACE 是 MySQL 的 INSERT 变体，同样只有 Ok 包（走 QueryContext 拿不到影响行数）。
// WITH 开头的主语句在 CTE 之后（PG / MySQL 8 / SQL Server / SQLite 都有 WITH … UPDATE）：
// 这种写语句走 QueryContext 也会执行，只是拿不到影响行数，所以主语句是写语句时同样走 ExecContext
func isDMLStatement(sqlStr string) bool {
	s := strings.TrimSpace(sqlStr)
	// 去掉前导注释、分号和括号（T-SQL 习惯把 CTE 写成 ;WITH）
	for {
		s = strings.TrimLeft(s, " \t\n\r(;")
		if strings.HasPrefix(s, "--") {
			if idx := strings.IndexByte(s, '\n'); idx >= 0 {
				s = s[idx+1:]
				continue
			}
			return false
		}
		break
	}
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return false
	}
	switch strings.ToUpper(fields[0]) {
	case "INSERT", "REPLACE", "UPDATE", "DELETE", "MERGE":
		return true
	case "WITH":
		return isWriteVerb(withMainVerb(s))
	}
	return false
}

func isWriteVerb(verb string) bool {
	switch verb {
	case "INSERT", "REPLACE", "UPDATE", "DELETE", "MERGE":
		return true
	}
	return false
}

// ---- WITH 子句的主语句 ----
// 只为 isDMLStatement 服务，不是通用的 SQL 解析器

type sqlToken int

const (
	tokEOF    sqlToken = iota
	tokWord            // 裸词（关键字 / 标识符），统一成大写
	tokQuoted          // '…' / "…" / `…`，内容不看
	tokLParen          // (
	tokRParen          // )
	tokComma           // ,
	tokOther           // 其余单个字符：运算符、数字……只在括号里出现得合理
	tokBad             // 认不出的写法：放弃
)

func isLetterByte(c byte) bool { return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' }
func isDigitByte(c byte) bool  { return c >= '0' && c <= '9' }

func isSpaceByte(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v'
}

// scanToken 从 i 起扫出下一个 token。s 按字节看：多字节字符的每个字节都 ≥ 0x80，
// 不会和引号、括号混淆。各库对转义和注释的规则不一样——反斜杠是不是转义符要看方言和配置，
// MySQL 的 -- 后面要有空白、PG 的块注释能嵌套——这里一律按最严的来，认不出的给 tokBad：
//   - 引号里出现反斜杠，或引号没闭合
//   - $（PG 的 $tag$ 字符串）、#（MySQL 的注释）、MySQL 的可执行注释 /*! … */：
//     里面都可能夹着不成对的括号或关键字
//   - -- 后面不是空白；块注释里又出现 /*
func scanToken(s string, i int) (sqlToken, string, int) {
	for i < len(s) {
		c := s[i]
		switch {
		case isSpaceByte(c):
			i++
		case c == '-' && i+1 < len(s) && s[i+1] == '-':
			if i+2 >= len(s) || !isSpaceByte(s[i+2]) {
				return tokBad, "", i
			}
			for i < len(s) && s[i] != '\n' {
				i++
			}
		case c == '/' && i+1 < len(s) && s[i+1] == '*':
			rest := s[i+2:]
			end := strings.Index(rest, "*/")
			if end < 0 || rest[0] == '!' {
				return tokBad, "", i
			}
			if open := strings.Index(rest, "/*"); open >= 0 && open < end {
				return tokBad, "", i
			}
			i += 2 + end + 2
		case c == '\'' || c == '"' || c == '`':
			next, ok := skipQuotedToken(s, i)
			if !ok {
				return tokBad, "", i
			}
			return tokQuoted, "", next
		case c == '(':
			return tokLParen, "", i + 1
		case c == ')':
			return tokRParen, "", i + 1
		case c == ',':
			return tokComma, "", i + 1
		case c == '$' || c == '#':
			return tokBad, "", i
		case isLetterByte(c) || c == '_':
			j := i + 1
			for j < len(s) && (isLetterByte(s[j]) || isDigitByte(s[j]) || s[j] == '_') {
				j++
			}
			return tokWord, strings.ToUpper(s[i:j]), j
		default:
			return tokOther, "", i + 1
		}
	}
	return tokEOF, "", i
}

// skipQuotedToken 跳过 i 处引号开头的字面量 / 引用标识符（连写两个同样的引号 = 引号本身）
func skipQuotedToken(s string, i int) (int, bool) {
	q := s[i]
	for j := i + 1; j < len(s); {
		switch s[j] {
		case q:
			if j+1 < len(s) && s[j+1] == q {
				j += 2
				continue
			}
			return j + 1, true
		case '\\':
			return i, false
		}
		j++
	}
	return i, false
}

// skipParenthesized 跳过 open 处左括号起配对的一对括号，返回右括号之后的位置
func skipParenthesized(s string, open int) (int, bool) {
	i, depth := open, 0
	for {
		kind, _, next := scanToken(s, i)
		switch kind {
		case tokLParen:
			depth++
		case tokRParen:
			depth--
			if depth == 0 {
				return next, true
			}
		case tokEOF, tokBad:
			return i, false
		}
		i = next
	}
}

// withMainVerb 返回 WITH 子句后面主语句的首词（大写），拿不准时返回空串。
//
// CTE 列表只认这一种形状：[RECURSIVE] 名字 [(列)] AS [NOT] [MATERIALIZED] ( 体 )，之后要么是
// 逗号（后面还有 CTE），要么就是主语句。括号外的 token 必须一个不多不少地对上；括号里只保证
// 引号和注释不被当成括号。判错的代价不对称：把 SELECT 当成写语句去 Exec 会把结果集丢掉，
// 当成查询去 Query 只是少一个影响行数——所以认不出就放弃，不猜
func withMainVerb(s string) string {
	i := 0
	next := func() (sqlToken, string) {
		var kind sqlToken
		var word string
		kind, word, i = scanToken(s, i)
		return kind, word
	}
	if kind, word := next(); kind != tokWord || word != "WITH" {
		return ""
	}
	for {
		// [RECURSIVE] 名字
		kind, word := next()
		if kind == tokWord && word == "RECURSIVE" {
			kind, word = next()
		}
		if kind != tokWord && kind != tokQuoted {
			return ""
		}
		// 可选的列名表
		kind, word = next()
		if kind == tokLParen {
			end, ok := skipParenthesized(s, i-1)
			if !ok {
				return ""
			}
			i = end
			kind, word = next()
		}
		// AS [NOT] [MATERIALIZED] (
		if kind != tokWord || word != "AS" {
			return ""
		}
		kind, word = next()
		for kind == tokWord && (word == "NOT" || word == "MATERIALIZED") {
			kind, word = next()
		}
		if kind != tokLParen {
			return ""
		}
		end, ok := skipParenthesized(s, i-1)
		if !ok {
			return ""
		}
		i = end
		// 之后：逗号 = 后面还有 CTE，别的词 = 主语句
		kind, word = next()
		if kind == tokComma {
			continue
		}
		if kind != tokWord {
			return ""
		}
		return word
	}
}

var debugEnabled = os.Getenv("IDBLINK_DEBUG") == "1" || os.Getenv("IDBLINK_DEBUG") == "true"

func debugLog(format string, args ...interface{}) {
	if debugEnabled {
		fmt.Fprintf(os.Stderr, "[DEBUG] "+format+"\n", args...)
	}
}

// LongOpTimeout 查询/DDL 等长操作的服务端上限。此前 60s 会让大查询、
// 大 ALTER 直接超时失败（Navicat 无此限制）；30 分钟覆盖真实 DBA 工作负载，
// 且与 MySQL 驱动的 readTimeout 对齐兜底死连接。
const LongOpTimeout = 30 * time.Minute

// getQueryExecutor 按 use_transaction + session 路由执行器：
// 显式 false 或空 session = 自动提交；否则加入该会话的活跃事务（若有）。
// 显式 true 表示调用方要求在会话事务里执行（编辑器的手动模式）：事务不在了就报错，
// 不能落到自动提交——用户以为还能回滚，语句却已经生效
func (h *Handler) getQueryExecutor(req *models.QueryRequest) (db.Executor, error) {
	if (req.UseTransaction != nil && !*req.UseTransaction) || req.SessionID == "" {
		return h.mgr.GetExecutorNoTx(req.ConnectionID, req.Database)
	}
	requireTx := req.UseTransaction != nil && *req.UseTransaction
	return h.mgr.GetExecutorForSession(req.ConnectionID, req.Database, req.SessionID, requireTx)
}

// ExecuteQueryDirect 查询直通入口（Wails 绑定路径）：复用与 HTTP handler
// 完全相同的执行逻辑，但不做请求/响应的 JSON 编解码——大结果集在此前的
// callHandler 路径要付两次全量序列化（编码→解码→再编码给前端桥）。
// 错误统一落在 QueryResult.Error（与 HTTP 路径语义一致）。
// ctx 由调用方传入（超时与取消都由它决定）：rows.Next/Scan 全程感知取消，
// 驱动层的 ctx 监视器会中断正在执行的语句。
func (h *Handler) ExecuteQueryDirect(ctx context.Context, req *models.QueryRequest) *models.QueryResult {
	startTime := time.Now()
	debugLog("Query(direct): connectionID=%s, database=%s, sql=%s", req.ConnectionID, req.Database, req.SQL)

	exec, err := h.getQueryExecutor(req)
	if err != nil {
		return &models.QueryResult{Error: err.Error(), ExecutionTimeMs: time.Since(startTime).Milliseconds()}
	}

	result, err := executeSQL(ctx, exec, req.SQL, req.MaxRows)
	executionTimeMs := time.Since(startTime).Milliseconds()
	if err != nil {
		debugLog("ExecuteQueryDirect error: %v", err)
		return &models.QueryResult{Error: err.Error(), ExecutionTimeMs: executionTimeMs}
	}
	result.ExecutionTimeMs = executionTimeMs
	return result
}

// Query 执行 SQL 查询
func (h *Handler) Query(w http.ResponseWriter, r *http.Request) {
	var req models.QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "invalid request body")
		return
	}

	debugLog("Query: connectionID=%s, database=%s, sql=%s", req.ConnectionID, req.Database, req.SQL)

	startTime := time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), LongOpTimeout)
	defer cancel()

	exec, err := h.getQueryExecutor(&req)
	if err != nil {
		writeJSONError(w, err.Error())
		return
	}

	// 检查是否需要流式传输（大数据集）
	streamEnabled := r.URL.Query().Get("stream") == "true" || req.StreamResults

	if streamEnabled {
		// 流式传输模式
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Transfer-Encoding", "chunked")

		// 发送初始响应
		initialResp := models.QueryResult{
			Streaming: true,
			Columns:   []string{},
			Rows:      nil,
			Error:     "",
		}
		if err := json.NewEncoder(w).Encode(initialResp); err != nil {
			writeJSONError(w, "failed to send initial response")
			return
		}

		// 执行查询并流式传输结果
		if err := streamQueryResults(w, ctx, exec, req.SQL); err != nil {
			// 发送错误响应
			errorResp := models.QueryResult{
				Streaming: true,
				Error:     err.Error(),
			}
			json.NewEncoder(w).Encode(errorResp)
			return
		}

		executionTimeMs := time.Since(startTime).Milliseconds()
		// 发送执行时间
		timeResp := models.QueryResult{
			Streaming:       true,
			ExecutionTimeMs: executionTimeMs,
		}
		json.NewEncoder(w).Encode(timeResp)
	} else {
		// 传统模式 - 一次性加载所有数据
		result, err := executeSQL(ctx, exec, req.SQL, req.MaxRows)

		executionTimeMs := time.Since(startTime).Milliseconds()

		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			json.NewEncoder(w).Encode(models.QueryResult{
				Error:           err.Error(),
				ExecutionTimeMs: executionTimeMs,
			})
			return
		}
		result.ExecutionTimeMs = executionTimeMs
		json.NewEncoder(w).Encode(result)
	}
}

// streamQueryResults 流式传输查询结果
func streamQueryResults(w http.ResponseWriter, ctx context.Context, exec db.Executor, sqlStr string) error {
	rows, err := exec.QueryContext(ctx, sqlStr)
	if err != nil {
		return fmt.Errorf("query execution failed: %w", err)
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil {
			debugLog("rows.Close error: %v", closeErr)
		}
	}()

	// 获取列信息
	columns, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("failed to get columns: %w", err)
	}

	// 发送列信息
	columnsResp := models.QueryResult{
		Streaming: true,
		Columns:   columns,
	}
	if err := json.NewEncoder(w).Encode(columnsResp); err != nil {
		return fmt.Errorf("failed to send columns: %w", err)
	}

	// 发送行数据
	rowCount := 0
	for rows.Next() {
		row := make([]interface{}, len(columns))
		rowPtrs := make([]interface{}, len(columns))
		for i := range row {
			rowPtrs[i] = &row[i]
		}

		if err := rows.Scan(rowPtrs...); err != nil {
			return fmt.Errorf("row scan failed at row %d: %w", rowCount, err)
		}

		// 转换值为 JSON 友好类型
		jsonRow := make([]interface{}, len(columns))
		for i, v := range row {
			jsonRow[i] = convertValue(v)
		}

		// 发送行数据
		rowResp := models.QueryResult{
			Streaming: true,
			Rows:      [][]interface{}{jsonRow},
		}
		if err := json.NewEncoder(w).Encode(rowResp); err != nil {
			return fmt.Errorf("failed to send row %d: %w", rowCount, err)
		}

		rowCount++
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("rows iteration error: %w", err)
	}

	return nil
}

// executeSQL 执行查询并收集结果。maxRows 非 nil 且 >0 时限制返回行数：
// 达到上限即提前停止扫描（不再从数据库读剩余行），并置 result.Truncated=true。
func executeSQL(ctx context.Context, exec db.Executor, sqlStr string, maxRows *int) (*models.QueryResult, error) {
	debugLog("executeSQL start: sql=%s", sqlStr)

	// DML（INSERT/UPDATE/DELETE/MERGE）无结果集，用 ExecContext 获取 RowsAffected
	if isDMLStatement(sqlStr) {
		res, err := exec.ExecContext(ctx, sqlStr)
		if err != nil {
			debugLog("ExecContext error: %v", err)
			return nil, err
		}
		affected, _ := res.RowsAffected()
		result := &models.QueryResult{
			Columns: []string{},
			Rows:    make([][]interface{}, 0),
		}
		if affected >= 0 {
			n := uint64(affected)
			result.RowsAffected = &n
		}
		debugLog("executeSQL end (DML, affected=%d)", affected)
		return result, nil
	}

	rows, err := exec.QueryContext(ctx, sqlStr)
	if err != nil {
		debugLog("QueryContext error: %v", err)
		return nil, err
	}
	// 确保rows在关闭前不为nil
	if rows != nil {
		defer func() {
			if closeErr := rows.Close(); closeErr != nil {
				debugLog("rows.Close error: %v", closeErr)
			}
		}()
	}
	debugLog("QueryContext success")

	columns, err := rows.Columns()
	if err != nil {
		debugLog("rows.Columns error: %v", err)
		return nil, err
	}
	debugLog("columns=%v", columns)

	result := &models.QueryResult{
		Columns: columns,
		Rows:    make([][]interface{}, 0),
	}

	rowLimit := 0 // 0 = 不限制
	if maxRows != nil && *maxRows > 0 {
		rowLimit = *maxRows
	}

	rowCount := 0
	for rows.Next() {
		if rowLimit > 0 && rowCount >= rowLimit {
			result.Truncated = true
			debugLog("max_rows reached (%d), stop scanning", rowLimit)
			break
		}
		row := make([]interface{}, len(columns))
		rowPtrs := make([]interface{}, len(columns))
		for i := range row {
			rowPtrs[i] = &row[i]
		}

		if err := rows.Scan(rowPtrs...); err != nil {
			debugLog("rows.Scan error at row %d: %v", rowCount, err)
			return nil, err
		}

		// 转换值为 JSON 友好类型
		jsonRow := make([]interface{}, len(columns))
		for i, v := range row {
			jsonRow[i] = convertValue(v)
		}
		result.Rows = append(result.Rows, jsonRow)
		rowCount++
	}
	debugLog("rows scanned: %d", rowCount)

	if err := rows.Err(); err != nil {
		debugLog("rows.Err: %v", err)
		return nil, err
	}

	debugLog("executeSQL end")
	return result, nil
}

// jsSafeIntMax JS Number（双精度）能精确表示的最大整数（2^53-1）。
// 超过它的整数经 JSON 传给前端/客户端会被取整：雪花 ID 等 BIGINT 主键
// 末几位变错，表数据编辑生成的 WHERE 匹配不到行、静默 0 行生效。
const jsSafeIntMax = int64(1)<<53 - 1

// convertValue 将数据库原始值转换为 JSON 友好的类型。
// 超出 JS 安全整数范围的整数以十进制字符串传递，保证数字无损。
func convertValue(v interface{}) interface{} {
	switch val := v.(type) {
	case nil:
		return nil
	case int64:
		if val > jsSafeIntMax || val < -jsSafeIntMax {
			return strconv.FormatInt(val, 10)
		}
		return val
	case int32:
		return int64(val)
	case int:
		if int64(val) > jsSafeIntMax || int64(val) < -jsSafeIntMax {
			return strconv.FormatInt(int64(val), 10)
		}
		return int64(val)
	case float64:
		return val
	case float32:
		return float64(val)
	case bool:
		return val
	case string:
		return val
	case []byte:
		// 尝试作为 UTF-8 字符串解码，成功则返回字符串
		if str := string(val); isValidUTF8(str) {
			return str
		}
		// 真正的二进制数据才显示为 BLOB
		return fmt.Sprintf("[BLOB: %d bytes]", len(val))
	case time.Time:
		return val.Format("2006-01-02 15:04:05")
	default:
		// 其他类型尝试转字符串
		return fmt.Sprintf("%v", val)
	}
}

// isValidUTF8 检查字符串是否为有效的 UTF-8
func isValidUTF8(s string) bool {
	return utf8.ValidString(s)
}
