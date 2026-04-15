import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Layout, Input, theme } from 'antd';
import { useConnections, useDatabase, useGroups, useInitApp } from '../hooks/useApi';
import { Toolbar } from './Toolbar';
import { ConnectionTree } from './ConnectionTree';
import { TabPanel } from './TabPanel';
import { StatusBar } from './StatusBar';
import { ConnectionDialog } from './ConnectionDialog';
import { LogPanel } from './LogPanel';
import { SettingsDialog } from './SettingsDialog';
import type { TableInfo, ColumnInfo, IndexInfo } from '../types/api';
import type { ConnectionFormData } from './ConnectionDialog';
import type { Connection } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';

const { Sider, Content } = Layout;
const { Search } = Input;

interface MainLayoutProps {
  children?: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState<string | undefined>();
  // 双击表时触发，用于在 TabPanel 中打开新 Tab
  const [tableToOpen, setTableToOpen] = useState<{ name: string; database?: string } | null>(null);
  const [logPanelCollapsed, setLogPanelCollapsed] = useState(false);
  const [sqlTabCount, setSqlTabCount] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [connectionDatabases, setConnectionDatabases] = useState<
    Record<string, { database: string; tables: TableInfo[]; loaded: boolean }[]>
  >({});
  const [tableStructures, setTableStructures] = useState<
    Record<string, { columns: ColumnInfo[]; indexes: IndexInfo[]; loaded: boolean }>
  >({});
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionFormData | undefined>();
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';

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

