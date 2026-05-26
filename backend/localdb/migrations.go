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
	}

	for i, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			return fmt.Errorf("migration %d failed: %w", i, err)
		}
	}

	return nil
}
