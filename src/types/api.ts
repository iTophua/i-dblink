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
  | 'vastbase';

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

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rows_affected?: number;
  error?: string;
}

export interface DatabaseObject {
  type: 'table' | 'view' | 'procedure' | 'function' | 'trigger';
  name: string;
  schema?: string;
  comment?: string;
}
