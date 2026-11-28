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
