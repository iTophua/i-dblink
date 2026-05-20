package localdb

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ConnectionRepository 连接配置仓库
type ConnectionRepository struct {
	db *sql.DB
}

// NewConnectionRepository 创建连接仓库
func NewConnectionRepository(db *sql.DB) *ConnectionRepository {
	return &ConnectionRepository{db: db}
}

// GetAll 获取所有连接配置
func (r *ConnectionRepository) GetAll() ([]*DbConnection, error) {
	rows, err := r.db.Query(`
		SELECT id, name, db_type, host, port, username, database, group_id, color,
		       ssh_host, ssh_port, ssh_username, ssh_auth_method, ssh_private_key_path,
		       ssl_enabled, ssl_ca_path, ssl_cert_path, ssl_key_path, ssl_skip_verify,
		       created_at, updated_at
		FROM connections
		ORDER BY name
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query connections: %w", err)
	}
	defer rows.Close()

	var connections []*DbConnection
	for rows.Next() {
		conn, err := scanConnection(rows)
		if err != nil {
			return nil, err
		}
		connections = append(connections, conn)
	}

	return connections, rows.Err()
}

// GetByID 根据ID获取连接配置
func (r *ConnectionRepository) GetByID(id string) (*DbConnection, error) {
	row := r.db.QueryRow(`
		SELECT id, name, db_type, host, port, username, database, group_id, color,
		       ssh_host, ssh_port, ssh_username, ssh_auth_method, ssh_private_key_path,
		       ssl_enabled, ssl_ca_path, ssl_cert_path, ssl_key_path, ssl_skip_verify,
		       created_at, updated_at
		FROM connections WHERE id = ?
	`, id)

	return scanConnection(row)
}

// Save 保存连接配置（INSERT 或 UPDATE）
func (r *ConnectionRepository) Save(conn *DbConnection) error {
	now := time.Now().UTC()
	conn.UpdatedAt = now

	if conn.ID == "" {
		conn.ID = uuid.New().String()
		conn.CreatedAt = now
		return r.insert(conn)
	}

	existing, err := r.GetByID(conn.ID)
	if err != nil {
		return err
	}
	if existing == nil {
		conn.CreatedAt = now
		return r.insert(conn)
	}

	conn.CreatedAt = existing.CreatedAt
	return r.update(conn)
}

func (r *ConnectionRepository) insert(conn *DbConnection) error {
	_, err := r.db.Exec(`
		INSERT INTO connections (
			id, name, db_type, host, port, username, database, group_id, color,
			ssh_host, ssh_port, ssh_username, ssh_auth_method, ssh_private_key_path,
			ssl_enabled, ssl_ca_path, ssl_cert_path, ssl_key_path, ssl_skip_verify,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		conn.ID, conn.Name, conn.DbType, conn.Host, conn.Port, conn.Username,
		conn.Database, conn.GroupID, conn.Color,
		conn.SSHHost, conn.SSHPort, conn.SSHUsername, conn.SSHAuthMethod, conn.SSHPrivateKeyPath,
		conn.SSLEnabled, conn.SSLCAPath, conn.SSLCertPath, conn.SSLKeyPath, conn.SSLSkipVerify,
		conn.CreatedAt.Format(time.RFC3339), conn.UpdatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("failed to insert connection: %w", err)
	}
	return nil
}

func (r *ConnectionRepository) update(conn *DbConnection) error {
	_, err := r.db.Exec(`
		UPDATE connections SET
			name = ?, db_type = ?, host = ?, port = ?, username = ?,
			database = ?, group_id = ?, color = ?,
			ssh_host = ?, ssh_port = ?, ssh_username = ?, ssh_auth_method = ?, ssh_private_key_path = ?,
			ssl_enabled = ?, ssl_ca_path = ?, ssl_cert_path = ?, ssl_key_path = ?, ssl_skip_verify = ?,
			updated_at = ?
		WHERE id = ?
	`,
		conn.Name, conn.DbType, conn.Host, conn.Port, conn.Username,
		conn.Database, conn.GroupID, conn.Color,
		conn.SSHHost, conn.SSHPort, conn.SSHUsername, conn.SSHAuthMethod, conn.SSHPrivateKeyPath,
		conn.SSLEnabled, conn.SSLCAPath, conn.SSLCertPath, conn.SSLKeyPath, conn.SSLSkipVerify,
		conn.UpdatedAt.Format(time.RFC3339), conn.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update connection: %w", err)
	}
	return nil
}

// Delete 删除连接配置
func (r *ConnectionRepository) Delete(id string) error {
	_, err := r.db.Exec("DELETE FROM connections WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete connection: %w", err)
	}
	return nil
}

