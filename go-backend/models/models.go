package models

// TableInfo 表信息
type TableInfo struct {
	TableName  string  `json:"table_name"`
	TableType  string  `json:"table_type"`
	RowCount   *uint64 `json:"row_count,omitempty"`
	Comment    *string `json:"comment,omitempty"`
	Engine     *string `json:"engine,omitempty"`
	DataSize   *string `json:"data_size,omitempty"`
	IndexSize  *string `json:"index_size,omitempty"`
	CreateTime *string `json:"create_time,omitempty"`
	UpdateTime *string `json:"update_time,omitempty"`
	Collation  *string `json:"collation,omitempty"`
}

// ColumnInfo 列信息
type ColumnInfo struct {
	ColumnName    string  `json:"column_name"`
	DataType      string  `json:"data_type"`
	IsNullable    string  `json:"is_nullable"`
	ColumnKey     *string `json:"column_key,omitempty"`
	ColumnDefault *string `json:"column_default,omitempty"`
	Extra         *string `json:"extra,omitempty"`
	Comment       *string `json:"comment,omitempty"`
}

// IndexInfo 索引信息
type IndexInfo struct {
	IndexName  string `json:"index_name"`
	ColumnName string `json:"column_name"`
	IsUnique   bool   `json:"is_unique"`
	IsPrimary  bool   `json:"is_primary"`
	SeqInIndex int64  `json:"seq_in_index"`
}

// ForeignKeyInfo 外键信息
type ForeignKeyInfo struct {
	ConstraintName   string `json:"constraint_name"`
	ColumnName       string `json:"column_name"`
	ReferencedTable  string `json:"referenced_table"`
	ReferencedColumn string `json:"referenced_column"`
}

// QueryResult SQL 查询结果
type QueryResult struct {
	Columns      []string        `json:"columns,omitempty"`
	Rows         [][]interface{} `json:"rows,omitempty"`
	RowsAffected *uint64         `json:"rows_affected,omitempty"`
	Error        string          `json:"error,omitempty"`
}

// TablesResult 分类表和视图
type TablesResult struct {
	Tables []TableInfo `json:"tables"`
	Views  []TableInfo `json:"views"`
}

// TableStructure 完整表结构
type TableStructure struct {
	Columns     []ColumnInfo     `json:"columns"`
	Indexes     []IndexInfo      `json:"indexes"`
	ForeignKeys []ForeignKeyInfo `json:"foreign_keys"`
	Error       string           `json:"error,omitempty"`
}

// RoutineInfo 存储过程/函数信息
type RoutineInfo struct {
	RoutineName string  `json:"routine_name"`
	RoutineType string  `json:"routine_type"`
	Definition  *string `json:"definition,omitempty"`
	Comment     *string `json:"comment,omitempty"`
}

// RoutinesResult 路由列表结果
type RoutinesResult struct {
	Procedures []RoutineInfo `json:"procedures"`
	Functions  []RoutineInfo `json:"functions"`
}

// ConnectRequest 连接请求
type ConnectRequest struct {
	ConnectionID       string `json:"connection_id"`
	DbType             string `json:"db_type"`
	Host               string `json:"host"`
	Port               int    `json:"port"`
	Username           string `json:"username"`
	Password           string `json:"password"`
	Database           string `json:"database,omitempty"`
	SSHEnabled         bool   `json:"ssh_enabled"`
	SSHHost            string `json:"ssh_host,omitempty"`
	SSHPort            int    `json:"ssh_port,omitempty"`
	SSHUsername        string `json:"ssh_username,omitempty"`
	SSHAuthMethod      string `json:"ssh_auth_method,omitempty"` // "password" | "key"
	SSHPassword        string `json:"ssh_password,omitempty"`
	SSHPrivateKeyPath  string `json:"ssh_private_key_path,omitempty"`
	SSHPassphrase      string `json:"ssh_passphrase,omitempty"`
	SSLEnabled         bool   `json:"ssl_enabled"`
	SSLCAPath          string `json:"ssl_ca_path,omitempty"`
	SSLCertPath        string `json:"ssl_cert_path,omitempty"`
	SSLKeyPath         string `json:"ssl_key_path,omitempty"`
	SSLSkipVerify      bool   `json:"ssl_skip_verify"`
}

