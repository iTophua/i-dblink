package api

import "fmt"

// BuildExplainSQL 按方言生成执行计划查询语句。
// 前端编辑器的 EXPLAIN 按钮（方言 dialect.buildExplainQuery）、MCP explain_query
// 与 AI SQL 优化的上下文收集共用同一套方言映射；不支持的类型返回错误，
// 调用方降级为"无执行计划"继续（AI 仍可基于 SQL 文本给建议）。
func BuildExplainSQL(dbType, sql string) (string, error) {
	switch dbType {
	case "mysql", "mariadb", "postgresql", "kingbase", "highgo", "vastbase", "clickhouse":
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
