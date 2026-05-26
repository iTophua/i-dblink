package localdb

import "time"

// DbConnection 数据库连接配置
type DbConnection struct {
	ID                string    `json:"id" db:"id"`
	Name              string    `json:"name" db:"name"`
	DbType            string    `json:"db_type" db:"db_type"`
	Host              string    `json:"host" db:"host"`
	Port              int       `json:"port" db:"port"`
	Username          string    `json:"username" db:"username"`
	Database          *string   `json:"database,omitempty" db:"database"`
	GroupID           *string   `json:"group_id,omitempty" db:"group_id"`
	Color             *string   `json:"color,omitempty" db:"color"`
	SSHHost           *string   `json:"ssh_host,omitempty" db:"ssh_host"`
	SSHPort           *string   `json:"ssh_port,omitempty" db:"ssh_port"`
	SSHUsername       *string   `json:"ssh_username,omitempty" db:"ssh_username"`
	SSHAuthMethod     *string   `json:"ssh_auth_method,omitempty" db:"ssh_auth_method"`
	SSHPrivateKeyPath *string   `json:"ssh_private_key_path,omitempty" db:"ssh_private_key_path"`
	SSLEnabled        *string   `json:"ssl_enabled,omitempty" db:"ssl_enabled"`
	SSLCAPath         *string   `json:"ssl_ca_path,omitempty" db:"ssl_ca_path"`
	SSLCertPath       *string   `json:"ssl_cert_path,omitempty" db:"ssl_cert_path"`
	SSLKeyPath        *string   `json:"ssl_key_path,omitempty" db:"ssl_key_path"`
	SSLSkipVerify     *string   `json:"ssl_skip_verify,omitempty" db:"ssl_skip_verify"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
}

// ConnectionGroup 连接分组
type ConnectionGroup struct {
	ID        string    `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Icon      string    `json:"icon" db:"icon"`
	Color     string    `json:"color" db:"color"`
	ParentID  *string   `json:"parent_id,omitempty" db:"parent_id"`
	SortOrder int       `json:"sort_order" db:"sort_order"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// Favorite 收藏项
type Favorite struct {
	ID           string    `json:"id" db:"id"`
	Type         string    `json:"type" db:"type"`
	Name         string    `json:"name" db:"name"`
	ConnectionID *string   `json:"connection_id,omitempty" db:"connection_id"`
	Database     *string   `json:"database,omitempty" db:"database"`
	TableName    *string   `json:"table_name,omitempty" db:"table_name"`
	SqlText      *string   `json:"sql_text,omitempty" db:"sql_text"`
	Tags         string    `json:"tags" db:"tags"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// Snippet 代码片段
type Snippet struct {
	ID        string    `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	SQLText   string    `json:"sql_text" db:"sql_text"`
	DbType    *string   `json:"db_type,omitempty" db:"db_type"`
	Category  *string   `json:"category,omitempty" db:"category"`
	Tags      *string   `json:"tags,omitempty" db:"tags"`
	IsPrivate bool      `json:"is_private" db:"is_private"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}
