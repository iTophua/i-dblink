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

export const api = {
  async testConnection(
    dbType: string,
    host: string,
    port: number,
    username: string,
    password: string
  ): Promise<boolean> {
    return await invoke('test_connection', {
      dbType,
      host,
      port,
      username,
      password,
    });
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

  async getTables(connectionId: string): Promise<TableInfo[]> {
    return await invoke('get_tables', { connectionId });
  },

  async getColumns(connectionId: string, tableName: string): Promise<ColumnInfo[]> {
    return await invoke('get_columns', { connectionId, tableName });
  },

  async executeQuery(connectionId: string, sql: string): Promise<QueryResult> {
    return await invoke('execute_query', { connectionId, sql });
  },
};
