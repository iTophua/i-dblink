import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Layout, theme, Modal } from 'antd';
import { GlobalSearch } from './GlobalInput';
import { useConnections, useDatabase, useGroups, useInitApp } from '../hooks/useApi';
import { Toolbar } from './Toolbar';
import { EnhancedConnectionTree } from './ConnectionTree/EnhancedConnectionTree';
import { TabPanel, type TabPanelRef } from './TabPanel';
import { StatusBar } from './StatusBar';
import { ConnectionDialog } from './ConnectionDialog';
import { LogPanel } from './LogPanel';
import { SettingsDialog } from './SettingsDialog';
import type { TableInfo, ColumnInfo, IndexInfo } from '../types/api';
import type { ConnectionFormData } from './ConnectionDialog';
import type { Connection } from '../stores/appStore';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';

const { Sider, Content } = Layout;

const getStyles = () => ({
  root: { height: '100vh' as const, overflow: 'hidden' as const },
  mainLayout: { flex: 1, overflow: 'hidden' as const, display: 'flex' as const },
  sider: {
    background: 'var(--background-card)',
    borderRight: '1px solid var(--border-color)',
  },
  siderContent: { display: 'flex' as const, flexDirection: 'column' as const, height: '100%' },
  searchContainer: { padding: '8px 8px 4px', flexShrink: 0 },
  searchInput: {
    borderRadius: 4,
    background: 'var(--background-card)',
  },
  connectionTreeContainer: { flex: 1, minHeight: 0, overflow: 'auto' as const, marginBottom: 0 },
  collapseButton: {
    height: 28,
    flexShrink: 0,
    background: 'var(--background-card)',
    borderTop: '1px solid var(--border-color)',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    cursor: 'pointer' as const,
    transition: 'background 0.2s ease',
  },
  collapseButtonText: {
    color: 'var(--text-secondary)',
    fontSize: 11,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  content: {
    flex: 1,
    background: 'var(--background)',
    margin: 0,
    marginLeft: 0,
    padding: 0,
    borderRadius: 0,
    overflow: 'hidden' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    minHeight: 0,
  },
  tabPanelContainer: {
    flex: 1,
    overflow: 'hidden' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    minHeight: 0,
  },
  logPanelCollapsed: {
    height: 28,
    borderTop: '1px solid var(--border-color)',
    background: 'var(--background-toolbar)',
    padding: '0 16px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
  },
  logLink: { fontSize: 12, color: 'var(--color-primary)' },
});

interface MainLayoutProps {
  children?: React.ReactNode;
}

function MainLayoutComponent({ children }: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState<string | undefined>();
  const [selectedObjectType, setSelectedObjectType] = useState<'table' | 'view' | 'all'>('all');
  // 双击表时触发，用于在 TabPanel 中打开新 Tab
  const [tableToOpen, setTableToOpen] = useState<{ name: string; database?: string } | null>(null);
  const [logPanelCollapsed, setLogPanelCollapsed] = useState(false);
  const [sqlTabCount, setSqlTabCount] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [connectionDatabases, setConnectionDatabases] = useState<
    Record<string, { database: string; tables: TableInfo[]; loaded: boolean; loadFailed?: boolean }[]>
  >({});
  const [tableStructures, setTableStructures] = useState<
    Record<string, { columns: ColumnInfo[]; indexes: IndexInfo[]; loaded: boolean }>
  >({});
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionFormData | undefined>();
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const tabPanelRef = useRef<TabPanelRef>(null);

  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';
  const styles = useMemo(() => getStyles(), []);

  const {
    connections,
    isLoading,
    setActiveConnection,
    saveConnection,
    deleteConnection,
    connect,
    disconnect,
  } = useConnections();

  const { groups, saveGroup, deleteGroup } = useGroups();

  const { getTables, refreshTables, getDatabases, getColumns, getIndexes } = useDatabase();

  useInitApp();

  // Debounced search (500ms)
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // 性能优化：缓存搜索结果
  const filteredConnections = useMemo(() => {
    if (!debouncedSearch.trim()) return connections;
    const lower = debouncedSearch.toLowerCase();
    return connections.filter(
      (conn) => conn.name.toLowerCase().includes(lower) || conn.host?.toLowerCase().includes(lower)
    );
  }, [connections, debouncedSearch]);

  // 性能优化：缓存连接统计
  const connectionStats = useMemo(() => {
    return {
      total: connections.length,
      connected: connections.filter((c) => c.status === 'connected').length,
      filtered: filteredConnections.length,
    };
  }, [connections, filteredConnections]);

  // 性能优化：缓存数据库列表
  const allDatabases = useMemo(() => {
    return Object.values(connectionDatabases).flatMap((dbs) => dbs.map((db) => db.database));
  }, [connectionDatabases]);

  const handleSearchChange = useCallback((value: string | undefined) => {
    const newValue = value ?? '';
    setSearchText(newValue);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(newValue);
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Handler wrappers for ConnectionTree
  const handleSaveConnection = useCallback(
    async (data: any) => {
      await saveConnection({
        id: data.id,
        name: data.name,
        db_type: data.db_type,
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password,
        database: data.database,
        group_id: data.group_id,
      });
    },
    [saveConnection]
  );

  const handleSaveGroup = useCallback(
    (data: { id?: string; name: string; icon: string; color: string; parent_id?: string }) => {
      saveGroup({
        id: data.id,
        name: data.name,
        icon: data.icon,
        color: data.color,
        parent_id: data.parent_id,
      });
    },
    [saveGroup]
  );

  const handleDeleteGroup = useCallback(
    (id: string) => {
      deleteGroup(id);
    },
    [deleteGroup]
  );

  const handleDialogSave = useCallback(
    async (data: ConnectionFormData) => {
      try {
        await saveConnection({
          id: data.id,
          name: data.name,
          db_type: data.dbType,
          host: data.host,
          port: data.port,
          username: data.username,
          password: data.password,
          database: data.database,
          group_id: data.group_id,
        });
        setConnectionDialogOpen(false);
      } catch (error) {
        console.error('Failed to save connection:', error);
      }
    },
    [saveConnection]
  );

  const handleConnectionExpand = useCallback(
    async (connectionId: string, expanded: boolean) => {
      if (expanded && !connectionDatabases[connectionId]) {
        try {
          const databases = await getDatabases(connectionId);
          const dbList = databases.map((db) => ({ database: db, tables: [], loaded: false }));
          setConnectionDatabases((prev) => ({
            ...prev,
            [connectionId]: dbList,
          }));
        } catch (error) {
          console.error('Failed to load databases:', error);
        }
      }
    },
    [connectionDatabases, getDatabases]
  );

  const loadDatabaseTables = useCallback(
    async (connectionId: string, database: string, forceRefresh = false) => {
      const cacheKey = `${connectionId}::${database || ''}`;
      const { setTableDataLoading } = useAppStore.getState();

      setTableDataLoading(cacheKey, true);

      try {
        const tables = await getTables(connectionId, database, forceRefresh);

        setConnectionDatabases((prev) => {
          const dbList = prev[connectionId] || [];
          const dbIndex = dbList.findIndex((db) => db.database === database);

          if (dbIndex >= 0) {
            const newDbList = [...dbList];
            newDbList[dbIndex] = { ...newDbList[dbIndex], tables, loaded: true, loadFailed: false };
            return {
              ...prev,
              [connectionId]: newDbList,
            };
          } else {
            return {
              ...prev,
              [connectionId]: [...dbList, { database, tables, loaded: true, loadFailed: false }],
            };
          }
        });
      } catch {
        setConnectionDatabases((prev) => {
          const dbList = prev[connectionId] || [];
          const dbIndex = dbList.findIndex((db) => db.database === database);

          if (dbIndex >= 0) {
            const newDbList = [...dbList];
            newDbList[dbIndex] = { ...newDbList[dbIndex], loaded: true, loadFailed: true };
            return {
              ...prev,
              [connectionId]: newDbList,
            };
          } else {
            return {
              ...prev,
              [connectionId]: [...dbList, { database, tables: [], loaded: true, loadFailed: true }],
            };
          }
        });
      } finally {
        setTableDataLoading(cacheKey, false);
      }
    },
    [getTables]
  );

  const handleTableSelect = useCallback((table: string | null, database?: string) => {
    setSelectedTable(table);
    setSelectedDatabase(database);
  }, []);

  const handleConnectionSelect = useCallback(
    (id: string | null) => {
      setSelectedConnectionId(id);
      setActiveConnection(id);
    },
    [setActiveConnection]
  );

  const handleConnect = useCallback(
    async (connectionId: string) => {
      const { setLoading, clearTableData, setConnections, setError } = useAppStore.getState();
      try {
        await connect(connectionId);
        const databases = await getDatabases(connectionId);
        const dbList = databases.map((db) => ({ database: db, tables: [], loaded: false }));
        setConnectionDatabases((prev) => ({
          ...prev,
          [connectionId]: dbList,
        }));
        setExpandedKeys((prev) => [...prev, connectionId]);
      } catch (err) {
        // 连接失败时，彻底清理所有相关状态
        setConnectionDatabases((prev) => {
          const next = { ...prev };
          delete next[connectionId];
          return next;
        });
        // 清理表数据缓存（包括 loading 状态）
        clearTableData(connectionId);
        // 重置连接状态为断开
        setConnections((prev) =>
          prev.map((c) =>
            c.id === connectionId ? { ...c, status: 'disconnected' as const } : c
          )
        );
        // 确保全局 loading 状态被重置
        setLoading(false);
        setError(null);
        throw err;
      }
    },
    [connect, getDatabases]
  );

  const handleDatabaseExpand = useCallback(
    async (connectionId: string, database: string) => {
      setSelectedConnectionId(connectionId);
      setSelectedDatabase(database);
      // 检查是否已加载失败，避免不断重试导致错误提示
      const dbList = connectionDatabases[connectionId] || [];
      const db = dbList.find((d) => d.database === database);
      if (db?.loadFailed) return;
      // 始终强制刷新，因为展开数据库时需要最新数据
      await loadDatabaseTables(connectionId, database, true);
    },
    [loadDatabaseTables, connectionDatabases]
  );

  const handleDatabaseRefresh = useCallback(
    async (connectionId: string, database: string) => {
      await loadDatabaseTables(connectionId, database, true); // Force refresh
    },
    [loadDatabaseTables]
  );

  const handleDatabaseClose = useCallback(
    (connectionId: string, database: string) => {
      const hasTabs = tabPanelRef.current?.hasDatabaseTabs(connectionId, database);
      const tabInfo = tabPanelRef.current?.getDatabaseTabInfo(connectionId, database);

      const doClose = () => {
        setConnectionDatabases((prev) => {
          const newData = { ...prev };
          if (newData[connectionId]) {
            newData[connectionId] = newData[connectionId].map((db) =>
              db.database === database ? { ...db, loaded: false, tables: [] } : db
            );
          }
          return newData;
        });
        setExpandedKeys((prev) =>
          prev.filter(
            (key) =>
              !key.startsWith(`db::${connectionId}::${database}`) &&
              !key.startsWith(`tables::${connectionId}::${database}`) &&
              !key.startsWith(`views::${connectionId}::${database}`) &&
              !key.startsWith(`table::${connectionId}::${database}`) &&
              !key.startsWith(`view::${connectionId}::${database}`)
          )
        );
        setTableStructures((prev) => {
          const newData = { ...prev };
          const keysToDelete = Object.keys(newData).filter(
            (key) => key.startsWith(`${connectionId}::${database}::`)
          );
          keysToDelete.forEach((key) => delete newData[key]);
          return newData;
        });
        if (selectedConnectionId === connectionId && selectedDatabase === database) {
          setSelectedTable(null);
          setSelectedDatabase(undefined);
        }
      };

      if (hasTabs && tabInfo && tabInfo.dataTabCount > 0) {
        Modal.confirm({
          title: '关闭关联标签页',
          content: `该数据库下还有 ${tabInfo.dataTabCount} 个数据表标签页处于打开状态，关闭数据库时是否一并关闭？`,
          okText: '关闭并关闭数据库',
          cancelText: '仅关闭数据库',
          onOk: () => {
            tabPanelRef.current?.closeDatabaseTabs(connectionId, database);
            doClose();
          },
          onCancel: () => {
            doClose();
          },
        });
      } else {
        doClose();
      }
    },
    [selectedConnectionId, selectedDatabase]
  );

  const handleLoadDatabases = useCallback(
    async (connectionId: string) => {
      try {
        const databases = await getDatabases(connectionId);
        const dbList = databases.map((db) => ({ database: db, tables: [], loaded: false }));
        setConnectionDatabases((prev) => ({
          ...prev,
          [connectionId]: dbList,
        }));
      } catch (error) {
        console.error('加载数据库列表失败:', error);
      }
    },
    [getDatabases]
  );

  const handleTableExpand = useCallback(
    async (connectionId: string, database: string, tableName: string) => {
      const tableKey = `${connectionId}::${database}::${tableName}`;

      // 如果已经加载过，跳过
      if (tableStructures[tableKey]?.loaded) return;

      try {
        const [columns, indexes] = await Promise.all([
          getColumns(connectionId, tableName, database),
          getIndexes(connectionId, tableName, database),
        ]);

        setTableStructures((prev) => ({
          ...prev,
          [tableKey]: { columns, indexes, loaded: true },
        }));
      } catch (error) {
        console.error('Failed to load table structure:', error);
        // 即使失败也标记为 loaded，避免重复请求
        setTableStructures((prev) => ({
          ...prev,
          [tableKey]: { columns: [], indexes: [], loaded: true },
        }));
      }
    },
    [tableStructures, getColumns, getIndexes]
  );

  const handleDisconnect = useCallback(
    (connectionId: string) => {
      const tabInfo = tabPanelRef.current?.getConnectionTabInfo(connectionId);
      const hasTabs = tabPanelRef.current?.hasConnectionTabs(connectionId);

      const doDisconnect = () => {
        setConnectionDatabases((prev) => {
          const next = { ...prev };
          delete next[connectionId];
          return next;
        });
        setExpandedKeys((prev) =>
          prev.filter((k) => {
            if (k === connectionId) return false;
            if (k.startsWith(`db::${connectionId}::`)) return false;
            if (k.startsWith(`tables::${connectionId}::`)) return false;
            if (k.startsWith(`views::${connectionId}::`)) return false;
            if (k.startsWith(`table::${connectionId}::`)) return false;
            if (k.startsWith(`view::${connectionId}::`)) return false;
            if (k.startsWith(`procedures::${connectionId}::`)) return false;
            if (k.startsWith(`functions::${connectionId}::`)) return false;
            return true;
          })
        );
        setTableStructures((prev) => {
          const next = { ...prev };
          const keysToDelete = Object.keys(next).filter((key) =>
            key.startsWith(`${connectionId}::`)
          );
          keysToDelete.forEach((key) => delete next[key]);
          return next;
        });
        if (selectedConnectionId === connectionId) {
          setSelectedConnectionId(null);
          setSelectedTable(null);
          setSelectedDatabase(undefined);
          setActiveConnection(null);
        }
        disconnect(connectionId);
      };

      if (hasTabs && tabInfo && (tabInfo.dataTabCount > 0 || tabInfo.sqlTabCount > 0)) {
        const tabDesc = [
          tabInfo.dataTabCount > 0 ? `${tabInfo.dataTabCount} 个数据表` : '',
          tabInfo.sqlTabCount > 0 ? `${tabInfo.sqlTabCount} 个 SQL 查询` : '',
        ]
          .filter(Boolean)
          .join('、');
        Modal.confirm({
          title: '关闭关联标签页',
          content: `该连接下还有 ${tabDesc} 标签页处于打开状态，断开连接时是否一并关闭？`,
          okText: '关闭并断开',
          cancelText: '仅断开',
          onOk: () => {
            tabPanelRef.current?.closeConnectionTabs(connectionId);
            doDisconnect();
          },
          onCancel: () => {
            doDisconnect();
          },
        });
      } else {
        doDisconnect();
      }
    },
    [disconnect, selectedConnectionId, setActiveConnection]
  );

  const handleEditConnection = useCallback((connection: Connection) => {
    setEditingConnection({
      id: connection.id,
      name: connection.name,
      dbType: connection.db_type,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: '',
      database: connection.database,
      group_id: connection.group_id,
    });
    setConnectionDialogOpen(true);
  }, []);

  const handleDeleteConnection = useCallback(
    (connectionId: string) => {
      deleteConnection(connectionId);
    },
    [deleteConnection]
  );

  const handleNewQuery = useCallback(
    (connectionId: string) => {
      setSelectedConnectionId(connectionId);
      setActiveConnection(connectionId);
      window.dispatchEvent(
        new CustomEvent('tab-action', { detail: { action: 'new-sql-tab' } })
      );
    },
    [setActiveConnection]
  );

  const handleEditTab = useCallback((targetKey: string, action: string) => {
    if (action === 'remove' && targetKey !== 'sql') {
      setSelectedTable(null);
    }
  }, []);

  useEffect(() => {
    const handleMenuAction = (event: CustomEvent<{ action: string }>) => {
      const { action } = event.detail;
      switch (action) {
        case 'new-connection':
          setConnectionDialogOpen(true);
          break;
        case 'options':
          setSettingsDialogOpen(true);
          break;
        case 'toggle-theme':
          window.dispatchEvent(new CustomEvent('app-action', { detail: { action } }));
          break;
        case 'refresh':
          if (selectedConnectionId && selectedDatabase) {
            loadDatabaseTables(selectedConnectionId, selectedDatabase, true);
          }
          break;
        case 'new-query':
          window.dispatchEvent(
            new CustomEvent('tab-action', { detail: { action: 'new-sql-tab' } })
          );
          break;
        case 'execute-query':
          window.dispatchEvent(
            new CustomEvent('tab-action', { detail: { action: 'execute-query' } })
          );
          break;
        case 'connect-selected':
          if (selectedConnectionId) {
            handleConnect(selectedConnectionId);
          }
          break;
        case 'disconnect':
          if (selectedConnectionId) {
            handleDisconnect(selectedConnectionId);
          }
          break;
        case 'save':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'save' } }));
          break;
        case 'import':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'import' } }));
          break;
        case 'export':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'export' } }));
          break;
        case 'undo':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'undo' } }));
          break;
        case 'redo':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'redo' } }));
          break;
        case 'cut':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'cut' } }));
          break;
        case 'copy':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'copy' } }));
          break;
        case 'paste':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'paste' } }));
          break;
        case 'delete':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'delete' } }));
          break;
        case 'select-all':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'select-all' } }));
          break;
        case 'find':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'find' } }));
          break;
        case 'zoom-in':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'zoom-in' } }));
          break;
        case 'zoom-out':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'zoom-out' } }));
          break;
        case 'zoom-reset':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'zoom-reset' } }));
          break;
        case 'fullscreen':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'fullscreen' } }));
          break;
        case 'close-all':
          window.dispatchEvent(
            new CustomEvent('tab-action', { detail: { action: 'close-all-tabs' } })
          );
          break;
        case 'exit':
          window.close();
          break;
        case 'new-tab':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'new-tab' } }));
          break;
        case 'close-tab':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'close-tab' } }));
          break;
        case 'next-tab':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'next-tab' } }));
          break;
        case 'prev-tab':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'prev-tab' } }));
          break;
        case 'documentation':
        case 'search':
        case 'check-update':
        case 'about':
          window.dispatchEvent(new CustomEvent('app-action', { detail: { action } }));
          break;
        case 'data-sync':
        case 'backup':
        case 'restore':
        case 'model-designer':
          console.log(`Menu action ${action} not yet implemented`);
          break;
        default:
          console.log(`Unknown menu action: ${action}`);
      }
    };

    window.addEventListener('menu-action', handleMenuAction);
    return () => {
      window.removeEventListener('menu-action', handleMenuAction);
    };
  }, [selectedConnectionId, selectedDatabase, loadDatabaseTables, handleConnect, handleDisconnect]);

  return (
    <Layout style={styles.root}>
      <Toolbar />

      <Layout style={styles.mainLayout}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          width={320}
          trigger={null}
          style={{ ...styles.sider }}
          className="sidebar-enhanced"
        >
          <div style={styles.siderContent} className="sidebar-content">
            {!collapsed && (
              <div style={styles.searchContainer} className="search-container">
                <GlobalSearch
                  placeholder="搜索..."
                  value={searchText}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  style={styles.searchInput}
                  size="small"
                  allowClear
                />
              </div>
            )}

            <div style={styles.connectionTreeContainer} className="connection-tree-container">
              <EnhancedConnectionTree
                connections={connections}
                groups={groups}
                selectedId={selectedConnectionId}
                selectedTableId={selectedTable}
                onSelect={handleConnectionSelect}
                onTableSelect={(table, database) => {
                  setSelectedTable(table);
                  setSelectedDatabase(database);
                }}
                onObjectTypeSelect={(objectType, database) => {
                  setSelectedObjectType(objectType);
                  setSelectedDatabase(database);
                }}
                onTableOpen={(tableName, database) => {
                  setTableToOpen(null);
                  setTimeout(() => {
                    setTableToOpen({ name: tableName, database });
                  }, 0);
                }}
                onExpand={handleConnectionExpand}
                collapsed={collapsed}
                searchText={debouncedSearch}
                expandedKeys={expandedKeys}
                onExpandKeys={setExpandedKeys}
                connectionDatabases={connectionDatabases}
                isLoading={isLoading}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onEditConnection={handleEditConnection}
                onDeleteConnection={handleDeleteConnection}
                onNewQuery={handleNewQuery}
                onDatabaseExpand={handleDatabaseExpand}
                onDatabaseRefresh={handleDatabaseRefresh}
                onDatabaseClose={handleDatabaseClose}
                onLoadDatabases={handleLoadDatabases}
                onTableExpand={handleTableExpand}
                onSaveConnection={handleSaveConnection}
                onSaveGroup={handleSaveGroup}
                onDeleteGroup={handleDeleteGroup}
                onCreateConnection={() => setConnectionDialogOpen(true)}
              />
            </div>

            <div
              onClick={() => setCollapsed(!collapsed)}
              style={styles.collapseButton}
              className="collapse-button"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--background-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--background-card)';
              }}
            >
              <span style={styles.collapseButtonText}>{collapsed ? '展开' : '收起'}</span>
            </div>
          </div>
        </Sider>

        <Content style={styles.content}>
          <div style={styles.tabPanelContainer}>
            <TabPanel
              ref={tabPanelRef}
              selectedConnectionId={selectedConnectionId}
              selectedConnectionName={
                selectedConnectionId
                  ? connections.find((c) => c.id === selectedConnectionId)?.name
                  : undefined
              }
              selectedTable={selectedTable}
              selectedDatabase={selectedDatabase}
              selectedObjectType={selectedObjectType}
              tableToOpen={tableToOpen}
              onSqlTabCountChange={setSqlTabCount}
              pageSize={useSettingsStore.getState().settings.pageSize}
            />
          </div>

          {/* 日志面板：仅在有 SQL 查询 Tab 时显示 */}
          {sqlTabCount > 0 && !logPanelCollapsed && (
            <LogPanel onCollapse={() => setLogPanelCollapsed(true)} />
          )}

          {sqlTabCount > 0 && logPanelCollapsed && (
            <div style={styles.logPanelCollapsed}>
              <a onClick={() => setLogPanelCollapsed(false)} style={styles.logLink}>
                显示日志
              </a>
            </div>
          )}
        </Content>
      </Layout>

      <StatusBar
        selectedConnectionId={selectedConnectionId}
        connections={connections}
        selectedTable={selectedTable}
      />

      <ConnectionDialog
        open={connectionDialogOpen}
        editingData={editingConnection}
        onCancel={() => {
          setConnectionDialogOpen(false);
          setEditingConnection(undefined);
        }}
        onSave={async (data) => {
          await handleDialogSave(data);
          setEditingConnection(undefined);
        }}
      />

      <SettingsDialog open={settingsDialogOpen} onCancel={() => setSettingsDialogOpen(false)} />
    </Layout>
  );
}

export const MainLayout = React.memo(MainLayoutComponent);
