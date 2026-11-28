package mcpserver

import (
	"strings"
	"unicode"
)

// ==================== 词法视图 ====================
//
// 三个分类器（只读 / DML / DDL）都建立在同一个判断上：这段 SQL 里哪些是代码，哪些是注释、
// 字符串字面量、引用标识符。分号是不是语句分隔符、第一个关键字是什么，全看这条边界。
// 边界画错有两个方向：把字面量当成代码只会误拒；把代码当成字面量，藏在「字符串」里的第二条
// 语句就跟着第一条一起发给数据库了（lib/pq 不带参数时走简单协议，一次执行整段）。此前扫描器
// 一律把 \ 当转义符、也不认 $tag$：PG 上 SELECT '\'; DROP TABLE t; SELECT '' 被看成一条
// SELECT，只读工具拦不住。所以词法按方言来，只认有把握的写法，认不出的一律拒绝。

// sqlLexRules 各方言的词法差异
type sqlLexRules struct {
	backslashEscape bool // 字符串里的 \ 是转义符
	dollarQuote     bool // $tag$…$tag$ 字符串
	escapeString    bool // E'…' 里 \ 是转义符，普通字符串里不是
	hashComment     bool // # 到行尾是注释
	dashNeedsSpace  bool // -- 后面必须跟空白才是注释
	nestedComments  bool // /* */ 可以嵌套
	execComment     bool // /*! … */ 是可执行注释，内容是 SQL 的一部分
	bracketIdent    bool // [ident] 是引用标识符
	qQuote          bool // q'[…]' 字符串：解析不了，遇到就拒绝
	unknown         bool // 未知方言：字符串里出现 \ 时判断不了
}

func lexRulesFor(dbType string) sqlLexRules {
	switch dbType {
	case "mysql", "mariadb":
		return sqlLexRules{backslashEscape: true, hashComment: true, dashNeedsSpace: true, execComment: true}
	case "clickhouse", "tdengine":
		return sqlLexRules{backslashEscape: true, dashNeedsSpace: true}
	case "postgresql", "kingbase", "highgo", "vastbase":
		return sqlLexRules{dollarQuote: true, escapeString: true, nestedComments: true}
	case "oracle", "dameng":
		return sqlLexRules{qQuote: true}
	case "sqlserver":
		return sqlLexRules{bracketIdent: true}
	case "sqlite", "sqlite3":
		return sqlLexRules{}
	default:
		return sqlLexRules{unknown: true}
	}
}

// sqlView 一段 SQL 的词法视图
type sqlView struct {
	code       string // 与原文等长：注释、字符串、引用标识符全部抹成空格，只剩关键字、数字、运算符、括号、分号
	noComments string // 与原文等长：只抹注释，字符串原样保留（切分脚本时从这里取语句原文）
	ok         bool   // 所有字面量和注释都闭合、没有认不出的写法；false 时调用方必须拒绝
}

