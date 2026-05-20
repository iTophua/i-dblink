import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { api } from '../../api';
import {
  mockTestConnection,
  mockSaveConnection,
  mockGetConnections,
  mockDeleteConnection,
  mockExecuteQuery,
  mockExecuteDDL,
  mockBeginTransaction,
  mockCommitTransaction,
  mockRollbackTransaction,
  mockConnectDatabase,
} from '../setupTests';

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.getState().setConnections([]);
    useAppStore.getState().setGroups([
      {
        id: 'default',
        name: '不分组',
        icon: '📁',
        color: '#6d6d6d',
        parent_id: undefined,
      },
    ]);
    useSettingsStore.getState().resetSettings();
    useWorkspaceStore.getState().clearWorkspace();
  });

  describe('Connection Flow', () => {
    it('should create and list connection', async () => {
      mockSaveConnection.mockResolvedValue({
        id: 'conn-1',
        name: 'Test MySQL',
        db_type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        status: 'disconnected',
      });

      await api.saveConnection({
        name: 'Test MySQL',
        db_type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'secret',
      } as any);

      mockGetConnections.mockResolvedValue([
        {
          id: 'conn-1',
          name: 'Test MySQL',
          db_type: 'mysql',
          host: 'localhost',
          port: 3306,
          username: 'root',
          status: 'disconnected',
        },
      ]);

      const connections = await api.getConnections();

      expect(connections).toHaveLength(1);
      expect(connections[0].name).toBe('Test MySQL');
    });

    it('should delete connection', async () => {
      await api.deleteConnection('conn-1');

      expect(mockDeleteConnection).toHaveBeenCalledWith('conn-1');
    });

    it('should test connection before saving', async () => {
      await api.testConnection('mysql', 'localhost', 3306, 'root', 'secret');

      expect(mockTestConnection).toHaveBeenCalled();
    });
  });

  describe('Query Flow', () => {
    it('should execute query and return results', async () => {
      mockExecuteQuery.mockResolvedValue({
        columns: ['id', 'name', 'email'],
        rows: [
          [1, 'Alice', 'alice@example.com'],
          [2, 'Bob', 'bob@example.com'],
        ],
        rows_affected: 2,
      });

      const result = await api.executeQuery('conn-1', 'SELECT * FROM users');

      expect(result.columns).toEqual(['id', 'name', 'email']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows_affected).toBe(2);
    });

    it('should execute DDL statement', async () => {
      await api.executeDDL('conn-1', 'CREATE TABLE test (id INT PRIMARY KEY, name VARCHAR(50))');

      expect(mockExecuteDDL).toHaveBeenCalledWith(
        'conn-1',
        'CREATE TABLE test (id INT PRIMARY KEY, name VARCHAR(50))',
        null
      );
    });

    it('should handle query error', async () => {
      mockExecuteQuery.mockResolvedValue({
        columns: [],
        rows: [],
        rows_affected: 0,
        error: 'Syntax error',
      });

      const result = await api.executeQuery('conn-1', 'INVALID SQL');
      expect(result.error).toBe('Syntax error');
    });

    it('should handle query timeout', async () => {
      mockExecuteQuery.mockRejectedValue(new Error('timeout'));

      await expect(api.executeQuery('conn-1', 'SELECT 1')).rejects.toThrow();
    });
  });

  describe('Transaction Flow', () => {
    it('should begin, execute, and commit transaction', async () => {
      mockExecuteQuery.mockResolvedValue({ columns: [], rows: [] });
      await api.beginTransaction('conn-1');
      expect(mockBeginTransaction).toHaveBeenCalledWith('conn-1');

      await api.executeQuery('conn-1', 'UPDATE users SET name = "test"');

      await api.commitTransaction('conn-1');
      expect(mockCommitTransaction).toHaveBeenCalledWith('conn-1');
    });

    it('should rollback on error', async () => {
      mockExecuteQuery.mockRejectedValue(new Error('query failed'));

      await api.beginTransaction('conn-1');

      try {
        await api.executeQuery('conn-1', 'INVALID');
      } catch {
        await api.rollbackTransaction('conn-1');
      }

      expect(mockRollbackTransaction).toHaveBeenCalledWith('conn-1');
    });
  });
});
