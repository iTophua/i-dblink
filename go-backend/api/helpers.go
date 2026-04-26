package api

import (
	"database/sql"
	"fmt"
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
