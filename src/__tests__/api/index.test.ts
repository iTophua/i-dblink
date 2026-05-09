import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

import { api } from '../../api';
import { invoke } from '@tauri-apps/api/core';

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

describe('API Layer', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  describe('testConnection', () => {
    it('should call invoke with correct parameters for MySQL', async () => {
      mockInvoke.mockResolvedValue(true);

      await api.testConnection('mysql', 'localhost', 3306, 'root', 'password', 'testdb');

      expect(mockInvoke).toHaveBeenCalledWith('test_connection', {
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'password',
        database: 'testdb',
      });
    });

    it('should call invoke with SSH config', async () => {
      mockInvoke.mockResolvedValue(true);

      await api.testConnection('mysql', 'localhost', 3306, 'root', 'password', 'testdb', {
        ssh_enabled: true,
        ssh_host: 'ssh.example.com',
        ssh_port: 22,
        ssh_username: 'sshuser',
        ssh_auth_method: 'key',
        ssh_private_key_path: '/path/to/key',
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        'test_connection',
        expect.objectContaining({
          ssh_enabled: true,
          ssh_host: 'ssh.example.com',
        })
      );
    });

    it('should call invoke with SSL config', async () => {
      mockInvoke.mockResolvedValue(true);

      await api.testConnection(
        'mysql',
        'localhost',
        3306,
        'root',
        'password',
        'testdb',
        undefined,
        {
          ssl_enabled: true,
          ssl_ca_path: '/path/to/ca',
          ssl_skip_verify: false,
        }
      );

      expect(mockInvoke).toHaveBeenCalledWith(
        'test_connection',
        expect.objectContaining({
          ssl_enabled: true,
          ssl_ca_path: '/path/to/ca',
        })
      );
    });

    it('should return true on success', async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await api.testConnection('mysql', 'localhost', 3306, 'root', 'pass');

      expect(result).toBe(true);
    });
  });

  describe('getConnections', () => {
    it('should call invoke with correct method', async () => {
      mockInvoke.mockResolvedValue([
        {
          id: '1',
          name: 'Test DB',
          db_type: 'mysql',
          host: 'localhost',
          port: 3306,
          username: 'root',
          status: 'disconnected',
        },
      ]);

      const result = await api.getConnections();

      expect(mockInvoke).toHaveBeenCalledWith('get_connections');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test DB');
    });
  });

  describe('saveConnection', () => {
    it('should call invoke with connection input', async () => {
      mockInvoke.mockResolvedValue({
        id: '1',
        name: 'Test DB',
        db_type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        status: 'disconnected',
      });

      const input = {
        name: 'Test DB',
        db_type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'secret',
        database: 'testdb',
      };

      const result = await api.saveConnection(input as any);

      expect(mockInvoke).toHaveBeenCalledWith(
        'save_connection',
        expect.objectContaining({
          input,
        })
      );
      expect(result.id).toBe('1');
    });
  });

  describe('deleteConnection', () => {
    it('should call invoke with connection id', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.deleteConnection('conn-1');

      expect(mockInvoke).toHaveBeenCalledWith('delete_connection', { id: 'conn-1' });
    });
  });

  describe('executeQuery', () => {
    it('should call invoke with correct parameters', async () => {
      mockInvoke.mockResolvedValue({
        columns: ['id', 'name'],
        rows: [
          [1, 'Alice'],
          [2, 'Bob'],
        ],
        rows_affected: 2,
      });

      const result = await api.executeQuery('conn-1', 'SELECT * FROM users');

      expect(mockInvoke).toHaveBeenCalledWith('execute_query', {
        connectionId: 'conn-1',
        sql: 'SELECT * FROM users',
        database: undefined,
      });
      expect(result.columns).toEqual(['id', 'name']);
      expect(result.rows).toHaveLength(2);
    });

    it('should handle query with database', async () => {
      mockInvoke.mockResolvedValue({
        columns: ['id'],
        rows: [[1]],
      });

      await api.executeQuery('conn-1', 'SELECT 1', 'testdb');

      expect(mockInvoke).toHaveBeenCalledWith('execute_query', {
        connectionId: 'conn-1',
        sql: 'SELECT 1',
        database: 'testdb',
      });
    });

    it('should return error in result', async () => {
      mockInvoke.mockResolvedValue({
        columns: [],
        rows: [],
        error: 'Syntax error',
      });

      const result = await api.executeQuery('conn-1', 'INVALID SQL');

      expect(result.error).toBe('Syntax error');
    });
  });

  describe('executeDDL', () => {
    it('should call invoke with DDL statement', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.executeDDL('conn-1', 'CREATE TABLE test (id INT)');

      expect(mockInvoke).toHaveBeenCalledWith('execute_ddl', {
        connectionId: 'conn-1',
        sql: 'CREATE TABLE test (id INT)',
        database: undefined,
      });
    });
  });

  describe('getTableStructure', () => {
    it('should return table structure', async () => {
      mockInvoke.mockResolvedValue({
        columns: [{ column_name: 'id', data_type: 'int', is_nullable: 'NO' }],
        indexes: [],
        foreign_keys: [],
      });

      const result = await api.getTableStructure('conn-1', 'users', 'testdb');

      expect(mockInvoke).toHaveBeenCalledWith('get_table_structure', {
        connectionId: 'conn-1',
        tableName: 'users',
        database: 'testdb',
      });
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].column_name).toBe('id');
    });
  });

  describe('transaction APIs', () => {
    it('beginTransaction should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.beginTransaction('conn-1');

      expect(mockInvoke).toHaveBeenCalledWith('begin_transaction', {
        connectionId: 'conn-1',
      });
    });

    it('commitTransaction should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.commitTransaction('conn-1');

      expect(mockInvoke).toHaveBeenCalledWith('commit_transaction', {
        connectionId: 'conn-1',
      });
    });

    it('rollbackTransaction should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.rollbackTransaction('conn-1');

      expect(mockInvoke).toHaveBeenCalledWith('rollback_transaction', {
        connectionId: 'conn-1',
      });
    });

    it('getTransactionStatus should return boolean', async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await api.getTransactionStatus('conn-1');

      expect(result).toBe(true);
    });
  });

  describe('metadata APIs', () => {
    it('getDatabases should return database list', async () => {
      mockInvoke.mockResolvedValue(['testdb', 'production']);

      const result = await api.getDatabases('conn-1');

      expect(result).toEqual(['testdb', 'production']);
    });

    it('getTables should return table list', async () => {
      mockInvoke.mockResolvedValue([
        { table_name: 'users', table_type: 'BASE TABLE' },
        { table_name: 'orders', table_type: 'BASE TABLE' },
      ]);

      const result = await api.getTables('conn-1', 'testdb');

      expect(result).toHaveLength(2);
      expect(result[0].table_name).toBe('users');
    });

    it('getTablesCategorized should return categorized tables', async () => {
      mockInvoke.mockResolvedValue({
        tables: [{ table_name: 'users', table_type: 'BASE TABLE' }],
        views: [{ table_name: 'user_view', table_type: 'VIEW' }],
      });

      const result = await api.getTablesCategorized('conn-1', 'testdb');

      expect(result.tables).toHaveLength(1);
      expect(result.views).toHaveLength(1);
    });

    it('getColumns should return column list', async () => {
      mockInvoke.mockResolvedValue([
        { column_name: 'id', data_type: 'int' },
        { column_name: 'name', data_type: 'varchar' },
      ]);

      const result = await api.getColumns('conn-1', 'users', 'testdb');

      expect(result).toHaveLength(2);
      expect(result[0].column_name).toBe('id');
    });

    it('getIndexes should return index list', async () => {
      mockInvoke.mockResolvedValue([
        { index_name: 'PRIMARY', column_name: 'id', is_unique: true, is_primary: true },
      ]);

      const result = await api.getIndexes('conn-1', 'users', 'testdb');

      expect(result).toHaveLength(1);
      expect(result[0].is_primary).toBe(true);
    });

    it('getForeignKeys should return foreign key list', async () => {
      mockInvoke.mockResolvedValue([
        {
          constraint_name: 'fk_user_id',
          column_name: 'user_id',
          referenced_table: 'users',
          referenced_column: 'id',
        },
      ]);

      const result = await api.getForeignKeys('conn-1', 'orders', 'testdb');

      expect(result).toHaveLength(1);
      expect(result[0].referenced_table).toBe('users');
    });
  });

  describe('group APIs', () => {
    it('getGroups should return group list', async () => {
      mockInvoke.mockResolvedValue([{ id: '1', name: 'Production', icon: '🚀', color: '#ff4d4f' }]);

      const result = await api.getGroups();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Production');
    });

    it('saveGroup should create group', async () => {
      mockInvoke.mockResolvedValue({
        id: '1',
        name: 'Production',
        icon: '🚀',
        color: '#ff4d4f',
      });

      const input = {
        name: 'Production',
        icon: '🚀',
        color: '#ff4d4f',
      };

      const result = await api.saveGroup(input as any);

      expect(result.id).toBe('1');
    });

    it('deleteGroup should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.deleteGroup('group-1');

      expect(mockInvoke).toHaveBeenCalledWith('delete_group', { id: 'group-1' });
    });
  });

  describe('snippet APIs', () => {
    it('saveSnippet should save snippet', async () => {
      mockInvoke.mockResolvedValue('snippet-1');

      const result = await api.saveSnippet({
        name: 'Select Users',
        sql_text: 'SELECT * FROM users',
        db_type: 'mysql',
        category: 'queries',
        tags: 'users,select',
      });

      expect(result).toBe('snippet-1');
    });

    it('getSnippets should return snippets', async () => {
      mockInvoke.mockResolvedValue([
        { id: '1', name: 'Select Users', sql_text: 'SELECT * FROM users' },
      ]);

      const result = await api.getSnippets();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Select Users');
    });

    it('deleteSnippet should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.deleteSnippet('snippet-1');

      expect(mockInvoke).toHaveBeenCalledWith('delete_snippet', { id: 'snippet-1' });
    });
  });

  describe('backup and restore APIs', () => {
    it('checkBackupTool should return tool info', async () => {
      mockInvoke.mockResolvedValue({ available: true, path: '/usr/bin/mysqldump' });

      const result = await api.checkBackupTool('mysql');

      expect(result.available).toBe(true);
      expect(result.path).toBe('/usr/bin/mysqldump');
    });

    it('backup should call correct method', async () => {
      mockInvoke.mockResolvedValue({ file_path: '/path/to/backup.sql' });

      const result = await api.backup({
        connectionId: 'conn-1',
        database: 'testdb',
        includeStructure: true,
        includeData: true,
        filePath: '/path/to/backup.sql',
      });

      expect(result.file_path).toBe('/path/to/backup.sql');
    });

    it('restore should call correct method', async () => {
      mockInvoke.mockResolvedValue({});

      await api.restore({
        connectionId: 'conn-1',
        database: 'testdb',
        filePath: '/path/to/backup.sql',
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        'restore_database',
        expect.objectContaining({
          connectionId: 'conn-1',
          database: 'testdb',
        })
      );
    });
  });

  describe('user management APIs', () => {
    it('getUsers should return user list', async () => {
      mockInvoke.mockResolvedValue([{ user: 'root', host: 'localhost' }]);

      const result = await api.getUsers('conn-1', 'testdb');

      expect(result).toBeDefined();
    });

    it('createUser should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.createUser({
        connectionId: 'conn-1',
        username: 'newuser',
        password: 'password',
        host: 'localhost',
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        'create_user',
        expect.objectContaining({
          username: 'newuser',
        })
      );
    });

    it('dropUser should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.dropUser({
        connectionId: 'conn-1',
        username: 'olduser',
        host: 'localhost',
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        'drop_user',
        expect.objectContaining({
          username: 'olduser',
        })
      );
    });

    it('grantPrivilege should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.grantPrivilege({
        connectionId: 'conn-1',
        username: 'newuser',
        host: 'localhost',
        privileges: ['SELECT', 'INSERT'],
        databaseAll: true,
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        'grant_privilege',
        expect.objectContaining({
          username: 'newuser',
          privileges: ['SELECT', 'INSERT'],
        })
      );
    });

    it('revokePrivilege should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.revokePrivilege({
        connectionId: 'conn-1',
        username: 'newuser',
        host: 'localhost',
        privileges: ['DELETE'],
        databaseAll: false,
        database: 'testdb',
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        'revoke_privilege',
        expect.objectContaining({
          username: 'newuser',
        })
      );
    });
  });

  describe('schema comparison API', () => {
    it('compareSchema should return comparison result', async () => {
      mockInvoke.mockResolvedValue({
        differences: [],
        status: 'identical',
      });

      const result = await api.compareSchema({
        sourceConnectionId: 'conn-1',
        sourceDatabase: 'testdb',
        targetConnectionId: 'conn-2',
        targetDatabase: 'testdb',
      });

      expect(result).toBeDefined();
    });
  });

  describe('batch import API', () => {
    it('batchImport should return import results', async () => {
      mockInvoke.mockResolvedValue({
        success_count: 10,
        failed_count: 0,
        total_count: 10,
      });

      const result = await api.batchImport({
        connectionId: 'conn-1',
        database: 'testdb',
        tableName: 'users',
        mode: 'append',
        rows: [
          { username: 'user1', email: 'user1@example.com' },
          { username: 'user2', email: 'user2@example.com' },
        ],
      });

      expect(result.success_count).toBe(10);
      expect(result.failed_count).toBe(0);
    });
  });

  describe('table operations', () => {
    it('truncateTable should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.truncateTable('conn-1', 'users', 'testdb');

      expect(mockInvoke).toHaveBeenCalledWith('truncate_table', {
        connectionId: 'conn-1',
        tableName: 'users',
        database: 'testdb',
      });
    });

    it('dropTable should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.dropTable('conn-1', 'users', 'testdb');

      expect(mockInvoke).toHaveBeenCalledWith('drop_table', {
        connectionId: 'conn-1',
        tableName: 'users',
        database: 'testdb',
      });
    });

    it('dropView should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.dropView('conn-1', 'user_view', 'testdb');

      expect(mockInvoke).toHaveBeenCalledWith('drop_view', {
        connectionId: 'conn-1',
        viewName: 'user_view',
        database: 'testdb',
      });
    });

    it('renameTable should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.renameTable('conn-1', 'old_name', 'new_name', 'testdb');

      expect(mockInvoke).toHaveBeenCalledWith('rename_table', {
        connectionId: 'conn-1',
        oldName: 'old_name',
        newName: 'new_name',
        database: 'testdb',
      });
    });

    it('maintainTable should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.maintainTable('conn-1', 'users', 'optimize', 'testdb');

      expect(mockInvoke).toHaveBeenCalledWith('maintain_table', {
        connectionId: 'conn-1',
        tableName: 'users',
        operation: 'optimize',
        database: 'testdb',
      });
    });
  });

  describe('procedure and function APIs', () => {
    it('getProcedures should return procedure list', async () => {
      mockInvoke.mockResolvedValue(['get_user_orders', 'calculate_total']);

      const result = await api.getProcedures('conn-1', 'testdb');

      expect(result).toHaveLength(2);
    });

    it('getFunctions should return function list', async () => {
      mockInvoke.mockResolvedValue(['calculate_total', 'get_user_count']);

      const result = await api.getFunctions('conn-1', 'testdb');

      expect(result).toHaveLength(2);
    });

    it('getProcedureBody should return procedure definition', async () => {
      mockInvoke.mockResolvedValue('CREATE PROCEDURE get_user_orders(...)');

      const result = await api.getProcedureBody('conn-1', 'get_user_orders', 'testdb');

      expect(result).toContain('CREATE PROCEDURE');
    });

    it('getFunctionBody should return function definition', async () => {
      mockInvoke.mockResolvedValue('CREATE FUNCTION calculate_total(...)');

      const result = await api.getFunctionBody('conn-1', 'calculate_total', 'testdb');

      expect(result).toContain('CREATE FUNCTION');
    });
  });

  describe('DDL and metadata APIs', () => {
    it('getTableDDL should return DDL statements', async () => {
      mockInvoke.mockResolvedValue(['CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(50))']);

      const result = await api.getTableDDL('conn-1', 'users', 'testdb');

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('CREATE TABLE');
    });

    it('getTriggers should return trigger list', async () => {
      mockInvoke.mockResolvedValue([
        { name: 'before_insert_user', event: 'INSERT', timing: 'BEFORE' },
      ]);

      const result = await api.getTriggers('conn-1', 'testdb');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('before_insert_user');
    });

    it('getEvents should return event list', async () => {
      mockInvoke.mockResolvedValue([{ name: 'cleanup_old_data', schedule: 'EVERY DAY' }]);

      const result = await api.getEvents('conn-1', 'testdb');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('cleanup_old_data');
    });

    it('getServerInfo should return server information', async () => {
      mockInvoke.mockResolvedValue({
        version: '8.0.32',
        server_type: 'MySQL',
        character_set: 'utf8mb4',
        collation: 'utf8mb4_unicode_ci',
        uptime: '10 days',
        max_connections: 151,
      });

      const result = await api.getServerInfo('conn-1', 'testdb');

      expect(result.version).toBe('8.0.32');
      expect(result.server_type).toBe('MySQL');
    });
  });

  describe('stream export API', () => {
    it('streamExportTable should return export result', async () => {
      mockInvoke.mockResolvedValue({
        chunks: 5,
        total_rows: 1000,
      });

      const result = await api.streamExportTable('conn-1', 'users', 'testdb', 1000);

      expect(result).toBeDefined();
    });
  });

  describe('connect/disconnect APIs', () => {
    it('connectConnection should call correct method', async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await api.connectConnection('conn-1');

      expect(mockInvoke).toHaveBeenCalledWith('connect_database', {
        connectionId: 'conn-1',
      });
      expect(result).toBe(true);
    });

    it('disconnectConnection should call correct method', async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await api.disconnectConnection('conn-1');

      expect(mockInvoke).toHaveBeenCalledWith('disconnect_database', {
        connectionId: 'conn-1',
      });
      expect(result).toBe(true);
    });

    it('updateConnectionPassword should call correct method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.updateConnectionPassword('conn-1', 'newpassword');

      expect(mockInvoke).toHaveBeenCalledWith('update_connection_password', {
        connectionId: 'conn-1',
        password: 'newpassword',
      });
    });
  });
});
