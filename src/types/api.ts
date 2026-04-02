export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'oracle' | 'mariadb' | 'dameng';

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
}

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_key?: string;
  column_default?: string;
  extra?: string;
  comment?: string;
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rows_affected?: number;
  error?: string;
}

export interface DatabaseObject {
  type: 'table' | 'view' | 'procedure' | 'function' | 'trigger';
  name: string;
  schema?: string;
  comment?: string;
}