// ConnectResponse 连接响应
type ConnectResponse struct {
	ConnectionID string `json:"connection_id"`
	Error        string `json:"error,omitempty"`
}

// DisconnectRequest 断开请求
type DisconnectRequest struct {
	ConnectionID string `json:"connection_id"`
}

// GenericResponse 通用响应
type GenericResponse struct {
	Error string `json:"error,omitempty"`
}

// QueryRequest 查询请求
type QueryRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	SQL          string `json:"sql"`
}

// MetadataRequest 元数据请求
type MetadataRequest struct {
	ConnectionID string  `json:"connection_id"`
	Database     *string `json:"database,omitempty"`
	TableName    *string `json:"table_name,omitempty"`
	Search       *string `json:"search,omitempty"`
}

// TriggerInfo 触发器信息
type TriggerInfo struct {
	TriggerName string  `json:"trigger_name"`
	Event       string  `json:"event"`
	Table       string  `json:"table"`
	Timing      string  `json:"timing"`
	Definition  *string `json:"definition,omitempty"`
}

// EventInfo 事件信息
type EventInfo struct {
	EventName string  `json:"event_name"`
	Schedule  string  `json:"schedule"`
	Status    string  `json:"status"`
	Definition *string `json:"definition,omitempty"`
}

// SaveSnippetRequest 保存代码片段请求
type SaveSnippetRequest struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	SQLText   string `json:"sql_text"`
	DBType    string `json:"db_type"`
	Category  string `json:"category"`
	Tags      string `json:"tags"`
	IsPrivate bool   `json:"is_private"`
	UserID    string `json:"user_id"`
}

// GetSnippetsRequest 获取代码片段请求
type GetSnippetsRequest struct {
	Category string `json:"category"`
	DBType   string `json:"db_type"`
	UserID   string `json:"user_id"`
}

// DeleteSnippetRequest 删除代码片段请求
type DeleteSnippetRequest struct {
	ID string `json:"id"`
}

// GetSnippetsResponse 获取代码片段响应
type GetSnippetsResponse struct {
	Snippets []Snippet `json:"snippets"`
}

// Snippet 代码片段模型
type Snippet struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	SQLText   string `json:"sql_text"`
	DBType    string `json:"db_type"`
	Category  string `json:"category"`
	Tags      string `json:"tags"`
	IsPrivate bool   `json:"is_private"`
	UserID    string `json:"user_id"`
}

// StreamExportRequest 流式导出请求
type StreamExportRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	TableName    string `json:"table_name"`
	BatchSize    int    `json:"batch_size"`
}

// ExecuteDDLRequest DDL 执行请求
type ExecuteDDLRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	SQL          string `json:"sql"`
}

// TableOperationRequest 表操作请求(truncate/drop 等)
type TableOperationRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	TableName    string `json:"table_name"`
	ViewName     string `json:"view_name,omitempty"`
}

// RenameTableRequest 重命名表请求
type RenameTableRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	OldName      string `json:"old_name"`
	NewName      string `json:"new_name"`
}

// TableMaintenanceRequest 表维护请求
type TableMaintenanceRequest struct {
	ConnectionID string `json:"connection_id"`
	Database     string `json:"database,omitempty"`
	TableName    string `json:"table_name"`
	Operation    string `json:"operation"` // optimize / analyze / repair
}

// BatchImportRequest 批量导入请求
type BatchImportRequest struct {
	ConnectionID string                   `json:"connection_id"`
	Database     string                   `json:"database,omitempty"`
	TableName    string                   `json:"table_name"`
	Mode         string                   `json:"mode"` // append / replace / update
	PrimaryKey   string                   `json:"primary_key,omitempty"`
	Rows         []map[string]interface{} `json:"rows"`
}

// BatchImportResponse 批量导入响应
type BatchImportResponse struct {
	SuccessCount int    `json:"success_count"`
	FailedCount  int    `json:"failed_count"`
	TotalCount   int    `json:"total_count"`
	LastError    string `json:"last_error,omitempty"`
}
