import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { WindowSetTitle } from '../../wailsjs/runtime/runtime';
import { Layout, Form, Input, Modal, Tooltip } from 'antd';
import { ReloadOutlined, AppstoreOutlined } from '@ant-design/icons';
import { GlobalInput } from './GlobalInput';
import { GlobalSearch } from './GlobalSearch';
import { Favorites } from './Favorites';
import { useInitApp } from '../hooks/useApi';
import { Toolbar } from './Toolbar';

import { EnhancedConnectionTree } from './ConnectionTree/EnhancedConnectionTree';
import { TabPanel, type TabPanelRef } from './TabPanel';
import { StatusBar } from './StatusBar';
import { AIChatPanel } from './AIChatPanel';
import { ConnectionDialog } from './ConnectionDialog';
import { ConnectionExportDialog } from './ConnectionExportDialog';
import { BatchManageDialog } from './ConnectionTree/BatchManageDialog';
import { SettingsDialog } from './SettingsDialog';
import { OperationLog } from './OperationLog';
import { UpdateDialog } from './UpdateDialog';
import { DocGeneratorDialog } from './DocGeneratorDialog';
import { DataMigrationDialog } from './DataMigrationDialog';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { api } from '../api';
import { useConnectionManager } from './MainLayout/hooks/useConnectionManager';
import { useTabManager } from './MainLayout/hooks/useTabManager';
import { useLayoutActions } from './MainLayout/hooks/useLayoutActions';

const { Sider, Content } = Layout;