// GetPassword 获取连接密码
func (r *ConnectionRepository) GetPassword(connectionID string) (string, error) {
	var password string
	err := r.db.QueryRow(
		"SELECT password FROM connection_passwords WHERE connection_id = ?",
		connectionID,
	).Scan(&password)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("failed to get password: %w", err)
	}
	return password, nil
}

// SavePassword 保存连接密码
func (r *ConnectionRepository) SavePassword(connectionID, password string) error {
	_, err := r.db.Exec(`
		INSERT INTO connection_passwords (connection_id, password)
		VALUES (?, ?)
		ON CONFLICT(connection_id) DO UPDATE SET password = excluded.password
	`, connectionID, password)
	if err != nil {
		return fmt.Errorf("failed to save password: %w", err)
	}
	return nil
}

// DeletePassword 删除连接密码
func (r *ConnectionRepository) DeletePassword(connectionID string) error {
	_, err := r.db.Exec(
		"DELETE FROM connection_passwords WHERE connection_id = ?",
		connectionID,
	)
	if err != nil {
		return fmt.Errorf("failed to delete password: %w", err)
	}
	return nil
}

// GroupRepository 连接分组仓库
type GroupRepository struct {
	db *sql.DB
}

// NewGroupRepository 创建分组仓库
func NewGroupRepository(db *sql.DB) *GroupRepository {
	return &GroupRepository{db: db}
}

