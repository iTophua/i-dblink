import { invoke } from '@tauri-apps/api/core';
import type {
  ConnectionInput,
  ConnectionOutput,
  GroupInput,
  GroupOutput,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from '../types/api';

export interface TablesResult {
  tables: TableInfo[];
  views: TableInfo[];
}

export interface TableStructure {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreign_keys: ForeignKeyInfo[];
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

export const api = {
  async testConnection(
    dbType: string,
    host: string,
    port: number,
    username: string,
    password: string,
    database?: string
  ): Promise<boolean> {
    return await invoke('test_connection', {
      dbType,
      host,
      port,
      username,
      password,
      database,
    });
  },

  async connectConnection(connectionId: string): Promise<boolean> {
    return await invoke('connect_database', { connectionId });
  },

  async disconnectConnection(connectionId: string): Promise<boolean> {
    return await invoke('disconnect_database', { connectionId });
  },

  async getConnections(): Promise<ConnectionOutput[]> {
    return await invoke('get_connections');
  },

  async saveConnection(input: ConnectionInput): Promise<ConnectionOutput> {
    return await invoke('save_connection', { input });
  },

  async deleteConnection(id: string): Promise<void> {
    return await invoke('delete_connection', { id });
  },

  async getGroups(): Promise<GroupOutput[]> {
    return await invoke('get_groups');
  },

  async saveGroup(input: GroupInput): Promise<GroupOutput> {
    return await invoke('save_group', { input });
  },

  async deleteGroup(id: string): Promise<void> {
    return await invoke('delete_group', { id });
  },

  async getDatabases(connectionId: string): Promise<string[]> {
    return await invoke('get_databases', { connectionId });
  },

  async getTables(connectionId: string, database?: string): Promise<TableInfo[]> {
    return await invoke('get_tables', { connectionId, database });
  },

  async getTablesCategorized(connectionId: string, database?: string, search?: string): Promise<TablesResult> {
    return await invoke('get_tables_categorized', { connectionId, database, search });
  },

  async getTableStructure(connectionId: string, tableName: string, database?: string): Promise<TableStructure> {
    return await invoke('get_table_structure', { connectionId, tableName, database });
  },

  async getColumns(connectionId: string, tableName: string, database?: string): Promise<ColumnInfo[]> {
    return await invoke('get_columns', { connectionId, tableName, database });
  },

  async getIndexes(connectionId: string, tableName: string, database?: string): Promise<import('../types/api').IndexInfo[]> {
    return await invoke('get_indexes', { connectionId, tableName, database });
  },

  async getForeignKeys(connectionId: string, tableName: string, database?: string): Promise<import('../types/api').ForeignKeyInfo[]> {
    return await invoke('get_foreign_keys', { connectionId, tableName, database });
  },

  async executeQuery(connectionId: string, sql: string, database?: string): Promise<QueryResult> {
    return await invoke('execute_query', { connectionId, sql, database });
  },
};
