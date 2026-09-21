package mcpserver

import "strings"

// stripSQLComments 移除 SQL 注释（-- 行注释、/* */ 块注释），用于语句类型判定前的预处理。
// 只剥离各方言无歧义的注释形式；# 行注释是 MySQL 专属（PG 中是运算符），不处理以免误判。
// 字符串字面量（'..'、".."、`..`）中的注释符原样保留；块注释替换为单个空格防止 token 粘连。
// 本函数宁严勿松：识别不准的注释形式不剥离，最多导致误拒，不会漏放写操作。
func stripSQLComments(sql string) string {
	var b strings.Builder
	r := []rune(sql)
	n := len(r)
	for i := 0; i < n; {
		c := r[i]
		switch {
		case c == '\'' || c == '"' || c == '`':
			// 字符串字面量：原样复制到闭合引号
			quote := c
			b.WriteRune(c)
			i++
			for i < n {
				if r[i] == quote {
					b.WriteRune(quote)
					i++
					// '' / "" 连续引号 = 字面量内的转义引号，字符串继续
					if i < n && r[i] == quote {
						b.WriteRune(quote)
						i++
						continue
					}
					break
				}
				// MySQL 反斜杠转义（\' 等）；反引号标识符无此转义
				if quote != '`' && r[i] == '\\' && i+1 < n {
					b.WriteRune(r[i])
					b.WriteRune(r[i+1])
					i += 2
					continue
				}
				b.WriteRune(r[i])
				i++
			}
		case c == '-' && i+1 < n && r[i+1] == '-' && isLineCommentStart(r, i+2):
			// -- 行注释：要求后随空白或结尾（MySQL 语义；PG 无空格的 --x 也是注释，
			// 不剥离它只会导致误拒，安全方向正确）
			for i < n && r[i] != '\n' {
				i++
			}
		case c == '/' && i+1 < n && r[i+1] == '*':
			// /* */ 块注释
			i += 2
			for i < n {
				if r[i] == '*' && i+1 < n && r[i+1] == '/' {
					i += 2
					break
				}
				i++
			}
			b.WriteRune(' ')
		default:
			b.WriteRune(c)
			i++
		}
	}
	return b.String()
}

// isLineCommentStart 判断 -- 后面是否为空白或结尾（MySQL 要求 -- 后有空格才是注释）。
func isLineCommentStart(r []rune, i int) bool {
	return i >= len(r) || r[i] == ' ' || r[i] == '\t' || r[i] == '\n' || r[i] == '\r'
}

// countUnquotedSemicolons 统计引号外的分号数量——字符串/标识符字面量内的分号
// （如 VALUES ('a;b')）不是语句分隔符。三个分类器的多语句判定共用。
func countUnquotedSemicolons(s string) int {
	r := []rune(s)
	n := len(r)
	count := 0
	for i := 0; i < n; {
		c := r[i]
		if c == '\'' || c == '"' || c == '`' {
			quote := c
			i++
			for i < n {
				if r[i] == quote {
					i++
					if i < n && r[i] == quote {
						i++
						continue
					}
					break
				}
				if quote != '`' && r[i] == '\\' && i+1 < n {
					i += 2
					continue
				}
				i++
			}
			continue
		}
		if c == ';' {
			count++
		}
		i++
	}
	return count
}

