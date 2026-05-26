import { EventsOn } from '../../wailsjs/runtime/runtime';
import {
  BackupDatabase,
  BatchImport,
  BeginTransaction,
  CheckBackupTool,
  ClearConnectionHistory,
  CommitTransaction,
  CompareSchema,
  ConnectDatabase,
  CreateUser,
  DeleteConnection,
  DeleteGroup,
  DeleteSnippet,
  DisconnectDatabase,
  DropTable,
  DropUser,
  DropView,
  ExecuteDDL,
  ExecuteQuery,
  GetAllColumns,
  GetColumns,
  GetConnectionHistory,
  GetConnections,
  GetDatabases,
  GetEvents,
  GetForeignKeys,
  GetFunctionBody,
  GetFunctions,
  GetGroups,
  GetIndexes,
  GetProcedureBody,
  GetProcedures,
  GetRoutines,
  GetServerInfo,
  GetSnippets,
  GetTableDDL,
  GetTablePrivileges,
  GetTables,
  GetTablesCategorized,
  GetTableStructure,
  GetTransactionStatus,
  GetTriggers,
  GetUserPrivileges,
  GetUsers,
  GrantPrivilege,
  MaintainTable,
  QuitApp,
  RenameTable,
  RestoreDatabase,
  RevokePrivilege,
  RollbackTransaction,
  SaveConnection,
  SaveGroup,
  SaveSnippet,
  StreamExportTable,
  TestConnection,
  TruncateTable,
  UpdateConnectionPassword,
} from '../../wailsjs/go/backend/App';
import { backend } from '../../wailsjs/go/models';
const ConnectionInput = backend.ConnectionInput;

import type {
  ConnectionOutput,
  GroupInput,
  GroupOutput,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
  QueryResult,
} from '../types/api';

