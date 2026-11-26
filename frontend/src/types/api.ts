export type DatabaseType =
  | 'mysql'
  | 'postgresql'
  | 'sqlite'
  | 'sqlserver'
  | 'oracle'
  | 'mariadb'
  | 'dameng'
  | 'kingbase'
  | 'highgo'
  | 'vastbase'
  | 'clickhouse'
  | 'tdengine';

export type ConnectionStatus = 'connected' | 'disconnected' | 'loading';

export interface ConnectionInput {
  id?: string;
  name: string;
  db_type: DatabaseType;
  host: string;
  port: number;
  username: string;
  password?: string;
  database?: string;
  group_id?: string;
  color?: string;
  // SSH 隧道配置
  ssh_enabled?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_auth_method?: 'password' | 'key';
  ssh_password?: string;
  ssh_private_key_path?: string;
  ssh_passphrase?: string;
  // SSL/TLS 配置
  ssl_enabled?: boolean;
  ssl_ca_path?: string;
  ssl_cert_path?: string;
  ssl_key_path?: string;
  ssl_skip_verify?: boolean;
}

export interface ConnectionOutput {
  id: string;
  name: string;
  db_type: DatabaseType;
  host: string;
  port: number;
  username: string;
  database?: string;
  group_id?: string;
  status: ConnectionStatus;
  color?: string;
  /** SSH/SSL 非机密配置（编辑对话框回显用；机密凭据不随连接返回） */
  ssh_enabled?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_auth_method?: string;
  ssh_private_key_path?: string;
  ssl_enabled?: boolean;
  ssl_ca_path?: string;
  ssl_cert_path?: string;
  ssl_key_path?: string;
}

export interface GroupInput {
  id?: string;
  name: string;
  icon: string;
  color: string;
  parent_id?: string;
}

export interface GroupOutput {
  id: string;
  name: string;
  icon: string;
  color: string;
  parent_id?: string;
}

export interface TableInfo {
  table_name: string;
  table_type: string;
  schema?: string;
  row_count?: number;
  comment?: string;
  engine?: string;
  data_size?: string;
  index_size?: string;
  create_time?: string;
  update_time?: string;
  collation?: string;
}

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_key?: string;
  column_default?: string;
  extra?: string;
  comment?: string;
}

export interface IndexInfo {
  index_name: string;
  column_name: string;
  is_unique: boolean;
  is_primary: boolean;
  seq_in_index: number;
}

export interface ForeignKeyInfo {
  constraint_name: string;
  column_name: string;
  referenced_table: string;
  referenced_column: string;
}

export interface TriggerInfo {
  name: string;
  event: string;
  timing: string;
  table: string;
}

export interface SequenceInfo {
  sequence_name: string;
  data_type: string;
  start_value: string;
  minimum_value: string;
  maximum_value: string;
  increment: string;
  cycle_option: string;
}

export interface CheckConstraintInfo {
  constraint_name: string;
  check_clause: string;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rows_affected?: number;
  error?: string;
  execution_time_ms?: number;
  /** 后端因 maxRows 提前停止扫描：还有更多行未返回 */
  truncated?: boolean;
}

/** 脚本批量执行结果（ExecuteScriptBatch）：逐语句结果，错误在对应条目的 error */
export interface ScriptResult {
  results: QueryResult[];
  cancelled?: boolean;
  total_time_ms?: number;
}

export interface DatabaseObject {
  type: 'table' | 'view' | 'procedure' | 'function' | 'trigger';
  name: string;
  schema?: string;
  comment?: string;
}

// ── AI 对话历史（backend/localdb.AIChatSession / AIChatMessage） ──

/** 对话会话：时间戳为 RFC3339 字符串（纳秒精度） */
export interface AIChatSession {
  id: string;
  title: string;
  connection_id?: string | null;
  context_json: string;
  created_at: string;
  updated_at: string;
}

/** 持久化的对话消息 */
export interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: string;
  error?: string;
  elapsed_ms?: number | null;
  attached_sql?: string;
}

/** 一次批量写入：upserts 按 id 插入或覆盖，deletes 按 id 删除 */
export interface AIChatMessageBatch {
  upserts: StoredChatMessage[];
  deletes: string[];
}

// ── ER 图（backend/models/er.go） ──

export interface ERColumn {
  name: string;
  data_type: string;
  nullable: boolean;
  is_pk: boolean;
  comment?: string;
}

/** ER 图里的表节点。id 在 PG 系下是 "schema.table"，其余是表名 */
export interface ERTable {
  id: string;
  name: string;
  schema?: string;
  comment: string;
  columns: ERColumn[];
}

/** 一条外键关系（复合外键按列拆成多条，seq 是列在约束里的顺序） */
export interface EREdge {
  name?: string;
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  seq: number;
}

export interface ERDiagram {
  tables: ERTable[];
  edges: EREdge[];
  warnings?: string[];
  /** 走了通用路径（逐表查外键，较慢） */
  slow_path?: boolean;
}

// ── 数据对比（backend/models/data_compare.go） ──

export interface DataCompareRequest {
  source_connection_id: string;
  source_database?: string;
  source_table: string;
  target_connection_id: string;
  target_database?: string;
  target_table: string;
  /** 匹配行用的键；留空用源表主键 */
  key_columns?: string[];
  /** 每侧最多读取的行数 */
  max_rows?: number;
  /** 生成的同步语句上限 */
  max_statements?: number;
}

/** 单元格的展示值（后端已转成文本并限长） */
export interface DataCompareCell {
  is_null: boolean;
  value: string;
}

export interface DataCompareRow {
  key: Record<string, DataCompareCell>;
  /** 仅在源表的行带整行内容 */
  row?: Record<string, DataCompareCell>;
}

export interface DataCompareChange {
  column: string;
  source: DataCompareCell;
  target: DataCompareCell;
}

export interface DataCompareModified {
  key: Record<string, DataCompareCell>;
  changes: DataCompareChange[];
}

export interface DataCompareResult {
  key_columns: string[];
  compare_columns: string[];
  source_only_columns: string[];
  target_only_columns: string[];
  source_rows: number;
  target_rows: number;
  same_count: number;
  modified_count: number;
  source_only_count: number;
  target_only_count: number;
  /** 任一侧超过行数上限提前停止：上面的数字只是已读取部分的 */
  truncated: boolean;
  warnings: string[];
  modified: DataCompareModified[];
  source_only: DataCompareRow[];
  target_only: DataCompareRow[];
  /** 同步 SQL：把目标表改成和源表一致。只生成，不执行 */
  sql: string;
  sql_counts: { update: number; insert: number; delete: number };
  sql_truncated: boolean;
}