func lexSQL(dbType, sql string) sqlView {
	rules := lexRulesFor(dbType)
	r := []rune(sql)
	n := len(r)
	code := append([]rune(nil), r...)
	noComments := append([]rune(nil), r...)
	ok := true

	// 注释两份都抹；字面量只抹 code（执行时要原文）
	blank := func(from, to int) {
		for k := from; k < to && k < n; k++ {
			code[k] = ' '
			noComments[k] = ' '
		}
	}
	blankCode := func(from, to int) {
		for k := from; k < to && k < n; k++ {
			code[k] = ' '
		}
	}

	for i := 0; i < n; {
		c := r[i]
		switch {
		case c == '-' && i+1 < n && r[i+1] == '-' && (!rules.dashNeedsSpace || i+2 >= n || isSQLSpace(r[i+2])):
			j := i
			for j < n && r[j] != '\n' {
				j++
			}
			blank(i, j)
			i = j

		case c == '/' && i+1 < n && r[i+1] == '*':
			if rules.execComment && i+2 < n && r[i+2] == '!' {
				// MySQL 可执行注释：只抹开头的 /*! 和版本号，内容照常当 SQL 扫
				j := i + 3
				for j < n && r[j] >= '0' && r[j] <= '9' {
					j++
				}
				blank(i, j)
				i = j
				continue
			}
			depth, j := 1, i+2
			for j < n && depth > 0 {
				switch {
				case rules.nestedComments && j+1 < n && r[j] == '/' && r[j+1] == '*':
					depth++
					j += 2
				case j+1 < n && r[j] == '*' && r[j+1] == '/':
					depth--
					j += 2
				default:
					j++
				}
			}
			if depth > 0 {
				ok = false
			}
			blank(i, j)
			i = j

		case c == '#' && rules.hashComment:
			j := i
			for j < n && r[j] != '\n' {
				j++
			}
			blank(i, j)
			i = j

		case c == '\'' || c == '"' || c == '`':
			esc := c != '`' && rules.backslashEscape
			if c == '\'' && rules.escapeString && escapeStringStarts(r, i) {
				esc = true
			}
			end, closed := scanQuoted(r, i, esc)
			if !closed || (rules.unknown && strings.ContainsRune(string(r[i:end]), '\\')) {
				ok = false
			}
			blankCode(i, end)
			i = end

		case c == '[' && rules.bracketIdent:
			j, closed := i+1, false
			for j < n {
				if r[j] == ']' {
					if j+1 < n && r[j+1] == ']' { // ]] 是标识符里的 ]
						j += 2
						continue
					}
					j++
					closed = true
					break
				}
				j++
			}
			if !closed {
				ok = false
			}
			blankCode(i, j)
			i = j

		case c == '$' && rules.dollarQuote:
			end, isQuote, closed := dollarQuote(r, i)
			if !isQuote {
				i++
				break
			}
			if !closed {
				ok = false
			}
			blankCode(i, end)
			i = end

		case (c == 'q' || c == 'Q') && rules.qQuote && i+1 < n && r[i+1] == '\'' && (i == 0 || !isIdentCont(r[i-1])):
			// q'[…]'：定界符是成对括号或任意一个字符，不解析，整条拒绝
			ok = false
			i += 2

		default:
			i++
		}
	}
	return sqlView{code: string(code), noComments: string(noComments), ok: ok}
}

// scanQuoted 从 r[i] 的开引号扫到闭引号，返回闭引号之后的位置；没闭合时返回 len(r), false
func scanQuoted(r []rune, i int, esc bool) (int, bool) {
	quote := r[i]
	for j := i + 1; j < len(r); {
		if r[j] == quote {
			if j+1 < len(r) && r[j+1] == quote { // '' / "" / `` 是字面量里的引号
				j += 2
				continue
			}
			return j + 1, true
		}
		if esc && r[j] == '\\' && j+1 < len(r) {
			j += 2
			continue
		}
		j++
	}
	return len(r), false
}

// escapeStringStarts 判断 r[i] 的引号是不是 E'…' 的开头：E 和引号之间可以有空白，
// E 前面不能是标识符字符（abe'x' 里 abe 是标识符，后面是普通字符串）
func escapeStringStarts(r []rune, i int) bool {
	j := i - 1
	for j >= 0 && isSQLSpace(r[j]) {
		j--
	}
	if j < 0 || (r[j] != 'e' && r[j] != 'E') {
		return false
	}
	return j == 0 || !isIdentCont(r[j-1])
}

// dollarQuote 判断 r[i] 的 $ 是不是 $tag$ 字符串的定界符，是的话返回整个字符串之后的位置。
// PG 未加引号的标识符里可以带 $（foo$tag$ 是一个标识符）：前面是标识符字符时，这个 $ 属于标识符
func dollarQuote(r []rune, i int) (end int, isQuote, closed bool) {
	if i > 0 && isIdentCont(r[i-1]) {
		return 0, false, false
	}
	j := i + 1
	for j < len(r) && isDollarTagChar(r[j]) {
		j++
	}
	if j >= len(r) || r[j] != '$' {
		return 0, false, false
	}
	// 标签不能以数字开头（$1$ 是参数 $1 后面跟了个 $，不是定界符）
	if j == i+2 && !unicode.IsLetter(r[i+1]) && r[i+1] != '_' {
		return 0, false, false
	}
	delim := r[i : j+1]
	for k := j + 1; k+len(delim) <= len(r); k++ {
		if runesEqual(r[k:k+len(delim)], delim) {
			return k + len(delim), true, true
		}
	}
	return len(r), true, false
}