  useEffect(() => {
    const handleMenuAction = (event: CustomEvent<{ action: string }>) => {
      const { action } = event.detail;
      if (action === 'new-connection') {
        setConnectionDialogOpen(true);
      } else if (action === 'options') {
        setSettingsDialogOpen(true);
      }
    };

    window.addEventListener('menu-action' as any, handleMenuAction as any);
    return () => {
      window.removeEventListener('menu-action' as any, handleMenuAction as any);
    };
  }, []);

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
      try {
        const tables = await getTables(connectionId, database, forceRefresh);

        setConnectionDatabases((prev) => {
          const dbList = prev[connectionId] || [];
          const dbIndex = dbList.findIndex((db) => db.database === database);

          if (dbIndex >= 0) {
            const newDbList = [...dbList];
            newDbList[dbIndex] = { ...dbList[dbIndex], tables, loaded: true };
            return {
              ...prev,
              [connectionId]: newDbList,
            };
          } else {
            return {
              ...prev,
              [connectionId]: [...dbList, { database, tables, loaded: true }],
            };
          }
        });
      } catch (error) {
        console.error(`Failed to load tables for ${database}:`, error);
        // 即使加载失败也要设置 loaded 为 true，避免一直显示"加载中"
        setConnectionDatabases((prev) => {
          const dbList = prev[connectionId] || [];
          const dbIndex = dbList.findIndex((db) => db.database === database);

          if (dbIndex >= 0) {
            const newDbList = [...dbList];
            newDbList[dbIndex] = { ...dbList[dbIndex], loaded: true };
            return {
              ...prev,
              [connectionId]: newDbList,
            };
          } else {
            return {
              ...prev,
              [connectionId]: [...dbList, { database, tables: [], loaded: true }],
            };
          }
        });
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
      try {
        await connect(connectionId);
        const databases = await getDatabases(connectionId);
        const dbList = databases.map((db) => ({ database: db, tables: [], loaded: false }));
        setConnectionDatabases((prev) => ({
          ...prev,
          [connectionId]: dbList,
        }));
        setExpandedKeys((prev) => [...prev, connectionId]);
      } catch (error) {
        // 连接失败时静默处理或显示消息
      }
    },
    [connect, getDatabases]
  );

  const handleDatabaseExpand = useCallback(
    async (connectionId: string, database: string) => {
      await loadDatabaseTables(connectionId, database);
    },
    [loadDatabaseTables]
  );

  const handleDatabaseRefresh = useCallback(
    async (connectionId: string, database: string) => {
      await loadDatabaseTables(connectionId, database, true); // Force refresh
    },
    [loadDatabaseTables]
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
      disconnect(connectionId);
      setConnectionDatabases((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
      setExpandedKeys((prev) => prev.filter((k) => k !== connectionId));
    },
    [disconnect]
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
    },
    [setActiveConnection]
  );

  const handleEditTab = useCallback((targetKey: string, action: string) => {
    if (action === 'remove' && targetKey !== 'sql') {
      setSelectedTable(null);
    }
  }, []);

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Toolbar />

      <Layout style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          width={320}
          trigger={null}
          style={{
            background: isDarkMode ? '#1f1f1f' : '#fff',
            borderRight: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {!collapsed && (
            <div style={{ padding: '8px 8px 4px', flexShrink: 0 }}>
              <Search
                placeholder="搜索..."
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
                style={{
                  borderRadius: 4,
                  background: isDarkMode ? '#141414' : '#fafafa',
                }}
                size="small"
                allowClear
              />
            </div>
          )}

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              marginBottom: 0,
            }}
          >
            <ConnectionTree
              connections={connections}
              groups={groups}
              selectedId={selectedConnectionId}
              selectedTableId={selectedTable}
              onSelect={handleConnectionSelect}
              onTableSelect={(table, database) => {
                setSelectedTable(table);
                setSelectedDatabase(database);
              }}
              onTableOpen={(tableName, database) => {
                // Double-click tree table → open new tab
                setTableToOpen({ name: tableName, database });
              }}
              onExpand={handleConnectionExpand}
              collapsed={collapsed}
              searchText={debouncedSearch}
              expandedKeys={expandedKeys}
              onExpandKeys={setExpandedKeys}
              connectionDatabases={connectionDatabases}
              tableStructures={tableStructures}
              isLoading={isLoading}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onEditConnection={handleEditConnection}
              onDeleteConnection={handleDeleteConnection}
              onNewQuery={handleNewQuery}
              onDatabaseExpand={handleDatabaseExpand}
              onDatabaseRefresh={handleDatabaseRefresh}
              onLoadDatabases={handleLoadDatabases}
              onTableExpand={handleTableExpand}
              onSaveConnection={handleSaveConnection}
              onSaveGroup={handleSaveGroup}
              onDeleteGroup={handleDeleteGroup}
            />
          </div>

          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{
              height: 28,
              flexShrink: 0,
              background: isDarkMode ? '#141414' : '#fafafa',
              borderTop: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDarkMode ? '#1f1f1f' : '#f0f0f0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDarkMode ? '#141414' : '#fafafa';
            }}
          >
            <span
              style={{
                color: isDarkMode ? '#bfbfbf' : '#595959',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {collapsed ? '展开' : '收起'}
            </span>
          </div>
          </div>
        </Sider>

        <Content
          style={{
            flex: 1,
            background: isDarkMode ? '#1f1f1f' : '#fff',
            margin: 0,
            marginLeft: 0,
            padding: 0,
            borderRadius: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <TabPanel
              selectedConnectionId={selectedConnectionId}
              selectedTable={selectedTable}
              selectedDatabase={selectedDatabase}
              tableToOpen={tableToOpen}
              onSqlTabCountChange={setSqlTabCount}
              pageSize={useSettingsStore.getState().settings.pageSize}
            />
          </div>

          {/* 日志面板：仅在有 SQL 查询 Tab 时显示 */}
          {sqlTabCount > 0 && !logPanelCollapsed && <LogPanel onCollapse={() => setLogPanelCollapsed(true)} />}

          {sqlTabCount > 0 && logPanelCollapsed && (
            <div
              style={{
                height: 28,
                borderTop: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
                background: isDarkMode ? '#141414' : '#fafafa',
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <a
                onClick={() => setLogPanelCollapsed(false)}
                style={{ fontSize: 12, color: isDarkMode ? '#177ddc' : '#1890ff' }}
              >
                显示日志
              </a>
            </div>
          )}
        </Content>
      </Layout>

      <StatusBar
        isDarkMode={isDarkMode}
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

      <SettingsDialog
        open={settingsDialogOpen}
        onCancel={() => setSettingsDialogOpen(false)}
      />
    </Layout>
  );
}
