package localdb

import (
	"database/sql"
	"fmt"
)

// RunMigrations 运行数据库迁移
func RunMigrations(db *sql.DB) error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS connections (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			db_type TEXT NOT NULL,
			host TEXT NOT NULL,
			port INTEGER NOT NULL,
			username TEXT NOT NULL,
			database TEXT,
			group_id TEXT,
			color TEXT,
			ssh_host TEXT,
			ssh_port TEXT,
			ssh_username TEXT,
			ssh_auth_method TEXT,
			ssh_private_key_path TEXT,
			ssl_enabled TEXT,
			ssl_ca_path TEXT,
			ssl_cert_path TEXT,
			ssl_key_path TEXT,
			ssl_skip_verify TEXT,
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS connection_groups (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			icon TEXT NOT NULL,
			color TEXT NOT NULL,
			parent_id TEXT,
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS connection_passwords (
			connection_id TEXT PRIMARY KEY,
			password TEXT NOT NULL,
			FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS connection_ssh_credentials (
			connection_id TEXT PRIMARY KEY,
			ssh_password TEXT NOT NULL,
			ssh_passphrase TEXT NOT NULL,
			FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS snippets (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			sql_text TEXT NOT NULL,
			db_type TEXT,
			category TEXT DEFAULT '通用',
			tags TEXT,
			is_private BOOLEAN DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS connection_history (
			id TEXT PRIMARY KEY,
			connection_id TEXT NOT NULL,
			action TEXT NOT NULL,
			success BOOLEAN NOT NULL,
			error_message TEXT,
			created_at TEXT NOT NULL,
			FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS app_config (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_connections_group_id ON connections(group_id)`,
		`CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name)`,
		`CREATE INDEX IF NOT EXISTS idx_connection_groups_sort_name ON connection_groups(sort_order, name)`,
		`CREATE INDEX IF NOT EXISTS idx_snippets_category ON snippets(category)`,
		`CREATE INDEX IF NOT EXISTS idx_snippets_db_type ON snippets(db_type)`,
		`INSERT OR IGNORE INTO connection_groups (id, name, icon, color, parent_id, sort_order, created_at, updated_at)
		 VALUES ('default', '未分组', '📁', '#6d6d6d', NULL, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
		`CREATE TABLE IF NOT EXISTS favorites (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL DEFAULT 'table',
			name TEXT NOT NULL,
			connection_id TEXT,
			database TEXT,
			table_name TEXT,
			sql_text TEXT,
			tags TEXT DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_favorites_type ON favorites(type)`,
		`CREATE INDEX IF NOT EXISTS idx_favorites_connection_id ON favorites(connection_id)`,
		// AI 配置（键值对，敏感值如 api_key 为 AES-256-GCM 密文）
		`CREATE TABLE IF NOT EXISTS ai_config (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		// AI 对话历史：会话（标题 + 发问时的上下文）与消息。connection_id 不设外键——
		// 连接被删除后对话仍保留；消息随会话在仓库层显式删除（SQLite 默认不开外键级联）
		`CREATE TABLE IF NOT EXISTS ai_chat_sessions (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL DEFAULT '',
			connection_id TEXT,
			context_json TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_updated ON ai_chat_sessions(updated_at)`,
		`CREATE TABLE IF NOT EXISTS ai_chat_messages (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			seq INTEGER NOT NULL,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			status TEXT,
			error TEXT,
			elapsed_ms INTEGER,
			attached_sql TEXT,
			created_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session ON ai_chat_messages(session_id, seq)`,
	}

	for i, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			return fmt.Errorf("migration %d failed: %w (sql: %s)", i, err, migration)
		}
	}

	db.Exec("ALTER TABLE connections ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")

	return nil
}