export { EventsOn };
export { ConnectDatabase, DisconnectDatabase, UpdateConnectionPassword };

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
  ): Promise<void> {
    const input = new ConnectionInput({
      db_type: dbType,
      host,
      port,
      username,
      password,
      database,
      ssh_enabled: sshConfig?.ssh_enabled || false,
      ssh_host: sshConfig?.ssh_host,
      ssh_port: sshConfig?.ssh_port,
      ssh_username: sshConfig?.ssh_username,
      ssh_auth_method: sshConfig?.ssh_auth_method,
      ssh_password: sshConfig?.ssh_password,
      ssh_private_key_path: sshConfig?.ssh_private_key_path,
      ssh_passphrase: sshConfig?.ssh_passphrase,
      ssl_enabled: sslConfig?.ssl_enabled || false,
      ssl_ca_path: sslConfig?.ssl_ca_path,
      ssl_cert_path: sslConfig?.ssl_cert_path,
      ssl_key_path: sslConfig?.ssl_key_path,
      ssl_skip_verify: sslConfig?.ssl_skip_verify || false,
    });
    await TestConnection(input);
  },

  async connectConnection(connectionId: string): Promise<void> {
    await ConnectDatabase(connectionId);
  },

  async disconnectConnection(connectionId: string): Promise<void> {
    await DisconnectDatabase(connectionId);
  },

  async getConnections(): Promise<ConnectionOutput[]> {
    const result = await GetConnections();
    return result as unknown as ConnectionOutput[];
  },

  async saveConnection(input: {
    id?: string;
    name: string;
    db_type: string;
    host: string;
    port: number;
    username: string;
    password?: string;
    database?: string;
    group_id?: string;
    color?: string;
    ssh_enabled?: boolean;
    ssh_host?: string;
    ssh_port?: number;
    ssh_username?: string;
    ssh_auth_method?: string;
    ssh_password?: string;
    ssh_private_key_path?: string;
    ssh_passphrase?: string;
    ssl_enabled?: boolean;
    ssl_ca_path?: string;
    ssl_cert_path?: string;
    ssl_key_path?: string;
    ssl_skip_verify?: boolean;
  }): Promise<ConnectionOutput> {
    const connInput = new ConnectionInput({
      id: input.id,
      name: input.name,
      db_type: input.db_type,
      host: input.host,
      port: input.port,
      username: input.username,
      password: input.password,
      database: input.database,
      group_id: input.group_id,
      color: input.color,
      ssh_enabled: input.ssh_enabled || false,
      ssh_host: input.ssh_host,
      ssh_port: input.ssh_port,
      ssh_username: input.ssh_username,
      ssh_auth_method: input.ssh_auth_method,
      ssh_password: input.ssh_password,
      ssh_private_key_path: input.ssh_private_key_path,
      ssh_passphrase: input.ssh_passphrase,
      ssl_enabled: input.ssl_enabled || false,
      ssl_ca_path: input.ssl_ca_path,
      ssl_cert_path: input.ssl_cert_path,
      ssl_key_path: input.ssl_key_path,
      ssl_skip_verify: input.ssl_skip_verify || false,
    });
    const result = await SaveConnection(connInput);
    return result as unknown as ConnectionOutput;
  },

  async updateConnectionPassword(connectionId: string, password: string): Promise<void> {
    await UpdateConnectionPassword(connectionId, password);
  },

  async deleteConnection(id: string): Promise<void> {
    await DeleteConnection(id);
  },

  async getGroups(): Promise<GroupOutput[]> {
    const result = await GetGroups();
    return result as unknown as GroupOutput[];
  },

  async saveGroup(input: GroupInput): Promise<GroupOutput> {
    const result = await SaveGroup(input as any);
    return result as unknown as GroupOutput;
  },

  async deleteGroup(id: string): Promise<void> {
    await DeleteGroup(id);
  },

  async getDatabases(connectionId: string): Promise<string[]> {
    return await GetDatabases(connectionId);
  },

  async getTables(
    connectionId: string,
    database?: string
  ): Promise<TableInfo[]> {
    const result = await GetTables(connectionId, database ?? null);
    return result as unknown as TableInfo[];
  },

  async getTablesCategorized(
    connectionId: string,
    database?: string,
    search?: string
  ): Promise<TablesResult> {
    const result = await GetTablesCategorized(
      connectionId,
      database ?? null,
      search ?? null
    );
    return result as unknown as TablesResult;
  },

  async getTableStructure(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<TableStructure> {
    const result = await GetTableStructure(
      connectionId,
      tableName,
      database ?? null
    );
    return result as unknown as TableStructure;
  },

  async getColumns(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<ColumnInfo[]> {
    const result = await GetColumns(
      connectionId,
      tableName,
      database ?? null
    );
    return result as unknown as ColumnInfo[];
  },

  async getAllColumns(
    connectionId: string,
    database?: string
  ): Promise<Record<string, ColumnInfo[]>> {
    const result = await GetAllColumns(connectionId, database ?? null);
    return result.tables as unknown as Record<string, ColumnInfo[]>;
  },

  async getIndexes(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<IndexInfo[]> {
    const result = await GetIndexes(
      connectionId,
      tableName,
      database ?? null
    );
    return result as unknown as IndexInfo[];
  },

  async getForeignKeys(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<ForeignKeyInfo[]> {
    const result = await GetForeignKeys(
      connectionId,
      tableName,
      database ?? null
    );
    return result as unknown as ForeignKeyInfo[];
  },

  async getProcedures(connectionId: string, database?: string): Promise<string[]> {
    return await GetProcedures(connectionId, database ?? null);
  },

  async getFunctions(connectionId: string, database?: string): Promise<string[]> {
    return await GetFunctions(connectionId, database ?? null);
  },

  async getProcedureBody(
    connectionId: string,
    procedureName: string,
    database?: string
  ): Promise<string> {
    return await GetProcedureBody(
      connectionId,
      procedureName,
      database ?? null
    );
  },

  async getFunctionBody(
    connectionId: string,
    functionName: string,
    database?: string
  ): Promise<string> {
    return await GetFunctionBody(
      connectionId,
      functionName,
      database ?? null
    );
  },

  async executeQuery(
    connectionId: string,
    sql: string,
    database?: string
  ): Promise<QueryResult> {
    const result = await ExecuteQuery(connectionId, sql, database ?? null);
    return result as unknown as QueryResult;
  },

  async executeDDL(
    connectionId: string,
    sql: string,
    database?: string
  ): Promise<void> {
    await ExecuteDDL(connectionId, sql, database ?? null);
  },

  async truncateTable(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<void> {
    await TruncateTable(connectionId, tableName, database ?? null);
  },

  async dropTable(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<void> {
    await DropTable(connectionId, tableName, database ?? null);
  },

  async dropView(
    connectionId: string,
    viewName: string,
    database?: string
  ): Promise<void> {
    await DropView(connectionId, viewName, database ?? null);
  },

  async renameTable(
    connectionId: string,
    oldName: string,
    newName: string,
    database?: string
  ): Promise<void> {
    await RenameTable(connectionId, oldName, newName, database ?? null);
  },

  async maintainTable(
    connectionId: string,
    tableName: string,
    operation: string,
    database?: string
  ): Promise<void> {
    await MaintainTable(connectionId, tableName, operation, database ?? null);
  },

  async beginTransaction(connectionId: string): Promise<void> {
    await BeginTransaction(connectionId);
  },

  async commitTransaction(connectionId: string): Promise<void> {
    await CommitTransaction(connectionId);
  },

  async rollbackTransaction(connectionId: string): Promise<void> {
    await RollbackTransaction(connectionId);
  },

  async getTransactionStatus(connectionId: string): Promise<boolean> {
    return await GetTransactionStatus(connectionId);
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
    const result = await GetServerInfo(connectionId, database ?? null);
    return result as unknown as {
      version?: string;
      server_type?: string;
      character_set?: string;
      collation?: string;
      uptime?: string;
      max_connections?: number;
    };
  },

  async getTableDDL(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<string[]> {
    return await GetTableDDL(connectionId, tableName, database ?? null);
  },

  async getTriggers(
    connectionId: string,
    database?: string
  ): Promise<any[]> {
    const result = await GetTriggers(connectionId, database ?? null);
    return result as any[];
  },

  async getEvents(
    connectionId: string,
    database?: string
  ): Promise<any[]> {
    const result = await GetEvents(connectionId, database ?? null);
    return result as any[];
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
    return await SaveSnippet(
      params.id ?? null,
      params.name,
      params.sql_text,
      params.db_type ?? null,
      params.category ?? null,
      params.tags ?? null,
      params.is_private || false
    );
  },

  async getSnippets(): Promise<any[]> {
    const result = await GetSnippets();
    return result as any[];
  },

  async deleteSnippet(id: string): Promise<void> {
    await DeleteSnippet(id);
  },

  async saveFavorite(params: {
    id?: string;
    type: string;
    name: string;
    connection_id?: string;
    database?: string;
    table_name?: string;
    sql_text?: string;
    tags?: string;
  }): Promise<string> {
    return await SaveFavorite(
      params.id ?? '',
      params.type,
      params.name,
      params.connection_id ?? null,
      params.database ?? null,
      params.table_name ?? null,
      params.sql_text ?? null,
      params.tags ?? ''
    );
  },

  async getFavorites(): Promise<any[]> {
    const result = await GetFavorites();
    return result as any[];
  },

  async deleteFavorite(id: string): Promise<void> {
    await DeleteFavorite(id);
  },

  async streamExportTable(
    connectionId: string,
    tableName: string,
    database?: string,
    batchSize?: number
  ): Promise<any> {
    return await StreamExportTable(
      connectionId,
      tableName,
      database ?? null,
      batchSize ?? null
    );
  },

  async checkBackupTool(
    dbType: string
  ): Promise<{ available: boolean; path?: string; error?: string }> {
    const result = await CheckBackupTool(dbType);
    return result as unknown as { available: boolean; path?: string; error?: string };
  },

  async backup(params: {
    connectionId: string;
    database: string;
    tables?: string[];
    includeStructure: boolean;
    includeData: boolean;
    filePath: string;
  }): Promise<{ file_path?: string; error?: string }> {
    const result = await BackupDatabase(
      params.connectionId,
      params.database,
      params.tables || [],
      params.includeStructure,
      params.includeData,
      params.filePath
    );
    return result as unknown as { file_path?: string; error?: string };
  },

  async restore(params: {
    connectionId: string;
    database: string;
    filePath: string;
  }): Promise<{ error?: string }> {
    const result = await RestoreDatabase(
      params.connectionId,
      params.database,
      params.filePath
    );
    return result as unknown as { error?: string };
  },

  async getUsers(connectionId: string, database?: string): Promise<any> {
    return await GetUsers(connectionId, database ?? null);
  },

  async getUserPrivileges(
    connectionId: string,
    username: string,
    host: string,
    database?: string
  ): Promise<any> {
    return await GetUserPrivileges(
      connectionId,
      username,
      host,
      database ?? null
    );
  },

  async getTablePrivileges(
    connectionId: string,
    username: string,
    host: string,
    database?: string
  ): Promise<any[]> {
    const result = await GetTablePrivileges(
      connectionId,
      username,
      host,
      database ?? null
    );
    return result as any[];
  },

  async createUser(params: {
    connectionId: string;
    username: string;
    password: string;
    host: string;
    database?: string;
  }): Promise<void> {
    await CreateUser(
      params.connectionId,
      params.username,
      params.password,
      params.host,
      params.database ?? null
    );
  },

  async dropUser(params: {
    connectionId: string;
    username: string;
    host: string;
    database?: string;
  }): Promise<void> {
    await DropUser(
      params.connectionId,
      params.username,
      params.host,
      params.database ?? null
    );
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
    await GrantPrivilege(
      params.connectionId,
      params.username,
      params.host,
      params.privileges,
      params.databaseAll,
      params.database ?? null,
      params.table ?? null
    );
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
    await RevokePrivilege(
      params.connectionId,
      params.username,
      params.host,
      params.privileges,
      params.databaseAll,
      params.database ?? null,
      params.table ?? null
    );
  },

  async compareSchema(params: {
    sourceConnectionId: string;
    sourceDatabase: string;
    targetConnectionId: string;
    targetDatabase: string;
    tableName?: string;
  }): Promise<any> {
    return await CompareSchema(
      params.sourceConnectionId,
      params.sourceDatabase,
      params.targetConnectionId,
      params.targetDatabase,
      params.tableName ?? null
    );
  },

  async batchImport(params: {
    connectionId: string;
    database?: string;
    tableName: string;
    mode: string;
    primaryKey?: string;
    rows: Record<string, any>[];
  }): Promise<{
    success_count: number;
    failed_count: number;
    total_count: number;
    last_error?: string;
  }> {
    const result = await BatchImport(
      params.connectionId,
      params.database ?? null,
      params.tableName,
      params.mode,
      params.primaryKey ?? null,
      params.rows
    );
    return result as unknown as {
      success_count: number;
      failed_count: number;
      total_count: number;
      last_error?: string;
    };
  },

  async quitApp(): Promise<void> {
    await QuitApp();
  },

  async getConnectionHistory(limit: number = 100): Promise<any[]> {
    try {
      return await GetConnectionHistory(limit);
    } catch {
      return [];
    }
  },

  async clearConnectionHistory(): Promise<void> {
    await ClearConnectionHistory();
  },

  async exportConnections(): Promise<string> {
    return await WailsExportConnections();
  },

  async importConnections(jsonStr: string, overwrite: boolean): Promise<any> {
    return await WailsImportConnections(jsonStr, overwrite);
  },
};
