package api

import (
	"database/sql"
	"fmt"
	"strings"
)

// nullStr 将 sql.NullString 转为 *string
func nullStr(s sql.NullString) *string {
	if s.Valid && s.String != "" {
		return &s.String
	}
	return nil
}

// nullStrEmpty 将 sql.NullString 转为 *string（空字符串也保留）
func nullStrEmpty(s sql.NullString) *string {
	if s.Valid {
		return &s.String
	}
	return nil
}

// nullInt64ToUInt64 将 sql.NullInt64 转为 *uint64
func nullInt64ToUInt64(s sql.NullInt64) *uint64 {
	if s.Valid {
		v := uint64(s.Int64)
		return &v
	}
	return nil
}

// strPtr 将 string 转为 *string（空字符串返回 nil）
func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// splitQualifiedTableName 把「限定部分.表名」拆成两段（MySQL 的库、PG 系 / SQL Server 的
// schema）。只认恰好一个点、且两段都非空的名字；其余名字原样返回、限定部分为空——
// 三段的名字（SQL Server 的 库.schema.表）和名字里本来带点的表都不在这里拆
func splitQualifiedTableName(name string) (qualifier string, table string) {
	dot := strings.IndexByte(name, '.')
	if dot <= 0 || dot == len(name)-1 || strings.ContainsRune(name[dot+1:], '.') {
		return "", name
	}
	return name[:dot], name[dot+1:]
}

// supportsTableQualifier 哪些库会把表名里的「限定部分.」当真去定位。
// 其余库一律按原名查：它们的名字里带点多半就是表名本身
func supportsTableQualifier(dbType string) bool {
	switch dbType {
	case "mysql", "postgresql", "kingbase", "highgo", "vastbase", "sqlserver":
		return true
	}
	return false
}

// schemaQualifiedType 限定部分是 schema 的库（PG 系、SQL Server）。库名不能当限定符拼进
// 表引用：PG 里没有「库.表」这种写法，拼上去只会报 schema 不存在；配上 IF EXISTS 就是
// 什么都没删却提示成功
func schemaQualifiedType(dbType string) bool {
	switch dbType {
	case "postgresql", "kingbase", "highgo", "vastbase", "sqlserver":
		return true
	}
	return false
}

// tableQualifier 把请求里的表名定成「表名 + 限定部分」：
//   - MySQL 系 / PG 系 / SQL Server：名字里带「限定部分.表名」就以它为准（MySQL 是库，
//     其余是 schema）；PG 系 / SQL Server 没带时用请求里的 schema
//   - 其余库：不拆，限定部分为空（名字里带点多半是表名本身）
func tableQualifier(dbType, tableName string, reqSchema *string) (table, qualifier string) {
	if !supportsTableQualifier(dbType) {
		return tableName, ""
	}
	if qualifier, table = splitQualifiedTableName(tableName); qualifier != "" {
		return table, qualifier
	}
	if schemaQualifiedType(dbType) && reqSchema != nil {
		return tableName, *reqSchema
	}
	return tableName, ""
}

// databaseAsQualifier 拿库名当表引用的限定部分：PG 系 / SQL Server 不行（它们只认 schema），
// 其余库照旧
func databaseAsQualifier(dbType, database string) string {
	if schemaQualifiedType(dbType) {
		return ""
	}
	return database
}

// mysqlDatabaseArg MySQL 的元数据查询按库过滤：表名带「库.表」时用那个库，否则用请求里的库
func mysqlDatabaseArg(reqDatabase *string, qualifier string) *string {
	if qualifier != "" {
		return &qualifier
	}
	return reqDatabase
}

// formatBytes 将字节数格式化为人类可读字符串
func formatBytes(bytes sql.NullInt64) *string {
	if !bytes.Valid {
		return nil
	}
	b := float64(bytes.Int64)
	if b < 0 {
		return nil
	}

	const (
		KB = 1024.0
		MB = KB * 1024.0
		GB = MB * 1024.0
		TB = GB * 1024.0
	)

	var s string
	switch {
	case b >= TB:
		s = fmt.Sprintf("%.2f TB", b/TB)
	case b >= GB:
		s = fmt.Sprintf("%.2f GB", b/GB)
	case b >= MB:
		s = fmt.Sprintf("%.2f MB", b/MB)
	default:
		s = fmt.Sprintf("%.2f KB", b/KB)
	}
	return &s
}
