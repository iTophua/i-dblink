import React, { useState, useCallback, useEffect } from 'react';
import { Layout, Input, theme } from 'antd';
import { useConnections, useDatabase, useInitApp } from '../hooks/useApi';
import { Toolbar } from './Toolbar';
import { ConnectionTree } from './ConnectionTree';
import { TabPanel } from './TabPanel';
import { StatusBar } from './StatusBar';
import { ConnectionDialog } from './ConnectionDialog';
import { LogPanel } from './LogPanel';
import type { TableInfo } from '../types/api';
import type { ConnectionFormData } from './ConnectionDialog';

const { Sider, Content } = Layout;
const { Search } = Input;

interface MainLayoutProps {
  children?: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [logPanelCollapsed, setLogPanelCollapsed] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [connectionTables, setConnectionTables] = useState<Record<string, TableInfo[]>>({});
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);

  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';

  const {
    connections,
    groups,
    isLoading,
    setActiveConnection,
    saveConnection,
  } = useConnections();

  const { getTables } = useDatabase();

  useInitApp();

  useEffect(() => {
    const handleMenuAction = (event: CustomEvent<{ action: string }>) => {
      const { action } = event.detail;
      if (action === 'new-connection') {
        setConnectionDialogOpen(true);
      }
    };

    window.addEventListener('menu-action' as any, handleMenuAction as any);
    return () => {
      window.removeEventListener('menu-action' as any, handleMenuAction as any);
    };
  }, []);

  const handleSaveConnection = useCallback(async (data: ConnectionFormData) => {
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
  }, [saveConnection]);

  const handleConnectionExpand = useCallback(async (connectionId: string, expanded: boolean) => {
    if (expanded && !connectionTables[connectionId]) {
      try {
        const tables = await getTables(connectionId);
        setConnectionTables(prev => ({
          ...prev,
          [connectionId]: tables,
        }));
      } catch (error) {
        console.error('Failed to load tables:', error);
      }
    }
  }, [connectionTables, getTables]);

  const handleTableSelect = useCallback((table: string | null) => {
    setSelectedTable(table);
  }, []);

  const handleConnectionSelect = useCallback((id: string | null) => {
    setSelectedConnectionId(id);
    setActiveConnection(id);
  }, [setActiveConnection]);

  const handleEditTab = useCallback((targetKey: string, action: string) => {
    if (action === 'remove' && targetKey !== 'sql') {
      setSelectedTable(null);
    }
  }, []);

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Toolbar />

      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          width={260}
          trigger={null}
          style={{
            background: isDarkMode ? '#1f1f1f' : '#fff',
            borderRight: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              height: 32,
              margin: collapsed ? '4px 8px' : '4px 8px',
              background: isDarkMode ? 'rgba(24, 144, 255, 0.1)' : 'rgba(24, 144, 255, 0.05)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: token.colorPrimary,
              fontSize: 14,
              border: `1px solid ${isDarkMode ? 'rgba(24, 144, 255, 0.3)' : 'rgba(24, 144, 255, 0.2)'}`,
              transition: 'all 0.3s ease',
              flexShrink: 0,
            }}
          >
            {collapsed ? 'iDB' : 'i-dblink'}
          </div>

          {!collapsed && (
            <div style={{ padding: '0 8px', marginBottom: 4, flexShrink: 0 }}>
              <Search
                placeholder="搜索..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  borderRadius: 4,
                  background: isDarkMode ? '#141414' : '#fafafa',
                }}
                size="small"
                allowClear
              />
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto', minHeight: 0, marginBottom: 0 }}>
            <ConnectionTree
              connections={connections}
              groups={groups}
              selectedId={selectedConnectionId}
              selectedTableId={selectedTable}
              onSelect={handleConnectionSelect}
              onTableSelect={handleTableSelect}
              onTableOpen={handleTableSelect}
              onExpand={handleConnectionExpand}
              collapsed={collapsed}
              searchText={searchText}
              expandedKeys={expandedKeys}
              onExpandKeys={setExpandedKeys}
              connectionTables={connectionTables}
              isLoading={isLoading}
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
            <span style={{
              color: isDarkMode ? '#bfbfbf' : '#595959',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              {collapsed ? '展开' : '收起'}
            </span>
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
          }}
        >
          <TabPanel
            selectedConnectionId={selectedConnectionId}
            selectedTable={selectedTable}
            onTableOpen={handleTableSelect}
          />

          {!logPanelCollapsed && (
            <LogPanel onCollapse={() => setLogPanelCollapsed(true)} />
          )}

          {logPanelCollapsed && (
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
        onCancel={() => setConnectionDialogOpen(false)}
        onSave={handleSaveConnection}
      />
    </Layout>
  );
}
