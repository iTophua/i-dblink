import { invoke } from '@tauri-apps/api/core';
import type {
  ConnectionInput,
  ConnectionOutput,
  GroupInput,
  GroupOutput,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
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

  async updateConnectionPassword(connectionId: string, password: string): Promise<void> {
    return await invoke('update_connection_password', { connectionId, password });
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

  async getIndexes(connectionId: string, tableName: string, database?: string): Promise<IndexInfo[]> {
    return await invoke('get_indexes', { connectionId, tableName, database });
  },

  async getForeignKeys(connectionId: string, tableName: string, database?: string): Promise<ForeignKeyInfo[]> {
    return await invoke('get_foreign_keys', { connectionId, tableName, database });
  },

  async getProcedures(connectionId: string, database?: string): Promise<string[]> {
    return await invoke('get_procedures', { connectionId, database });
  },

  async getFunctions(connectionId: string, database?: string): Promise<string[]> {
    return await invoke('get_functions', { connectionId, database });
  },

  async getProcedureBody(connectionId: string, procedureName: string, database?: string): Promise<string> {
    return await invoke('get_procedure_body', { connectionId, procedureName, database });
  },

  async getFunctionBody(connectionId: string, functionName: string, database?: string): Promise<string> {
    return await invoke('get_function_body', { connectionId, functionName, database });
  },

  async executeQuery(connectionId: string, sql: string, database?: string): Promise<QueryResult> {
    return await invoke('execute_query', { connectionId, sql, database });
  },
};
