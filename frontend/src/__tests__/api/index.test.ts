import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../api';
import {
  mockTestConnection,
  mockGetConnections,
  mockSaveConnection,
  mockDeleteConnection,
  mockExecuteQuery,
  mockExecuteDDL,
  mockBeginTransaction,
  mockCommitTransaction,
  mockRollbackTransaction,
  mockGetTransactionStatus,
  mockGetDatabases,
  mockGetTables,
  mockGetTablesCategorized,
  mockGetColumns,
  mockGetServerInfo,
  mockGetGroups,
  mockDeleteGroup,
  mockSaveSnippet,
  mockGetSnippets,
  mockDeleteSnippet,
  mockCheckBackupTool,
  mockConnectDatabase,
  mockDisconnectDatabase,
} from '../setupTests';

describe('API Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('testConnection', () => {
    it('should call TestConnection with constructed input', async () => {
      await api.testConnection('mysql', 'localhost', 3306, 'root', 'password', 'testdb');

      expect(mockTestConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          db_type: 'mysql',
          host: 'localhost',
          port: 3306,
        })
      );
    });

    it('should include SSH config when provided', async () => {
      await api.testConnection('mysql', 'localhost', 3306, 'root', 'password', 'testdb', {
        ssh_enabled: true,
        ssh_host: 'ssh.example.com',
        ssh_port: 22,
      });

      const callArg = mockTestConnection.mock.calls[0][0];
      expect(callArg.ssh_enabled).toBe(true);
      expect(callArg.ssh_host).toBe('ssh.example.com');
    });

    it('should include SSL config when provided', async () => {
      await api.testConnection('mysql', 'localhost', 3306, 'root', 'password', 'testdb', undefined, {
        ssl_enabled: true,
        ssl_ca_path: '/path/to/ca',
      });

      const callArg = mockTestConnection.mock.calls[0][0];
      expect(callArg.ssl_enabled).toBe(true);
      expect(callArg.ssl_ca_path).toBe('/path/to/ca');
    });
  });

  describe('getConnections', () => {
    it('should return connection list', async () => {
      const mockData = [
        { id: '1', name: 'Test DB', db_type: 'mysql', host: 'localhost', port: 3306, username: 'root', status: 'disconnected' },
      ];
      mockGetConnections.mockResolvedValue(mockData);

      const result = await api.getConnections();

      expect(mockGetConnections).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test DB');
    });
  });

  describe('saveConnection', () => {
    it('should call SaveConnection with ConnectionInput', async () => {
      mockSaveConnection.mockResolvedValue({
        id: '1', name: 'Test DB', db_type: 'mysql', host: 'localhost',
        port: 3306, username: 'root', status: 'disconnected',
      });

      const result = await api.saveConnection({
        name: 'Test DB',
        db_type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'secret',
      });

      expect(mockSaveConnection).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test DB', db_type: 'mysql' })
      );
      expect(result.id).toBe('1');
    });
  });

  describe('deleteConnection', () => {
    it('should call DeleteConnection with id', async () => {
      await api.deleteConnection('conn-1');
      expect(mockDeleteConnection).toHaveBeenCalledWith('conn-1');
    });
  });

  describe('executeQuery', () => {
    it('should call ExecuteQuery with correct args', async () => {
      mockExecuteQuery.mockResolvedValue({
        columns: ['id', 'name'],
        rows: [[1, 'Alice'], [2, 'Bob']],
        rows_affected: 2,
      });

      const result = await api.executeQuery('conn-1', 'SELECT * FROM users');

      expect(mockExecuteQuery).toHaveBeenCalledWith('conn-1', 'SELECT * FROM users', null);
      expect(result.columns).toEqual(['id', 'name']);
      expect(result.rows).toHaveLength(2);
    });

    it('should handle database parameter', async () => {
      mockExecuteQuery.mockResolvedValue({ columns: ['id'], rows: [[1]] });

      await api.executeQuery('conn-1', 'SELECT 1', 'testdb');

      expect(mockExecuteQuery).toHaveBeenCalledWith('conn-1', 'SELECT 1', 'testdb');
    });

    it('should return error in result', async () => {
      mockExecuteQuery.mockResolvedValue({
        columns: [], rows: [], error: 'Syntax error',
      });

      const result = await api.executeQuery('conn-1', 'INVALID SQL');

      expect(result.error).toBe('Syntax error');
    });
  });

  describe('executeDDL', () => {
    it('should call ExecuteDDL', async () => {
      await api.executeDDL('conn-1', 'CREATE TABLE test (id INT)');
      expect(mockExecuteDDL).toHaveBeenCalledWith('conn-1', 'CREATE TABLE test (id INT)', null);
    });
  });

  describe('transaction APIs', () => {
    it('beginTransaction should call BeginTransaction', async () => {
      await api.beginTransaction('conn-1');
      expect(mockBeginTransaction).toHaveBeenCalledWith('conn-1');
    });

    it('commitTransaction should call CommitTransaction', async () => {
      await api.commitTransaction('conn-1');
      expect(mockCommitTransaction).toHaveBeenCalledWith('conn-1');
    });

    it('rollbackTransaction should call RollbackTransaction', async () => {
      await api.rollbackTransaction('conn-1');
      expect(mockRollbackTransaction).toHaveBeenCalledWith('conn-1');
    });

    it('getTransactionStatus should return boolean', async () => {
      mockGetTransactionStatus.mockResolvedValue(true);
      const result = await api.getTransactionStatus('conn-1');
      expect(result).toBe(true);
    });
  });

  describe('metadata APIs', () => {
    it('getDatabases should return database list', async () => {
      mockGetDatabases.mockResolvedValue(['testdb', 'production']);
      const result = await api.getDatabases('conn-1');
      expect(result).toEqual(['testdb', 'production']);
    });

    it('getTables should return table list', async () => {
      mockGetTables.mockResolvedValue([
        { table_name: 'users', table_type: 'BASE TABLE' },
      ]);
      const result = await api.getTables('conn-1', 'testdb');
      expect(result).toHaveLength(1);
    });

    it('getTablesCategorized should return categorized result', async () => {
      mockGetTablesCategorized.mockResolvedValue({
        tables: [{ table_name: 'users', table_type: 'BASE TABLE' }],
        views: [{ table_name: 'user_view', table_type: 'VIEW' }],
      });
      const result = await api.getTablesCategorized('conn-1', 'testdb');
      expect(result.tables).toHaveLength(1);
      expect(result.views).toHaveLength(1);
    });

    it('getColumns should return columns', async () => {
      mockGetColumns.mockResolvedValue([
        { column_name: 'id', data_type: 'int' },
        { column_name: 'name', data_type: 'varchar' },
      ]);
      const result = await api.getColumns('conn-1', 'users', 'testdb');
      expect(result).toHaveLength(2);
    });

    it('getServerInfo should return server info', async () => {
      mockGetServerInfo.mockResolvedValue({
        version: '8.0.32', server_type: 'MySQL',
      });
      const result = await api.getServerInfo('conn-1', 'testdb');
      expect(result.version).toBe('8.0.32');
    });
  });

  describe('group APIs', () => {
    it('getGroups should return groups', async () => {
      mockGetGroups.mockResolvedValue([{ id: '1', name: 'Production', icon: '🚀', color: '#ff4d4f' }]);
      const result = await api.getGroups();
      expect(result).toHaveLength(1);
    });

    it('deleteGroup should call DeleteGroup', async () => {
      await api.deleteGroup('group-1');
      expect(mockDeleteGroup).toHaveBeenCalledWith('group-1');
    });
  });

  describe('snippet APIs', () => {
    it('saveSnippet should call SaveSnippet', async () => {
      mockSaveSnippet.mockResolvedValue('snippet-1');
      const result = await api.saveSnippet({
        name: 'Select Users', sql_text: 'SELECT * FROM users',
      });
      expect(result).toBe('snippet-1');
    });

    it('getSnippets should return snippets', async () => {
      mockGetSnippets.mockResolvedValue([{ id: '1', name: 'Test' }]);
      const result = await api.getSnippets();
      expect(result).toHaveLength(1);
    });

    it('deleteSnippet should call DeleteSnippet', async () => {
      await api.deleteSnippet('snippet-1');
      expect(mockDeleteSnippet).toHaveBeenCalledWith('snippet-1');
    });
  });

  describe('backup and restore APIs', () => {
    it('checkBackupTool should return result', async () => {
      mockCheckBackupTool.mockResolvedValue({ available: true, path: '/usr/bin/mysqldump' });
      const result = await api.checkBackupTool('mysql');
      expect(result.available).toBe(true);
    });
  });

  describe('connect/disconnect APIs', () => {
    it('connectConnection should call ConnectDatabase', async () => {
      await api.connectConnection('conn-1');
      expect(mockConnectDatabase).toHaveBeenCalledWith('conn-1');
    });

    it('disconnectConnection should call DisconnectDatabase', async () => {
      await api.disconnectConnection('conn-1');
      expect(mockDisconnectDatabase).toHaveBeenCalledWith('conn-1');
    });
  });
});