// GetAll 获取所有连接分组
func (r *GroupRepository) GetAll() ([]*ConnectionGroup, error) {
	rows, err := r.db.Query(`
		SELECT id, name, icon, color, parent_id, sort_order, created_at, updated_at
		FROM connection_groups
		ORDER BY sort_order, name
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query groups: %w", err)
	}
	defer rows.Close()

	var groups []*ConnectionGroup
	for rows.Next() {
		group, err := scanGroup(rows)
		if err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}

	return groups, rows.Err()
}

// Save 保存连接分组（INSERT 或 UPDATE）
func (r *GroupRepository) Save(group *ConnectionGroup) error {
	now := time.Now().UTC()
	group.UpdatedAt = now

	if group.ID == "" {
		group.ID = uuid.New().String()
		group.CreatedAt = now
		return r.insertGroup(group)
	}

	existing := r.db.QueryRow("SELECT id FROM connection_groups WHERE id = ?", group.ID)
	var id string
	if err := existing.Scan(&id); err != nil {
		if err == sql.ErrNoRows {
			group.CreatedAt = now
			return r.insertGroup(group)
		}
		return fmt.Errorf("failed to check group existence: %w", err)
	}

	return r.updateGroup(group)
}

func (r *GroupRepository) insertGroup(group *ConnectionGroup) error {
	_, err := r.db.Exec(`
		INSERT INTO connection_groups (id, name, icon, color, parent_id, sort_order, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`,
		group.ID, group.Name, group.Icon, group.Color,
		group.ParentID, group.SortOrder,
		group.CreatedAt.Format(time.RFC3339), group.UpdatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("failed to insert group: %w", err)
	}
	return nil
}

func (r *GroupRepository) updateGroup(group *ConnectionGroup) error {
	_, err := r.db.Exec(`
		UPDATE connection_groups SET
			name = ?, icon = ?, color = ?, parent_id = ?, sort_order = ?, updated_at = ?
		WHERE id = ?
	`,
		group.Name, group.Icon, group.Color, group.ParentID, group.SortOrder,
		group.UpdatedAt.Format(time.RFC3339), group.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update group: %w", err)
	}
	return nil
}

// Delete 删除连接分组
func (r *GroupRepository) Delete(id string) error {
	if id == "default" {
		return fmt.Errorf("cannot delete default group")
	}

	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	_, err = tx.Exec("UPDATE connections SET group_id = 'default' WHERE group_id = ?", id)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to move connections to default group: %w", err)
	}

	_, err = tx.Exec("DELETE FROM connection_groups WHERE id = ?", id)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete group: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	return nil
}

// SnippetRepository 代码片段仓库
type SnippetRepository struct {
	db *sql.DB
}

// NewSnippetRepository 创建代码片段仓库
func NewSnippetRepository(db *sql.DB) *SnippetRepository {
	return &SnippetRepository{db: db}
}

// GetAll 获取所有代码片段
func (r *SnippetRepository) GetAll() ([]*Snippet, error) {
	rows, err := r.db.Query(`
		SELECT id, name, sql_text, db_type, category, tags, is_private, created_at, updated_at
		FROM snippets
		ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query snippets: %w", err)
	}
	defer rows.Close()

	var snippets []*Snippet
	for rows.Next() {
		snippet, err := scanSnippet(rows)
		if err != nil {
			return nil, err
		}
		snippets = append(snippets, snippet)
	}

	return snippets, rows.Err()
}

// Save 保存代码片段（INSERT 或 UPDATE）
func (r *SnippetRepository) Save(snippet *Snippet) error {
	now := time.Now().UTC()
	snippet.UpdatedAt = now

	if snippet.ID == "" {
		snippet.ID = uuid.New().String()
		snippet.CreatedAt = now
		return r.insertSnippet(snippet)
	}

	existing := r.db.QueryRow("SELECT id FROM snippets WHERE id = ?", snippet.ID)
	var id string
	if err := existing.Scan(&id); err != nil {
		if err == sql.ErrNoRows {
			snippet.CreatedAt = now
			return r.insertSnippet(snippet)
		}
		return fmt.Errorf("failed to check snippet existence: %w", err)
	}

	return r.updateSnippet(snippet)
}

func (r *SnippetRepository) insertSnippet(snippet *Snippet) error {
	_, err := r.db.Exec(`
		INSERT INTO snippets (id, name, sql_text, db_type, category, tags, is_private, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		snippet.ID, snippet.Name, snippet.SQLText, snippet.DbType,
		snippet.Category, snippet.Tags, snippet.IsPrivate,
		snippet.CreatedAt.Format(time.RFC3339), snippet.UpdatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("failed to insert snippet: %w", err)
	}
	return nil
}

func (r *SnippetRepository) updateSnippet(snippet *Snippet) error {
	_, err := r.db.Exec(`
		UPDATE snippets SET
			name = ?, sql_text = ?, db_type = ?, category = ?, tags = ?,
			is_private = ?, updated_at = ?
		WHERE id = ?
	`,
		snippet.Name, snippet.SQLText, snippet.DbType, snippet.Category,
		snippet.Tags, snippet.IsPrivate,
		snippet.UpdatedAt.Format(time.RFC3339), snippet.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update snippet: %w", err)
	}
	return nil
}

// Delete 删除代码片段
func (r *SnippetRepository) Delete(id string) error {
	_, err := r.db.Exec("DELETE FROM snippets WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete snippet: %w", err)
	}
	return nil
}

// 辅助函数：扫描连接配置
func scanConnection(scanner interface {
	Scan(dest ...interface{}) error
}) (*DbConnection, error) {
	var conn DbConnection
	var createdAt, updatedAt string

	err := scanner.Scan(
		&conn.ID, &conn.Name, &conn.DbType, &conn.Host, &conn.Port, &conn.Username,
		&conn.Database, &conn.GroupID, &conn.Color,
		&conn.SSHHost, &conn.SSHPort, &conn.SSHUsername, &conn.SSHAuthMethod, &conn.SSHPrivateKeyPath,
		&conn.SSLEnabled, &conn.SSLCAPath, &conn.SSLCertPath, &conn.SSLKeyPath, &conn.SSLSkipVerify,
		&createdAt, &updatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to scan connection: %w", err)
	}

	conn.CreatedAt, err = time.Parse(time.RFC3339, createdAt)
	if err != nil {
		return nil, fmt.Errorf("failed to parse created_at: %w", err)
	}
	conn.UpdatedAt, err = time.Parse(time.RFC3339, updatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to parse updated_at: %w", err)
	}

	return &conn, nil
}

// 辅助函数：扫描分组
func scanGroup(scanner interface {
	Scan(dest ...interface{}) error
}) (*ConnectionGroup, error) {
	var group ConnectionGroup
	var createdAt, updatedAt string

	err := scanner.Scan(
		&group.ID, &group.Name, &group.Icon, &group.Color,
		&group.ParentID, &group.SortOrder,
		&createdAt, &updatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to scan group: %w", err)
	}

	group.CreatedAt, err = time.Parse(time.RFC3339, createdAt)
	if err != nil {
		return nil, fmt.Errorf("failed to parse created_at: %w", err)
	}
	group.UpdatedAt, err = time.Parse(time.RFC3339, updatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to parse updated_at: %w", err)
	}

	return &group, nil
}

// 辅助函数：扫描代码片段
func scanSnippet(scanner interface {
	Scan(dest ...interface{}) error
}) (*Snippet, error) {
	var snippet Snippet
	var createdAt, updatedAt string

	err := scanner.Scan(
		&snippet.ID, &snippet.Name, &snippet.SQLText, &snippet.DbType,
		&snippet.Category, &snippet.Tags, &snippet.IsPrivate,
		&createdAt, &updatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to scan snippet: %w", err)
	}

	snippet.CreatedAt, err = time.Parse(time.RFC3339, createdAt)
	if err != nil {
		return nil, fmt.Errorf("failed to parse created_at: %w", err)
	}
	snippet.UpdatedAt, err = time.Parse(time.RFC3339, updatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to parse updated_at: %w", err)
	}

	return &snippet, nil
}