func runesEqual(a, b []rune) bool {
	for k := range b {
		if a[k] != b[k] {
			return false
		}
	}
	return true
}

func isSQLSpace(c rune) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v'
}

// isIdentCont 标识符可以出现的字符：字母、数字、下划线、$ 和高位字符（PG 的规则，取并集）
func isIdentCont(c rune) bool {
	return c == '_' || c == '$' || c >= 0x80 || unicode.IsLetter(c) || unicode.IsDigit(c)
}

// isDollarTagChar $tag$ 的标签只认 ASCII 字母、数字、下划线（PG 还允许高位字符，这里取子集）
func isDollarTagChar(c rune) bool {
	return c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
}

// ==================== 语句视图 ====================

// singleStatement 校验 sql 恰好是一条语句（引号外的分号只能有一个、且在末尾），返回两份文本：
// code 是词法视图（判类型用），text 是去掉注释和末尾分号的原文（拿去执行用）
func singleStatement(dbType, sql string) (text, code string, ok bool) {
	v := lexSQL(dbType, sql)
	if !v.ok {
		return "", "", false
	}
	code = strings.TrimSpace(v.code)
	text = strings.TrimSpace(v.noComments)
	if strings.HasSuffix(code, ";") {
		code = strings.TrimSpace(strings.TrimSuffix(code, ";"))
		text = strings.TrimSpace(strings.TrimSuffix(text, ";"))
	}
	if code == "" || strings.ContainsRune(code, ';') {
		return "", "", false
	}
	return text, code, true
}

// words 代码视图里的全部词（关键字、标识符、数字）
func words(code string) []string {
	var out []string
	r := []rune(code)
	for i := 0; i < len(r); {
		if !isIdentCont(r[i]) {
			i++
			continue
		}
		j := i
		for j < len(r) && isIdentCont(r[j]) {
			j++
		}
		out = append(out, string(r[i:j]))
		i = j
	}
	return out
}

func eq(word, keyword string) bool { return strings.EqualFold(word, keyword) }

func hasWord(ws []string, keywords ...string) bool {
	for _, w := range ws {
		for _, k := range keywords {
			if eq(w, k) {
				return true
			}
		}
	}
	return false
}

// nextWord 返回 pos 起的第一个词和它之后的位置；pos 指向的不是词（标点）时返回空串和原位置
func nextWord(r []rune, pos int) (string, int) {
	for pos < len(r) && isSQLSpace(r[pos]) {
		pos++
	}
	if pos >= len(r) || !isIdentCont(r[pos]) {
		return "", pos
	}
	j := pos
	for j < len(r) && isIdentCont(r[j]) {
		j++
	}
	return string(r[pos:j]), j
}

func skipSpaces(r []rune, pos int) int {
	for pos < len(r) && isSQLSpace(r[pos]) {
		pos++
	}
	return pos
}

// skipParens r[pos] 是 '('：返回配对的 ')' 之后的位置，括号不闭合时返回 -1
func skipParens(r []rune, pos int) int {
	depth := 0
	for ; pos < len(r); pos++ {
		switch r[pos] {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				return pos + 1
			}
		}
	}
	return -1
}

// withMainWord 跳过 WITH 子句（[RECURSIVE] 名字 [(列…)] AS [NOT] [MATERIALIZED] (…), …），
// 返回主语句的第一个词；结构和这个写法对不上时返回空串
func withMainWord(r []rune) string {
	_, pos := nextWord(r, 0) // WITH
	if w, p := nextWord(r, pos); eq(w, "RECURSIVE") {
		pos = p
	}
	for {
		name, p := nextWord(r, pos)
		if name == "" {
			return ""
		}
		pos = skipSpaces(r, p)
		if pos < len(r) && r[pos] == '(' { // 列名列表
			if pos = skipParens(r, pos); pos < 0 {
				return ""
			}
		}
		as, p := nextWord(r, pos)
		if !eq(as, "AS") {
			return ""
		}
		pos = p
		for {
			w, p := nextWord(r, pos)
			if !eq(w, "NOT") && !eq(w, "MATERIALIZED") {
				break
			}
			pos = p
		}
		pos = skipSpaces(r, pos)
		if pos >= len(r) || r[pos] != '(' {
			return ""
		}
		if pos = skipParens(r, pos); pos < 0 {
			return ""
		}
		pos = skipSpaces(r, pos)
		if pos < len(r) && r[pos] == ',' {
			pos++
			continue
		}
		break
	}
	w, _ := nextWord(r, pos)
	return w
}

