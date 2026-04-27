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
	ConnectionID string `json:"connection_id"`
	DbType       string `json:"db_type"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	Database     string `json:"database,omitempty"`
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
