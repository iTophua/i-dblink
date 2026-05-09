import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

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

describe('Integration Tests', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    // Reset stores
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
      // Mock saveConnection
      mockInvoke.mockResolvedValue({
        id: 'conn-1',
        name: 'Test MySQL',
        db_type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        status: 'disconnected',
      });

      // Save connection
      await api.saveConnection({
        name: 'Test MySQL',
        db_type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'secret',
      } as any);

      // Get connections
      mockInvoke.mockResolvedValue([
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
      mockInvoke.mockResolvedValue(undefined);

      await api.deleteConnection('conn-1');

      expect(mockInvoke).toHaveBeenCalledWith('delete_connection', { id: 'conn-1' });
    });

    it('should test connection before saving', async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await api.testConnection('mysql', 'localhost', 3306, 'root', 'secret');

      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith(
        'test_connection',
        expect.objectContaining({
          dbType: 'mysql',
          host: 'localhost',
        })
      );
    });
  });

  describe('Query Flow', () => {
    it('should execute query and return results', async () => {
      mockInvoke.mockResolvedValue({
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
      mockInvoke.mockResolvedValue(undefined);

      await api.executeDDL('conn-1', 'CREATE TABLE test (id INT PRIMARY KEY, name VARCHAR(50))');

      expect(mockInvoke).toHaveBeenCalledWith(
        'execute_ddl',
        expect.objectContaining({
          sql: 'CREATE TABLE test (id INT PRIMARY KEY, name VARCHAR(50))',
        })
      );
    });

    it('should handle query error', async () => {
      mockInvoke.mockResolvedValue({
        columns: [],
        rows: [],
        error: "Table 'users' doesn't exist",
      });

      const result = await api.executeQuery('conn-1', 'SELECT * FROM users');

      expect(result.error).toBe("Table 'users' doesn't exist");
    });
  });

  describe('Metadata Flow', () => {
    it('should get databases', async () => {
      mockInvoke.mockResolvedValue(['testdb', 'production', 'staging']);

      const databases = await api.getDatabases('conn-1');

      expect(databases).toHaveLength(3);
      expect(databases).toContain('testdb');
    });

    it('should get tables', async () => {
      mockInvoke.mockResolvedValue([
        { table_name: 'users', table_type: 'BASE TABLE' },
        { table_name: 'orders', table_type: 'BASE TABLE' },
        { table_name: 'user_view', table_type: 'VIEW' },
      ]);

      const tables = await api.getTables('conn-1', 'testdb');

      expect(tables).toHaveLength(3);
    });

    it('should get table structure', async () => {
      mockInvoke.mockResolvedValue({
        columns: [
          { column_name: 'id', data_type: 'int', is_nullable: 'NO', column_key: 'PRI' },
          { column_name: 'name', data_type: 'varchar', is_nullable: 'NO' },
          { column_name: 'email', data_type: 'varchar', is_nullable: 'YES' },
        ],
        indexes: [
          {
            index_name: 'PRIMARY',
            column_name: 'id',
            is_unique: true,
            is_primary: true,
            seq_in_index: 1,
          },
        ],
        foreign_keys: [],
      });

      const structure = await api.getTableStructure('conn-1', 'users', 'testdb');

      expect(structure.columns).toHaveLength(3);
      expect(structure.indexes).toHaveLength(1);
      expect(structure.foreign_keys).toHaveLength(0);
    });

    it('should get foreign keys', async () => {
      mockInvoke.mockResolvedValue([
        {
          constraint_name: 'fk_orders_user',
          column_name: 'user_id',
          referenced_table: 'users',
          referenced_column: 'id',
        },
      ]);

      const fks = await api.getForeignKeys('conn-1', 'orders', 'testdb');

      expect(fks).toHaveLength(1);
      expect(fks[0].referenced_table).toBe('users');
    });
  });

  describe('Transaction Flow', () => {
    it('should begin transaction', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.beginTransaction('conn-1');

      expect(mockInvoke).toHaveBeenCalledWith('begin_transaction', {
        connectionId: 'conn-1',
      });
    });

    it('should commit transaction', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.commitTransaction('conn-1');

      expect(mockInvoke).toHaveBeenCalledWith('commit_transaction', {
        connectionId: 'conn-1',
      });
    });

    it('should rollback transaction', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await api.rollbackTransaction('conn-1');

      expect(mockInvoke).toHaveBeenCalledWith('rollback_transaction', {
        connectionId: 'conn-1',
      });
    });

    it('should check transaction status', async () => {
      mockInvoke.mockResolvedValue(true);

      const status = await api.getTransactionStatus('conn-1');

      expect(status).toBe(true);
    });
  });

  describe('Backup and Restore Flow', () => {
    it('should check backup tool availability', async () => {
      mockInvoke.mockResolvedValue({ available: true, path: '/usr/bin/mysqldump' });

      const result = await api.checkBackupTool('mysql');

      expect(result.available).toBe(true);
      expect(result.path).toBe('/usr/bin/mysqldump');
    });

    it('should backup database', async () => {
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

    it('should restore database', async () => {
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

  describe('Schema Comparison Flow', () => {
    it('should compare schemas', async () => {
      mockInvoke.mockResolvedValue({
        differences: [
          {
            type: 'table',
            name: 'users',
            source: { has: true },
            target: { has: false },
          },
        ],
        status: 'different',
      });

      const result = await api.compareSchema({
        sourceConnectionId: 'conn-1',
        sourceDatabase: 'testdb',
        targetConnectionId: 'conn-2',
        targetDatabase: 'testdb',
      });

      expect(result.differences).toHaveLength(1);
      expect(result.status).toBe('different');
    });
  });

  describe('Batch Import Flow', () => {
    it('should import rows in append mode', async () => {
      mockInvoke.mockResolvedValue({
        success_count: 5,
        failed_count: 0,
        total_count: 5,
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

      expect(result.success_count).toBe(5);
      expect(result.failed_count).toBe(0);
    });

    it('should import rows in replace mode', async () => {
      mockInvoke.mockResolvedValue({
        success_count: 10,
        failed_count: 0,
        total_count: 10,
      });

      const result = await api.batchImport({
        connectionId: 'conn-1',
        database: 'testdb',
        tableName: 'users',
        mode: 'replace',
        primaryKey: 'id',
        rows: [],
      });

      expect(result.total_count).toBe(10);
    });
  });

  describe('Store Integration', () => {
    it('should update store after connection operations', async () => {
      const store = useAppStore.getState();

      // Add connection to store
      store.addConnection({
        id: 'conn-1',
        name: 'Test DB',
        db_type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        status: 'disconnected',
      });

      // Get fresh state
      const state = useAppStore.getState();
      expect(state.connections).toHaveLength(1);
      expect(state.connections[0].name).toBe('Test DB');

      // Update connection status
      store.updateConnection('conn-1', { status: 'connected' });

      const state2 = useAppStore.getState();
      const updated = state2.connections.find((c) => c.id === 'conn-1');
      expect(updated?.status).toBe('connected');

      // Delete connection
      store.deleteConnection('conn-1');

      const state3 = useAppStore.getState();
      expect(state3.connections).toHaveLength(0);
    });

    it('should manage workspace tabs', async () => {
      const store = useWorkspaceStore.getState();

      // Update workspace with SQL tabs
      store.updateWorkspace({
        openedSqlTabs: [
          {
            key: 'tab-1',
            title: 'Query 1',
            connectionId: 'conn-1',
            content: 'SELECT * FROM users',
          },
        ],
        activeKey: 'tab-1',
      });

      const state = useWorkspaceStore.getState();
      expect(state.openedSqlTabs).toHaveLength(1);
      expect(state.activeKey).toBe('tab-1');

      // Add another tab
      store.updateWorkspace({
        openedSqlTabs: [
          {
            key: 'tab-1',
            title: 'Query 1',
            connectionId: 'conn-1',
            content: 'SELECT * FROM users',
          },
          {
            key: 'tab-2',
            title: 'Query 2',
            connectionId: 'conn-1',
            content: 'SELECT * FROM orders',
          },
        ],
        activeKey: 'tab-2',
      });

      const state2 = useWorkspaceStore.getState();
      expect(state2.openedSqlTabs).toHaveLength(2);
      expect(state2.activeKey).toBe('tab-2');

      // Close tab
      store.updateWorkspace({
        openedSqlTabs: [state2.openedSqlTabs[0]],
        activeKey: 'tab-1',
      });

      const state3 = useWorkspaceStore.getState();
      expect(state3.openedSqlTabs).toHaveLength(1);
      expect(state3.openedSqlTabs[0].key).toBe('tab-1');
    });

    it('should manage settings', async () => {
      const store = useSettingsStore.getState();

      // Update settings
      store.updateSettings({
        themeMode: 'dark',
        themePreset: 'midnightDeep',
      });

      expect(store.settings.themeMode).toBe('dark');
      expect(store.settings.themePreset).toBe('midnightDeep');
    });
  });

  describe('Error Handling', () => {
    it('should handle invoke errors', async () => {
      mockInvoke.mockRejectedValue(new Error('Connection failed'));

      await expect(api.executeQuery('conn-1', 'SELECT 1')).rejects.toThrow('Connection failed');
    });

    it('should handle null responses', async () => {
      mockInvoke.mockResolvedValue(null);

      const result = await api.getConnections();

      expect(result).toBeNull();
    });
  });
});