// ==================== 分类器 ====================
//
// 这是一道安全边界：工具描述告诉调用方 execute_query 只读，客户端据此免确认放行，
// 所以这里认不准的一律不放行。三个分类器共用同一套词法，都只接受单条语句。

var dmlWords = []string{"INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE"}

// IsReadOnlyQuery 检查 SQL 是否是只读查询。允许 SELECT / TABLE / SHOW / DESCRIBE /
// 只读的 WITH 查询 / 不带 ANALYZE 的 EXPLAIN / 只读形式的 PRAGMA。
// 拒绝：多语句、没闭合或认不出的引号写法、SELECT … INTO、数据修改 CTE 与 WITH … DML
// （EXPLAIN ANALYZE 会真的执行语句，同样拒绝）、赋值形式的 PRAGMA。
// USE 也拒绝：语句跑在连接池上，USE 改的只是其中一条连接的默认库，后面不带 database 的调用
// 不一定落在它上面——要换库请用工具的 database 参数
func IsReadOnlyQuery(dbType, sql string) bool {
	_, code, ok := singleStatement(dbType, sql)
	if !ok {
		return false
	}
	ws := words(code)
	if len(ws) == 0 {
		return false
	}
	switch {
	case hasWord(ws[:1], "SELECT", "TABLE", "SHOW", "DESCRIBE", "DESC"):
		// SELECT … INTO：PG 建表、MySQL 写文件 / 写变量
		return !hasWord(ws, "INTO")
	case eq(ws[0], "WITH"):
		// WITH d AS (DELETE … RETURNING *) SELECT …、WITH c AS (…) UPDATE …：
		// 只读语句里不该出现这几个动词（字面量和引用标识符已经抹掉，不会误伤）
		return !hasWord(ws, dmlWords...)
	case eq(ws[0], "EXPLAIN"):
		return !explainRunsStatement(ws)
	case eq(ws[0], "PRAGMA"):
		return readOnlyPragma(code)
	}
	return false
}

// explainRunsStatement EXPLAIN ANALYZE / EXPLAIN (ANALYZE …) 会真的执行语句
func explainRunsStatement(ws []string) bool {
	// 选项列表里出现 ANALYZE 即拒绝；它本身就是各库的保留字，不会和标识符混淆
	return hasWord(ws[1:], "ANALYZE", "ANALYSE")
}

// SQLite 的查询类 PRAGMA：可以带括号参数，都是只读的
var sqliteQueryPragmas = map[string]bool{
	"table_info": true, "table_xinfo": true, "index_info": true, "index_xinfo": true,
	"index_list": true, "index_header": true, "foreign_key_list": true, "foreign_key_check": true,
	"integrity_check": true, "quick_check": true, "collation_list": true, "module_list": true,
	"pragma_list": true,
}

// 不带参数也会动手的 PRAGMA（检查点 / 回收 / 优化）
var sqliteCommandPragmas = map[string]bool{
	"wal_checkpoint": true, "incremental_vacuum": true, "optimize": true, "shrink_memory": true,
}

