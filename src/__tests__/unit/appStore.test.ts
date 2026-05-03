import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../stores/appStore';
import type { Connection, ConnectionGroup } from '../../stores/appStore';

const createMockConnection = (overrides = {}): Connection => ({
  id: 'conn-1',
  name: 'Test Connection',
  db_type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'root',
  database: 'testdb',
  group_id: 'default',
  status: 'disconnected',
  ...overrides,
});

describe('appStore', () => {
  beforeEach(() => {
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
    useAppStore.getState().setActiveConnection(null);
    useAppStore.getState().setLoading(false);
    useAppStore.getState().setError(null);
    useAppStore.getState().clearTableData();
  });

  describe('connections', () => {
    it('initial state has default group', () => {
      const state = useAppStore.getState();
      expect(state.connections).toHaveLength(0);
      expect(state.groups).toHaveLength(1);
      expect(state.groups[0].name).toBe('不分组');
    });

    it('addConnection adds a new connection', () => {
      const conn = createMockConnection({ id: 'conn-1' });
      useAppStore.getState().addConnection(conn);

      const state = useAppStore.getState();
      expect(state.connections).toHaveLength(1);
      expect(state.connections[0]).toEqual(conn);
    });

    it('addConnection does not duplicate', () => {
      const conn = createMockConnection({ id: 'conn-1' });
      useAppStore.getState().addConnection(conn);
      useAppStore.getState().addConnection(conn);

      expect(useAppStore.getState().connections).toHaveLength(2);
    });

    it('setConnections replaces all connections', () => {
      const conn1 = createMockConnection({ id: 'conn-1' });
      const conn2 = createMockConnection({ id: 'conn-2' });
      useAppStore.getState().setConnections([conn1, conn2]);

      expect(useAppStore.getState().connections).toHaveLength(2);
    });

    it('setConnections accepts updater function', () => {
      const conn1 = createMockConnection({ id: 'conn-1' });
      useAppStore.getState().setConnections([conn1]);
      useAppStore.getState().setConnections((prev) => [...prev, createMockConnection({ id: 'conn-2' })]);

      expect(useAppStore.getState().connections).toHaveLength(2);
    });

    it('updateConnection updates existing connection', () => {
      const conn = createMockConnection({ id: 'conn-1' });
      useAppStore.getState().setConnections([conn]);

      useAppStore.getState().updateConnection('conn-1', { name: 'Updated Name' });

      const state = useAppStore.getState();
      expect(state.connections[0].name).toBe('Updated Name');
      expect(state.connections[0].db_type).toBe('mysql');
    });

    it('updateConnection does not affect other connections', () => {
      const conn1 = createMockConnection({ id: 'conn-1', name: 'Conn1' });
      const conn2 = createMockConnection({ id: 'conn-2', name: 'Conn2' });
      useAppStore.getState().setConnections([conn1, conn2]);

      useAppStore.getState().updateConnection('conn-1', { name: 'Updated' });

      expect(useAppStore.getState().connections[1].name).toBe('Conn2');
    });

    it('deleteConnection removes connection', () => {
      const conn = createMockConnection({ id: 'conn-1' });
      useAppStore.getState().setConnections([conn]);

      useAppStore.getState().deleteConnection('conn-1');
      expect(useAppStore.getState().connections).toHaveLength(0);
    });

    it('deleteConnection clears activeConnection if it was the deleted one', () => {
      const conn = createMockConnection({ id: 'conn-1' });
      useAppStore.getState().setConnections([conn]);
      useAppStore.getState().setActiveConnection('conn-1');

      useAppStore.getState().deleteConnection('conn-1');
      expect(useAppStore.getState().activeConnectionId).toBeNull();
    });

    it('deleteConnection does not affect other active connections', () => {
      const conn1 = createMockConnection({ id: 'conn-1' });
      const conn2 = createMockConnection({ id: 'conn-2' });
      useAppStore.getState().setConnections([conn1, conn2]);
      useAppStore.getState().setActiveConnection('conn-2');

      useAppStore.getState().deleteConnection('conn-1');
      expect(useAppStore.getState().activeConnectionId).toBe('conn-2');
    });

    it('setActiveConnection sets active connection', () => {
      useAppStore.getState().setActiveConnection('conn-1');
      expect(useAppStore.getState().activeConnectionId).toBe('conn-1');
    });

    it('setActiveConnection accepts updater function', () => {
      useAppStore.getState().setActiveConnection('conn-1');
      useAppStore.getState().setActiveConnection(() => 'conn-2');
      expect(useAppStore.getState().activeConnectionId).toBe('conn-2');
    });

    it('setActiveConnection clears with null', () => {
      useAppStore.getState().setActiveConnection('conn-1');
      useAppStore.getState().setActiveConnection(null);
      expect(useAppStore.getState().activeConnectionId).toBeNull();
    });
  });

  describe('groups', () => {
    it('addGroup adds a new group', () => {
      const group: ConnectionGroup = {
        id: 'group-1',
        name: 'New Group',
        icon: '📂',
        color: '#ff0000',
      };
      useAppStore.getState().addGroup(group);

      const state = useAppStore.getState();
      expect(state.groups).toHaveLength(2);
      expect(state.groups[1]).toEqual(group);
    });

    it('updateGroup updates existing group', () => {
      useAppStore.getState().updateGroup('default', { name: 'Renamed' });

      expect(useAppStore.getState().groups[0].name).toBe('Renamed');
    });

    it('deleteGroup removes group', () => {
      useAppStore.getState().deleteGroup('default');
      expect(useAppStore.getState().groups).toHaveLength(0);
    });

    it('setGroups replaces all groups', () => {
      useAppStore.getState().setGroups([
        { id: 'group-1', name: 'Group 1', icon: '📂', color: '#ff0000' },
      ]);
      expect(useAppStore.getState().groups).toHaveLength(1);
    });

    it('setGroups accepts updater function', () => {
      useAppStore.getState().setGroups((prev) => [
        ...prev,
        { id: 'group-1', name: 'Group 1', icon: '📂', color: '#ff0000' },
      ]);
      expect(useAppStore.getState().groups).toHaveLength(2);
    });
  });

  describe('loading and error', () => {
    it('setLoading updates isLoading', () => {
      useAppStore.getState().setLoading(true);
      expect(useAppStore.getState().isLoading).toBe(true);

      useAppStore.getState().setLoading(false);
      expect(useAppStore.getState().isLoading).toBe(false);
    });

    it('setError updates error', () => {
      useAppStore.getState().setError('Something went wrong');
      expect(useAppStore.getState().error).toBe('Something went wrong');
    });

    it('setError clears with null', () => {
      useAppStore.getState().setError('Error');
      useAppStore.getState().setError(null);
      expect(useAppStore.getState().error).toBeNull();
    });

    it('initial state has no loading or error', () => {
      expect(useAppStore.getState().isLoading).toBe(false);
      expect(useAppStore.getState().error).toBeNull();
    });
  });

  describe('transactionStartTime', () => {
    it('setTransactionStartTime updates value', () => {
      useAppStore.getState().setTransactionStartTime(Date.now());
      expect(useAppStore.getState().transactionStartTime).not.toBeNull();
    });

    it('setTransactionStartTime clears with null', () => {
      useAppStore.getState().setTransactionStartTime(Date.now());
      useAppStore.getState().setTransactionStartTime(null);
      expect(useAppStore.getState().transactionStartTime).toBeNull();
    });

    it('initial state has no transaction start time', () => {
      expect(useAppStore.getState().transactionStartTime).toBeNull();
    });
  });

  describe('table data cache', () => {
    it('setTableData caches table data', () => {
      const tables = [
        { table_name: 'users', table_type: 'BASE TABLE' },
        { table_name: 'posts', table_type: 'BASE TABLE' },
      ];
      useAppStore.getState().setTableData('conn-1::testdb', tables);

      const cached = useAppStore.getState().getTableData('conn-1::testdb');
      expect(cached).toBeDefined();
      expect(cached!.tables).toHaveLength(2);
      expect(cached!.loaded).toBe(true);
      expect(cached!.loading).toBe(false);
      expect(cached!.lastUpdated).toBeDefined();
    });

    it('setTableDataLoading sets loading state', () => {
      useAppStore.getState().setTableDataLoading('conn-1::testdb', true);

      const cached = useAppStore.getState().getTableData('conn-1::testdb');
      expect(cached!.loading).toBe(true);
    });

    it('setTableDataFailed sets failed state', () => {
      useAppStore.getState().setTableDataFailed('conn-1::testdb', true);

      const cached = useAppStore.getState().getTableData('conn-1::testdb');
      expect(cached!.loadFailed).toBe(true);
      expect(cached!.loading).toBe(false);
    });

    it('getTableData returns undefined for non-existent key', () => {
      const cached = useAppStore.getState().getTableData('nonexistent');
      expect(cached).toBeUndefined();
    });

    it('clearTableData clears all cache', () => {
      useAppStore.getState().setTableData('conn-1::db1', []);
      useAppStore.getState().setTableData('conn-1::db2', []);
      useAppStore.getState().setTableData('conn-2::db1', []);

      useAppStore.getState().clearTableData();
      expect(useAppStore.getState().getTableData('conn-1::db1')).toBeUndefined();
      expect(useAppStore.getState().getTableData('conn-2::db1')).toBeUndefined();
    });

    it('clearTableData clears specific connection cache', () => {
      useAppStore.getState().setTableData('conn-1::db1', []);
      useAppStore.getState().setTableData('conn-2::db1', []);

      useAppStore.getState().clearTableData('conn-1');

      expect(useAppStore.getState().getTableData('conn-1::db1')).toBeUndefined();
      expect(useAppStore.getState().getTableData('conn-2::db1')).toBeDefined();
    });

    it('setTableData creates entry if not exists', () => {
      useAppStore.getState().setTableDataLoading('new-key', true);
      const cached = useAppStore.getState().getTableData('new-key');
      expect(cached).toBeDefined();
      expect(cached!.loading).toBe(true);
      expect(cached!.tables).toHaveLength(0);
    });
  });
});
