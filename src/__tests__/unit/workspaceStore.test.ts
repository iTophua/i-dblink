import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../__tests__/mocks/workspaceStore';

describe('workspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().clearWorkspace();
  });

  describe('initial state', () => {
    it('has default workspace', () => {
      const state = useWorkspaceStore.getState();
      expect(state.openedTables).toEqual([]);
      expect(state.openedSqlTabs).toEqual([]);
      expect(state.openedDesignerTabs).toEqual([]);
      expect(state.openedViewDefTabs).toEqual([]);
      expect(state.activeKey).toBe('objects');
      expect(state.sidebarCollapsed).toBe(false);
      expect(state.expandedKeys).toEqual([]);
    });
  });

  describe('updateWorkspace', () => {
    it('updates activeKey', () => {
      useWorkspaceStore.getState().updateWorkspace({ activeKey: 'sql-1' });
      expect(useWorkspaceStore.getState().activeKey).toBe('sql-1');
    });

    it('updates sidebarCollapsed', () => {
      useWorkspaceStore.getState().updateWorkspace({ sidebarCollapsed: true });
      expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(true);
    });

    it('updates expandedKeys', () => {
      useWorkspaceStore.getState().updateWorkspace({ expandedKeys: ['conn-1'] });
      expect(useWorkspaceStore.getState().expandedKeys).toEqual(['conn-1']);
    });

    it('updates openedSqlTabs', () => {
      useWorkspaceStore.getState().updateWorkspace({
        openedSqlTabs: [
          { key: 'sql-1', title: 'Query 1', content: 'SELECT * FROM users' },
        ],
      });
      expect(useWorkspaceStore.getState().openedSqlTabs).toHaveLength(1);
      expect(useWorkspaceStore.getState().openedSqlTabs[0].key).toBe('sql-1');
    });

    it('updates openedTables', () => {
      useWorkspaceStore.getState().updateWorkspace({
        openedTables: [
          { name: 'users', connectionId: 'conn-1', connectionName: 'Test DB' },
        ],
      });
      expect(useWorkspaceStore.getState().openedTables).toHaveLength(1);
    });

    it('updates multiple properties at once', () => {
      useWorkspaceStore.getState().updateWorkspace({
        activeKey: 'sql-1',
        sidebarCollapsed: true,
        expandedKeys: ['conn-1'],
      });
      expect(useWorkspaceStore.getState().activeKey).toBe('sql-1');
      expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(true);
      expect(useWorkspaceStore.getState().expandedKeys).toEqual(['conn-1']);
    });

    it('preserves other properties when updating one', () => {
      useWorkspaceStore.getState().updateWorkspace({ activeKey: 'sql-1' });
      expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(false);
      expect(useWorkspaceStore.getState().openedTables).toEqual([]);
    });
  });

  describe('clearWorkspace', () => {
    it('clears all tabs', () => {
      useWorkspaceStore.getState().updateWorkspace({
        openedSqlTabs: [{ key: 'sql-1', title: 'Query 1' }],
        openedTables: [{ name: 'users', connectionId: 'conn-1', connectionName: 'Test' }],
        openedDesignerTabs: [{ key: 'designer-1', title: 'Designer', connectionId: 'conn-1' }],
        openedViewDefTabs: [{ key: 'view-1', title: 'View', connectionId: 'conn-1', viewName: 'v1' }],
      });

      useWorkspaceStore.getState().clearWorkspace();

      const state = useWorkspaceStore.getState();
      expect(state.openedSqlTabs).toEqual([]);
      expect(state.openedTables).toEqual([]);
      expect(state.openedDesignerTabs).toEqual([]);
      expect(state.openedViewDefTabs).toEqual([]);
    });

    it('resets activeKey to objects', () => {
      useWorkspaceStore.getState().updateWorkspace({ activeKey: 'sql-1' });
      useWorkspaceStore.getState().clearWorkspace();
      expect(useWorkspaceStore.getState().activeKey).toBe('objects');
    });

    it('resets sidebarCollapsed to false', () => {
      useWorkspaceStore.getState().updateWorkspace({ sidebarCollapsed: true });
      useWorkspaceStore.getState().clearWorkspace();
      expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(false);
    });

    it('resets expandedKeys to empty', () => {
      useWorkspaceStore.getState().updateWorkspace({ expandedKeys: ['conn-1'] });
      useWorkspaceStore.getState().clearWorkspace();
      expect(useWorkspaceStore.getState().expandedKeys).toEqual([]);
    });
  });
});