// readOnlyPragma 只认两种读形式：PRAGMA 名字、PRAGMA 名字(参数)（名字在查询类白名单里）。
// PRAGMA 名字 = 值 和 PRAGMA 名字(值) 都是写——user_version、journal_mode 这样就改了库。
// 名字可以带 schema（main.table_info）
func readOnlyPragma(code string) bool {
	r := []rune(code)
	_, pos := nextWord(r, 0) // PRAGMA
	pos = skipSpaces(r, pos)
	start := pos
	for pos < len(r) && (isIdentCont(r[pos]) || r[pos] == '.') {
		pos++
	}
	if pos == start {
		return false
	}
	name := strings.ToLower(string(r[start:pos]))
	if i := strings.LastIndexByte(name, '.'); i >= 0 {
		name = name[i+1:]
	}
	rest := strings.TrimSpace(string(r[pos:]))
	if strings.ContainsRune(rest, '=') {
		return false
	}
	if rest == "" {
		return !sqliteCommandPragmas[name]
	}
	// 带参数的只能是 (…) 查询形式
	return strings.HasPrefix(rest, "(") && strings.HasSuffix(rest, ")") && sqliteQueryPragmas[name]
}

// IsDMLStatement 检查 SQL 是否是 DML（INSERT / UPDATE / DELETE / MERGE / REPLACE，
// 可以带 WITH 子句）。拒绝多语句，防止 "INSERT …; DROP TABLE …" 混进来
func IsDMLStatement(dbType, sql string) bool {
	_, code, ok := singleStatement(dbType, sql)
	if !ok {
		return false
	}
	r := []rune(code)
	w, _ := nextWord(r, 0)
	if eq(w, "WITH") {
		w = withMainWord(r)
	}
	return hasWord([]string{w}, dmlWords...)
}

// IsDDLStatement 检查 SQL 是否是 DDL 及同级的结构类语句（CREATE / DROP / ALTER / TRUNCATE / RENAME，
// 以及授权 GRANT / REVOKE 和对象注释 COMMENT ON）。都是改结构、不改数据的单条语句，归 execute_ddl。
// 拒绝多语句。PG 系的 $tag$ 字符串按字面量处理，函数体里的分号不算分隔符——
// CREATE FUNCTION … AS $$ BEGIN …; END; $$ 是一条语句；其余方言的函数体没法可靠切分，仍然拒绝
func IsDDLStatement(dbType, sql string) bool {
	_, code, ok := singleStatement(dbType, sql)
	if !ok {
		return false
	}
	w, _ := nextWord([]rune(code), 0)
	return hasWord([]string{w}, "CREATE", "DROP", "ALTER", "TRUNCATE", "RENAME", "GRANT", "REVOKE", "COMMENT")
}

// IsProcedureCall 检查 SQL 是否是调用存储过程。各库写法不同：CALL（MySQL、PG 11+、达梦、
// 人大金仓、Oracle）、EXEC / EXECUTE（SQL Server），PG 系另有 DO（匿名块：函数体在 $tag$ 里，
// 是一条语句）。Oracle / SQL Server 的匿名块（BEGIN … END;）里全是分号，没法可靠切分，不收。
// 拒绝多语句
func IsProcedureCall(dbType, sql string) bool {
	_, code, ok := singleStatement(dbType, sql)
	if !ok {
		return false
	}
	w, _ := nextWord([]rune(code), 0)
	switch {
	case hasWord([]string{w}, "CALL", "EXEC", "EXECUTE"):
		return true
	case eq(w, "DO"):
		return pgFamily(dbType)
	}
	return false
}

// explainTarget 返回可以拿去生成执行计划的语句（去掉注释和末尾分号的原文）。
// 有执行计划的是查询和数据修改语句；EXPLAIN 本身不执行它们，但 ANALYZE 会，所以 ANALYZE 开头
// 的、以及已经是 EXPLAIN 的都不收。explain_query 标了 readOnlyHint，这条边界要和 IsReadOnlyQuery 一样严
func explainTarget(dbType, sql string) (string, bool) {
	text, code, ok := singleStatement(dbType, sql)
	if !ok {
		return "", false
	}
	r := []rune(code)
	main, _ := nextWord(r, 0)
	if eq(main, "WITH") {
		if main = withMainWord(r); main == "" {
			return "", false
		}
	}
	if !hasWord([]string{main}, append(append([]string{}, dmlWords...), "SELECT", "TABLE", "VALUES")...) {
		return "", false
	}
	return text, true
}
