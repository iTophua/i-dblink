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

// Check if running in Tauri environment
const isTauri =
  typeof window !== 'undefined' &&
  !!(window as Record<string, unknown>).__TAURI__;

// Safe invoke wrapper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeInvoke<T>(command: string, args?: Record<string, any>): Promise<T> {
  if (!isTauri) {
    throw new Error(`Tauri API not available: ${command}`);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
}

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
    database?: string,
    sshConfig?: {
      ssh_enabled?: boolean;
      ssh_host?: string;
      ssh_port?: number;
      ssh_username?: string;
      ssh_auth_method?: 'password' | 'key';
      ssh_password?: string;
      ssh_private_key_path?: string;
      ssh_passphrase?: string;
    },
    sslConfig?: {
      ssl_enabled?: boolean;
      ssl_ca_path?: string;
      ssl_cert_path?: string;
      ssl_key_path?: string;
      ssl_skip_verify?: boolean;
    }
  ): Promise<boolean> {
    return await safeInvoke('test_connection', {
      dbType,
      host,
      port,
      username,
      password,
      database,
      ...sshConfig,
      ...sslConfig,
    });
  },

  async connectConnection(connectionId: string): Promise<boolean> {
    return await safeInvoke('connect_database', { connectionId });
  },

  async disconnectConnection(connectionId: string): Promise<boolean> {
    return await safeInvoke('disconnect_database', { connectionId });
  },

  async getConnections(): Promise<ConnectionOutput[]> {
    return await safeInvoke('get_connections');
  },

  async saveConnection(input: ConnectionInput): Promise<ConnectionOutput> {
    return await safeInvoke('save_connection', { input });
  },

  async updateConnectionPassword(connectionId: string, password: string): Promise<void> {
    return await safeInvoke('update_connection_password', { connectionId, password });
  },

  async deleteConnection(id: string): Promise<void> {
    return await safeInvoke('delete_connection', { id });
  },

  async getGroups(): Promise<GroupOutput[]> {
    return await safeInvoke('get_groups');
  },

  async saveGroup(input: GroupInput): Promise<GroupOutput> {
    return await safeInvoke('save_group', { input });
  },

  async deleteGroup(id: string): Promise<void> {
    return await safeInvoke('delete_group', { id });
  },

  async getDatabases(connectionId: string): Promise<string[]> {
    return await safeInvoke('get_databases', { connectionId });
  },

  async getTables(connectionId: string, database?: string): Promise<TableInfo[]> {
    return await safeInvoke('get_tables', { connectionId, database });
  },

  async getTablesCategorized(
    connectionId: string,
    database?: string,
    search?: string
  ): Promise<TablesResult> {
    return await safeInvoke('get_tables_categorized', { connectionId, database, search });
  },

  async getTableStructure(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<TableStructure> {
    return await safeInvoke('get_table_structure', { connectionId, tableName, database });
  },

  async getColumns(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<ColumnInfo[]> {
    return await safeInvoke('get_columns', { connectionId, tableName, database });
  },

  async getIndexes(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<IndexInfo[]> {
    return await safeInvoke('get_indexes', { connectionId, tableName, database });
  },

  async getForeignKeys(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<ForeignKeyInfo[]> {
    return await safeInvoke('get_foreign_keys', { connectionId, tableName, database });
  },

  async getProcedures(connectionId: string, database?: string): Promise<string[]> {
    return await safeInvoke('get_procedures', { connectionId, database });
  },

  async getFunctions(connectionId: string, database?: string): Promise<string[]> {
    return await safeInvoke('get_functions', { connectionId, database });
  },

  async getProcedureBody(
    connectionId: string,
    procedureName: string,
    database?: string
  ): Promise<string> {
    return await safeInvoke('get_procedure_body', { connectionId, procedureName, database });
  },

  async getFunctionBody(
    connectionId: string,
    functionName: string,
    database?: string
  ): Promise<string> {
    return await safeInvoke('get_function_body', { connectionId, functionName, database });
  },

  async executeQuery(connectionId: string, sql: string, database?: string): Promise<QueryResult> {
    return await safeInvoke('execute_query', { connectionId, sql, database });
  },

  async executeDDL(connectionId: string, sql: string, database?: string): Promise<void> {
    return await safeInvoke('execute_ddl', { connectionId, sql, database });
  },

  async truncateTable(connectionId: string, tableName: string, database?: string): Promise<void> {
    return await safeInvoke('truncate_table', { connectionId, tableName, database });
  },

  async dropTable(connectionId: string, tableName: string, database?: string): Promise<void> {
    return await safeInvoke('drop_table', { connectionId, tableName, database });
  },

  async dropView(connectionId: string, viewName: string, database?: string): Promise<void> {
    return await safeInvoke('drop_view', { connectionId, viewName, database });
  },

  async renameTable(
    connectionId: string,
    oldName: string,
    newName: string,
    database?: string
  ): Promise<void> {
    return await safeInvoke('rename_table', { connectionId, oldName, newName, database });
  },

  async maintainTable(
    connectionId: string,
    tableName: string,
    operation: string,
    database?: string
  ): Promise<void> {
    return await safeInvoke('maintain_table', { connectionId, tableName, operation, database });
  },

  async beginTransaction(connectionId: string): Promise<void> {
    return await safeInvoke('begin_transaction', { connectionId });
  },

  async commitTransaction(connectionId: string): Promise<void> {
    return await safeInvoke('commit_transaction', { connectionId });
  },

  async rollbackTransaction(connectionId: string): Promise<void> {
    return await safeInvoke('rollback_transaction', { connectionId });
  },

  async getTransactionStatus(connectionId: string): Promise<boolean> {
    return await safeInvoke('get_transaction_status', { connectionId });
  },

  async getServerInfo(
    connectionId: string,
    database?: string
  ): Promise<{
    version?: string;
    server_type?: string;
    character_set?: string;
    collation?: string;
    uptime?: string;
    max_connections?: number;
  }> {
    return await safeInvoke('get_server_info', { connectionId, database });
  },

  async getTableDDL(connectionId: string, tableName: string, database?: string): Promise<string[]> {
    return await safeInvoke('get_table_ddl', { connectionId, table_name: tableName, database });
  },

  async getTriggers(connectionId: string, database?: string): Promise<any[]> {
    return await safeInvoke('get_triggers', { connectionId, database });
  },

  async getEvents(connectionId: string, database?: string): Promise<any[]> {
    return await safeInvoke('get_events', { connectionId, database });
  },

  async saveSnippet(params: {
    id?: string;
    name: string;
    sql_text: string;
    db_type?: string;
    category?: string;
    tags?: string;
    is_private?: boolean;
  }): Promise<string> {
    return await safeInvoke('save_snippet', {
      id: params.id,
      name: params.name,
      sql_text: params.sql_text,
      db_type: params.db_type,
      category: params.category,
      tags: params.tags,
      is_private: params.is_private || false,
    });
  },

  async getSnippets(): Promise<any[]> {
    return await safeInvoke('get_snippets');
  },

  async deleteSnippet(id: string): Promise<void> {
    return await safeInvoke('delete_snippet', { id });
  },

  async streamExportTable(
    connectionId: string,
    tableName: string,
    database?: string,
    batchSize?: number
  ): Promise<any> {
    const result = await safeInvoke('stream_export_table', {
      connectionId,
      tableName,
      database,
      batchSize: batchSize || 1000,
    });
    return result;
  },

  async checkBackupTool(
    dbType: string
  ): Promise<{ available: boolean; path?: string; error?: string }> {
    return await safeInvoke('check_backup_tool', { dbType });
  },

  async backup(params: {
    connectionId: string;
    database: string;
    tables?: string[];
    includeStructure: boolean;
    includeData: boolean;
    filePath: string;
  }): Promise<{ file_path?: string; error?: string }> {
    return await safeInvoke('backup_database', params);
  },

  async restore(params: {
    connectionId: string;
    database: string;
    filePath: string;
  }): Promise<{ error?: string }> {
    return await safeInvoke('restore_database', params);
  },

  async getUsers(connectionId: string, database?: string): Promise<any> {
    return await safeInvoke('get_users', { connectionId, database });
  },

  async getUserPrivileges(
    connectionId: string,
    username: string,
    host: string,
    database?: string
  ): Promise<any> {
    return await safeInvoke('get_user_privileges', {
      connectionId,
      username,
      host,
      database,
    });
  },

  async getTablePrivileges(
    connectionId: string,
    username: string,
    host: string,
    database?: string
  ): Promise<any[]> {
    return await safeInvoke('get_table_privileges', {
      connectionId,
      username,
      host,
      database,
    });
  },

  async createUser(params: {
    connectionId: string;
    username: string;
    password: string;
    host: string;
    database?: string;
  }): Promise<void> {
    return await safeInvoke('create_user', params);
  },

  async dropUser(params: {
    connectionId: string;
    username: string;
    host: string;
    database?: string;
  }): Promise<void> {
    return await safeInvoke('drop_user', params);
  },

  async grantPrivilege(params: {
    connectionId: string;
    username: string;
    host: string;
    privileges: string[];
    databaseAll: boolean;
    database?: string;
    table?: string;
  }): Promise<void> {
    return await safeInvoke('grant_privilege', params);
  },

  async revokePrivilege(params: {
    connectionId: string;
    username: string;
    host: string;
    privileges: string[];
    databaseAll: boolean;
    database?: string;
    table?: string;
  }): Promise<void> {
    return await safeInvoke('revoke_privilege', params);
  },

  async compareSchema(params: {
    sourceConnectionId: string;
    sourceDatabase: string;
    targetConnectionId: string;
    targetDatabase: string;
    tableName?: string;
  }): Promise<any> {
    return await safeInvoke('compare_schema', params);
  },

  async batchImport(params: {
    connectionId: string;
    database?: string;
    tableName: string;
    mode: 'append' | 'replace' | 'update';
    primaryKey?: string;
    rows: Record<string, any>[];
  }): Promise<{
    success_count: number;
    failed_count: number;
    total_count: number;
    last_error?: string;
  }> {
    return await safeInvoke('batch_import', params);
  },

  async quitApp(): Promise<void> {
    return await safeInvoke('quit_app');
  },
};
