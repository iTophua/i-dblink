package localdb

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// AppConfigRepository app_config 表：按 key 存一段文本。
// 放的是后端要在前端跑起来之前就用得到的东西——比如上次的主题：主题设置存在 webview 的
// localStorage 里，Go 读不到，由前端把结果写过来
type AppConfigRepository struct {
	db *sql.DB
}

// NewAppConfigRepository 创建应用配置仓库
func NewAppConfigRepository(db *sql.DB) *AppConfigRepository {
	return &AppConfigRepository{db: db}
}

// Get 取 key 对应的值；没有这一行时 found 为 false
func (r *AppConfigRepository) Get(key string) (value string, found bool, err error) {
	err = r.db.QueryRow(`SELECT value FROM app_config WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("failed to query app_config[%s]: %w", key, err)
	}
	return value, true, nil
}

// Set 写入键值（upsert）
func (r *AppConfigRepository) Set(key, value string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.db.Exec(
		`INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, now,
	)
	if err != nil {
		return fmt.Errorf("failed to set app_config[%s]: %w", key, err)
	}
	return nil
}
