package mcpserver

import "strings"

// IsReadOnlyQuery 检查 SQL 是否为只读查询（SELECT/WITH/EXPLAIN/SHOW/DESCRIBE/DESC/USE/PRAGMA）。
// 拒绝：多语句（分号分隔）、SELECT...INTO（写操作）。
// 这是一道安全防线——即使 AI 误传写操作，也不会执行。
func IsReadOnlyQuery(sql string) bool {
	if sql == "" {
		return false
	}
	s := strings.TrimSpace(sql)
	upper := strings.ToUpper(s)

	// 拒绝多语句（允许末尾单个分号）
	semiCount := strings.Count(upper, ";")
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

// IsDMLStatement 检查 SQL 是否为 DML（INSERT/UPDATE/DELETE/MERGE）。
// 拒绝所有 DDL（CREATE/DROP/ALTER/TRUNCATE/RENAME/GRANT/REVOKE）。
// 拒绝多语句（防止 "INSERT ...; DROP TABLE ..." 注入）。
func IsDMLStatement(sql string) bool {
	if sql == "" {
		return false
	}

	// 安全检查：拒绝多语句（防止 SQL 注入）
	upper := strings.ToUpper(strings.TrimSpace(sql))
	semiCount := strings.Count(upper, ";")
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

	// MERGE INTO / DELETE FROM / INSERT INTO / UPDATE table
	switch first {
	case "INSERT", "UPDATE", "DELETE", "MERGE":
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
func IsDDLStatement(sql string) bool {
	if sql == "" {
		return false
	}
	s := strings.TrimSpace(strings.ToUpper(sql))
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return false
	}
	switch fields[0] {
	case "CREATE", "DROP", "ALTER", "TRUNCATE", "RENAME":
		return true
	}
	return false
}