function MainLayoutComponent() {
  const { t } = useTranslation();

  useInitApp();

  // Create shared ref in parent to break circular dependency between hooks
  const tabPanelRef = useRef<TabPanelRef>(null);

  // Connection management hook
  const connMgr = useConnectionManager({ tabPanelRef });

  // Tab management hook
  const tabMgr = useTabManager({
    selectedConnectionId: connMgr.selectedConnectionId,
    connections: connMgr.connections,
  });

  // Layout actions hook
  const layout = useLayoutActions({
    selectedConnectionId: connMgr.selectedConnectionId,
    selectedDatabase: connMgr.selectedDatabase,
    expandedKeys: connMgr.expandedKeys,
    setExpandedKeys: connMgr.setExpandedKeys,
    connectionDatabases: connMgr.connectionDatabases,
    connections: connMgr.connections,
    loadDatabaseTables: connMgr.loadDatabaseTables,
    handleConnect: connMgr.handleConnect,
    handleDisconnect: connMgr.handleDisconnect,
    handleNewQuery: connMgr.handleNewQuery,
    setConnectionDialogOpen: connMgr.setConnectionDialogOpen,
    setConnectionExportOpen: connMgr.setConnectionExportOpen,
  });

  // 动态更新窗口标题
  useEffect(() => {
    const connectionName = connMgr.selectedConnectionId
      ? connMgr.connections.find((c) => c.id === connMgr.selectedConnectionId)?.name
      : undefined;
    const parts: string[] = [];
    if (connectionName) parts.push(connectionName);
    if (tabMgr.activeTabInfo.database) parts.push(tabMgr.activeTabInfo.database);
    if (tabMgr.activeTabInfo.title && tabMgr.activeTabInfo.type !== 'objects') parts.push(tabMgr.activeTabInfo.title);
    const title = parts.length > 0 ? `${parts.join(' > ')} - iDBLink` : 'iDBLink';
    document.title = title;

    // Wails 窗口标题
    if (typeof window !== 'undefined' && (window as any).runtime) {
      try {
        WindowSetTitle(title);
      } catch {
        // fallback silently
      }
    }
  }, [connMgr.selectedConnectionId, connMgr.connections, tabMgr.activeTabInfo]);

  // AI 面板"应用到编辑器"：注入 SQL 到当前 SQL tab，无 SQL tab 则自动新建
  const handleInjectSQL = (sql: string, mode: 'append' | 'replace') => {
    const info = tabPanelRef.current?.getActiveTabInfo();
    if (info?.type === 'sql') {
      window.dispatchEvent(new CustomEvent('ai-sql-inject', { detail: { mode, sql } }));
    } else {
      tabPanelRef.current?.openSqlTab({
        connectionId: info?.connectionId || connMgr.selectedConnectionId || undefined,
        database: info?.database || connMgr.selectedDatabase,
        defaultQuery: sql,
      });
    }
  };

  return (
    <Layout style={layout.styles.root}>
      <Toolbar
        sidebarCollapsed={layout.collapsed}
        onToggleSidebar={() => layout.setCollapsed(!layout.collapsed)}
      />

      <Layout style={layout.styles.mainLayout}>
        <Sider
          collapsible
          collapsed={layout.collapsed}
          onCollapse={(value) => layout.setCollapsed(value)}
          width={320}
          collapsedWidth={0}
          trigger={null}
          style={{ ...layout.styles.sider }}
          className="sidebar-enhanced"
        >
          <div style={layout.styles.siderContent} className="sidebar-content">
            {!layout.collapsed && (
              <div
                style={{ ...layout.styles.searchContainer, display: 'flex', alignItems: 'center', gap: 4 }}
                className="search-container"
              >
                <GlobalInput
                  placeholder={t('common.connectionTreeSearchPlaceholder')}
                  value={layout.searchText}
                  onChange={(e: any) => layout.handleSearchChange(e.target.value)}
                  style={{ ...layout.styles.searchInput, flex: 1, minWidth: 0 }}
                  size="small"
                  allowClear
                />
                {connMgr.connections.length > 0 && (
                  <Tooltip title={t('common.mainLayout.refreshConnections')}>
                    <span
                      className="hoverable hoverable-primary"
                      onClick={() => {
                        const currentConns = useAppStore.getState().connections;
                        const statusMap = new Map(currentConns.map((c) => [c.id, c.status]));
                        api.getConnections().then((conns) => {
                          useAppStore.getState().setConnections(
                            conns.map((c) => ({
                              ...c,
                              status: statusMap.get(c.id) || ('disconnected' as const),
                            }))
                          );
                        });
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        color: 'var(--text-tertiary)',
                        width: 24,
                        height: 24,
                        borderRadius: 4,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <ReloadOutlined />
                    </span>
                  </Tooltip>
                )}
                {connMgr.connections.length > 1 && (
                  <Tooltip title={t('common.batchManage.title')}>
                    <span
                      className="hoverable hoverable-primary"
                      onClick={() => connMgr.setBatchManageOpen(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        color: 'var(--text-tertiary)',
                        width: 24,
                        height: 24,
                        borderRadius: 4,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <AppstoreOutlined />
                    </span>
                  </Tooltip>
                )}
              </div>
            )}

             <div style={layout.styles.connectionTreeContainer} className="connection-tree-container">
               <EnhancedConnectionTree
                 connections={connMgr.connections}
                 groups={connMgr.groups}
                 selectedId={connMgr.selectedConnectionId}
                 selectedTableId={connMgr.selectedTable}
                  onSelect={(id) => {
                    connMgr.setSelectedConnectionId(id);
                    connMgr.setSelectedTable(null);
                    connMgr.setSelectedSchema(undefined);
                  }}
                 onTableSelect={(table, database) => {
                   connMgr.setSelectedTable(table);
                   connMgr.setSelectedDatabase(database);
                 }}
                  onObjectTypeSelect={(objectType, _database, schema) => {
                    tabMgr.setSelectedObjectType(objectType);
                    connMgr.setSelectedSchema(schema);
                  }}
                 onTableOpen={(tableName, database) => {
                   tabMgr.setTableToOpen(null);
                   setTimeout(() => {
                     tabMgr.setTableToOpen({ name: tableName, database });
                   }, 0);
                 }}
                  onOpenDesigner={(tableName) => {
                    tabPanelRef.current?.openDesignerTab(tableName);
                  }}
                  onViewOpen={(viewName, database) => {
                    tabMgr.setTableToOpen(null);
                    setTimeout(() => {
                      tabMgr.setTableToOpen({ name: viewName, database, isView: true });
                    }, 0);
                  }}
                  onExpand={(connectionId, expanded) => {
                   if (expanded) {
                     connMgr.setExpandedKeys((prev) => [...prev, connectionId]);
                   } else {
                     connMgr.setExpandedKeys((prev) => prev.filter((k) => k !== connectionId));
                   }
                 }}
                 collapsed={layout.collapsed}
                 searchText={layout.debouncedSearch}
                 onClearSearch={() => layout.handleSearchChange('')}
                 expandedKeys={connMgr.expandedKeys}
                 onExpandKeys={connMgr.setExpandedKeys}
                 connectionDatabases={connMgr.connectionDatabases}
                 isLoading={connMgr.isLoading}
                 onConnect={connMgr.handleConnect}
                 onDisconnect={connMgr.handleDisconnect}
                 onEditConnection={connMgr.handleEditConnection}
                 onDeleteConnection={connMgr.handleDeleteConnection}
                 onNewQuery={connMgr.handleNewQuery}
                 onDatabaseExpand={connMgr.handleDatabaseExpand}
                 onDatabaseRefresh={connMgr.handleDatabaseRefresh}
                 onDatabaseClose={connMgr.handleDatabaseClose}
                 onDatabaseProperties={connMgr.handleDatabaseProperties}
                 onLoadDatabases={connMgr.handleLoadDatabases}
                 onTableExpand={connMgr.handleTableExpand}
                 onSaveConnection={async (data: any) => {
                   await connMgr.saveConnection(data);
                 }}
                 onSaveGroup={connMgr.saveGroup}
                 onDeleteGroup={connMgr.deleteGroup}
                  onCreateConnection={() => connMgr.setConnectionDialogOpen(true)}
                   onImportConnections={() => connMgr.setConnectionExportOpen(true)}
                   onBatchManage={() => connMgr.setBatchManageOpen(true)}
                   onRefreshConnections={() => {
                     const currentConns = useAppStore.getState().connections;
                     const statusMap = new Map(currentConns.map((c) => [c.id, c.status]));
                     api.getConnections().then((conns) => {
                       useAppStore.getState().setConnections(
                         conns.map((c) => ({
                           ...c,
                           status: statusMap.get(c.id) || ('disconnected' as const),
                         }))
                       );
                     });
                   }}
             />
           </div>
          </div>
        </Sider>

        <Content style={layout.styles.content}>
          <div style={layout.styles.tabPanelContainer}>
            <TabPanel
              ref={tabPanelRef}
              selectedConnectionId={connMgr.selectedConnectionId}
              selectedConnectionName={
                connMgr.selectedConnectionId
                  ? connMgr.connections.find((c) => c.id === connMgr.selectedConnectionId)?.name
                  : undefined
              }
              selectedTable={connMgr.selectedTable}
              selectedDatabase={connMgr.selectedDatabase}
              selectedSchema={connMgr.selectedSchema}
              selectedObjectType={tabMgr.selectedObjectType}
              tableToOpen={tabMgr.tableToOpen}
              onSqlTabCountChange={tabMgr.setSqlTabCount}
              onActiveTabChange={tabMgr.setActiveTabInfo}
              onQueryStatusChange={tabMgr.setIsQuerying}
              onEnsureConnectionReady={(connectionId) => {
                const conn = useAppStore.getState().connections.find((c) => c.id === connectionId);
                if (conn && conn.status !== 'connected') {
                  // 复用连接树的连接流程：建连 + 加载数据库列表 + 密码弹框兜底
                  connMgr.handleConnect(connectionId).catch(() => {
                    // 连接失败时连接树/全局提示已有反馈，查询 Tab 保持数据库"未加载"态
                  });
                }
              }}
              pageSize={useSettingsStore.getState().settings.pageSize}
              connectionDatabases={connMgr.connectionDatabases}
            />
          </div>
        </Content>
      </Layout>

      <StatusBar
        selectedConnectionId={connMgr.selectedConnectionId}
        connections={connMgr.connections}
        selectedTable={connMgr.selectedTable}
        selectedDatabase={connMgr.selectedDatabase}
        transactionActive={tabMgr.transactionActive}
        transactionStartTime={useAppStore.getState().transactionStartTime}
        resultRows={tabMgr.currentResultRows}
        executionTime={tabMgr.currentExecutionTime}
        isQuerying={tabMgr.isQuerying}
      />

      {/* 全局 AI 聊天面板（独立于 tab，全局可用） */}
      <AIChatPanel
        connections={connMgr.connections}
        selectedConnectionId={connMgr.selectedConnectionId}
        connectionDatabases={connMgr.connectionDatabases}
        onApplySQL={handleInjectSQL}
        onOpenSettings={() => window.dispatchEvent(new CustomEvent('menu-action', { detail: { action: 'options' } }))}
      />

      <ConnectionDialog
        open={connMgr.connectionDialogOpen}
        editingData={connMgr.editingConnection}
        onCancel={() => {
          connMgr.setConnectionDialogOpen(false);
          connMgr.setEditingConnection(undefined);
        }}
        onSave={async (data) => {
          await connMgr.handleDialogSave(data);
          connMgr.setEditingConnection(undefined);
        }}
      />

      <SettingsDialog open={layout.settingsDialogOpen} onCancel={() => layout.setSettingsDialogOpen(false)} />

      <ConnectionExportDialog
        open={connMgr.connectionExportOpen}
        onClose={() => connMgr.setConnectionExportOpen(false)}
        onImported={() => {
          const store = useAppStore.getState();
          store.setConnections([]);
          api.getConnections().then((conns) => {
            store.setConnections(conns.map((c) => ({ ...c, status: 'disconnected' as const })));
          });
          api.getGroups().then((groups) => {
            store.setGroups(groups);
          });
        }}
      />

      <BatchManageDialog
        open={connMgr.batchManageOpen}
        connections={connMgr.connections}
        groups={connMgr.groups}
        onClose={() => connMgr.setBatchManageOpen(false)}
        onSaveConnection={async (data: any) => {
          await connMgr.saveConnection(data);
        }}
        onRefresh={() => {
          api.getConnections().then((conns) => {
            const store = useAppStore.getState();
            store.setConnections(conns.map((c) => ({ ...c, status: 'disconnected' as const })));
          });
        }}
      />

      <GlobalSearch
        open={layout.globalSearchOpen}
        onClose={() => layout.setGlobalSearchOpen(false)}
        onSelectTable={(connectionId, database, tableName) => {
          connMgr.setSelectedConnectionId(connectionId);
          connMgr.setSelectedDatabase(database);
          tabMgr.setTableToOpen({ name: tableName, database });
        }}
        connectionDatabases={connMgr.connectionDatabases}
      />

      <Favorites
        open={layout.favoritesOpen}
        onClose={() => layout.setFavoritesOpen(false)}
        onSelectTable={(connectionId, database, tableName) => {
          connMgr.setSelectedConnectionId(connectionId);
          connMgr.setSelectedDatabase(database);
          tabMgr.setTableToOpen({ name: tableName, database });
        }}
        onSelectQuery={(sql) => {
          if (connMgr.selectedConnectionId) {
            window.dispatchEvent(
              new CustomEvent('tab-action', { detail: { action: 'new-sql-tab', sql } })
            );
          }
        }}
      />

      <Modal
        title={`${t('common.connectionPasswordRequired', { name: connMgr.passwordDialogConn?.name })}`}
        open={connMgr.passwordDialogOpen}
        onOk={connMgr.handlePasswordSubmit}
        onCancel={() => {
          connMgr.setPasswordDialogOpen(false);
          connMgr.passwordForm.resetFields();
        }}
        okText={t('common.mainLayout.connect')}
        cancelText={t('common.cancel')}
        destroyOnClose
        transitionName=""
        maskTransitionName=""
      >
        <Form form={connMgr.passwordForm} layout="vertical">
          <Form.Item
            name="password"
            rules={[{ required: true, message: t('common.passwordRequired') }]}
          >
            <Input.Password autoFocus placeholder={t('common.enterDatabasePassword')} />
          </Form.Item>
        </Form>
      </Modal>

      <OperationLog open={layout.operationLogOpen} onClose={() => layout.setOperationLogOpen(false)} />

      <UpdateDialog open={layout.updateDialogOpen} onClose={() => layout.setUpdateDialogOpen(false)} />

      {layout.docGeneratorOpen && layout.docGeneratorConnId && layout.docGeneratorDatabase && (
        <DocGeneratorDialog
          open={layout.docGeneratorOpen}
          onClose={() => layout.setDocGeneratorOpen(false)}
          connectionId={layout.docGeneratorConnId}
          database={layout.docGeneratorDatabase}
        />
      )}

      <DataMigrationDialog
        open={layout.migrationDialogOpen}
        onClose={() => layout.setMigrationDialogOpen(false)}
      />
    </Layout>
  );
}

export const MainLayout = React.memo(MainLayoutComponent);