// IsReadOnlyQuery 检查 SQL 是否为只读查询（SELECT/WITH/EXPLAIN/SHOW/DESCRIBE/DESC/USE/PRAGMA）。
// 先剥离注释再判定，避免 "-- 注释\nSELECT ..." 被前缀检查误拒。
// 拒绝：多语句（引号外分号分隔）、SELECT...INTO（写操作）。
// 这是一道安全防线——即使 AI 误传写操作，也不会执行。
func IsReadOnlyQuery(sql string) bool {
	if sql == "" {
		return false
	}
	s := strings.TrimSpace(stripSQLComments(sql))
	upper := strings.ToUpper(s)

	// 拒绝多语句（允许末尾单个分号）
	semiCount := countUnquotedSemicolons(upper)
	if semiCount > 1 {
		return false
	}
	if semiCount == 1 && !strings.HasSuffix(upper, ";") {
		return false
	}
	// 去掉末尾分号再检查
	upper = strings.TrimSuffix(upper, ";")
	upper = strings.TrimSpace(upper)

	// 拒绝 SELECT ... INTO（这是写操作，如 SELECT ... INTO OUTFILE / INTO DUMPFILE / INTO @var）
	if strings.Contains(upper, " INTO ") {
		return false
	}

	// 白名单前缀
	readOnlyPrefixes := []string{
		"SELECT", "WITH", "EXPLAIN", "SHOW", "DESCRIBE", "DESC",
		"USE", "PRAGMA", "TABLE",
	}
	for _, prefix := range readOnlyPrefixes {
		if strings.HasPrefix(upper, prefix+" ") || upper == prefix {
			return true
		}
	}
	return false
}

// IsDMLStatement 检查 SQL 是否为 DML（INSERT/UPDATE/DELETE/MERGE/REPLACE）。
// 拒绝所有 DDL（CREATE/DROP/ALTER/TRUNCATE/RENAME/GRANT/REVOKE）。
// 拒绝多语句（防止 "INSERT ...; DROP TABLE ..." 注入）。
func IsDMLStatement(sql string) bool {
	if sql == "" {
		return false
	}

	// 安全检查：拒绝多语句（防止 SQL 注入；引号内分号不算分隔符）
	upper := strings.ToUpper(strings.TrimSpace(stripSQLComments(sql)))
	semiCount := countUnquotedSemicolons(upper)
	if semiCount > 1 {
		return false
	}
	if semiCount == 1 && !strings.HasSuffix(upper, ";") {
		// 分号不在末尾 = 多语句
		return false
	}
	upper = strings.TrimSpace(strings.TrimSuffix(upper, ";"))

	// 取第一个关键字
	fields := strings.Fields(upper)
	if len(fields) == 0 {
		return false
	}
	// 处理 WITH ... AS (... ) INSERT/UPDATE/DELETE 的情况——看 CTE 后面的语句
	// 简化处理：检查前两个关键字
	first := fields[0]
	second := ""
	if len(fields) > 1 {
		second = fields[1]
	}

	// REPLACE INTO / MERGE INTO / DELETE FROM / INSERT INTO / UPDATE table
	switch first {
	case "INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE":
		return true
	case "WITH":
		// CTE 后跟 INSERT/UPDATE/DELETE 是合法 DML
		// 但复杂解析太重，WITH 开头的 DML 少见，保守拒绝
		_ = second
		return false
	}
	return false
}

// IsDDLStatement 检查 SQL 是否为 DDL（CREATE/DROP/ALTER/TRUNCATE/RENAME）。
// 拒绝多语句：PostgreSQL 等驱动的 Exec 会把分号分隔的多条语句全部执行，
// "CREATE ...; DROP ..." 注入必须在此拦下（代价：PG 的 $$...$$ 函数体内
// 含分号的 CREATE FUNCTION 会被误拒——宁严勿松）。
func IsDDLStatement(sql string) bool {
	if sql == "" {
		return false
	}
	upper := strings.TrimSpace(stripSQLComments(strings.ToUpper(sql)))
	semiCount := countUnquotedSemicolons(upper)
	if semiCount > 1 {
		return false
	}
	if semiCount == 1 && !strings.HasSuffix(upper, ";") {
		// 分号不在末尾 = 多语句
		return false
	}
	upper = strings.TrimSpace(strings.TrimSuffix(upper, ";"))
	fields := strings.Fields(upper)
	if len(fields) == 0 {
		return false
	}
	switch fields[0] {
	case "CREATE", "DROP", "ALTER", "TRUNCATE", "RENAME":
		return true
	}
	return false
}
