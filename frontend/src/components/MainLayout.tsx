import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Window as WailsWindow } from '@wailsio/runtime';
import { Layout, Form, Input, Modal, Tooltip, message } from 'antd';
import {
  ReloadOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  PlusOutlined,
  SettingOutlined,
  SearchOutlined,
  DatabaseOutlined,
  TableOutlined,
  EyeOutlined,
  BookOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { GlobalInput } from './GlobalInput';
import { GlobalSearch } from './GlobalSearch';
import { Favorites } from './Favorites';
import { CommandPalette, type Command } from './CommandPalette';
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
import { api, EventsOn } from '../api';
import { getErrorMessage } from '../utils/getErrorMessage';
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

    // Wails 窗口标题（纯浏览器环境下调用会 reject，静默忽略）
    WailsWindow.SetTitle(title).catch(() => {
      // fallback silently
    });
  }, [connMgr.selectedConnectionId, connMgr.connections, tabMgr.activeTabInfo]);

  // AI 面板"应用到编辑器"：注入 SQL 到当前 SQL tab，无 SQL tab 则自动新建
  const handleInjectSQL = useCallback(
    (sql: string, mode: 'append' | 'replace') => {
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
    },
    [connMgr.selectedConnectionId, connMgr.selectedDatabase]
  );

  // ── ⌘K 全域命令面板（动作/连接/表/片段/历史 五类索引）──
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSnippets, setPaletteSnippets] = useState<
    Array<{ id: string; name: string; sql_text: string }>
  >([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 打开时拉一次片段（后端 localdb，量小）
  useEffect(() => {
    if (!paletteOpen) return;
    let alive = true;
    api
      .getSnippets()
      .then((list) => {
        if (alive) setPaletteSnippets(Array.isArray(list) ? list.slice(0, 30) : []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [paletteOpen]);

  // 汇总各连接的执行历史（localStorage，取最近 10 条）
  const paletteHistory = useMemo(() => {
    const items: Array<{ sql: string; timestamp: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('sql-history')) continue;
      try {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(arr)) items.push(...arr.slice(0, 20));
      } catch {
        // 忽略损坏的存储项
      }
    }
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items.slice(0, 10);
    // paletteOpen 变化时重扫即可，避免每次渲染遍历 localStorage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen]);

  // palette 的片段/历史动作经事件转发执行（避免在渲染期构建的 commands 里
  // 捕获含 ref 的函数，react-compiler 会拒绝）
  useEffect(() => {
    const onInject = (e: Event) => {
      const sql = (e as CustomEvent<{ sql: string }>).detail?.sql || '';
      handleInjectSQL(sql, 'replace');
    };
    window.addEventListener('palette-inject-sql', onInject);
    return () => window.removeEventListener('palette-inject-sql', onInject);
  }, [handleInjectSQL]);

  // ── 双击 .sql / 拖放文件打开（Wails v3 文件能力）──
  useEffect(() => {
    let cancelled = false;
    const openSqlFile = (path: string) => {
      const name = path.split(/[\\/]/).pop() || 'query.sql';
      api
        .readSqlFile(path)
        .then((content) => {
          if (cancelled) return;
          tabPanelRef.current?.openSqlTab({ title: name, defaultQuery: content });
        })
        .catch((err) => {
          message.error(`${t('common.mainLayout.openSqlFileFailed')}: ${getErrorMessage(err)}`);
        });
    };
    // 冷启动：双击 .sql 拉起应用，启动后取待打开路径
    api
      .takePendingOpenFile()
      .then((p) => {
        if (p && !cancelled) openSqlFile(p);
      })
      .catch(() => {});
    // 已运行实例：双击 .sql（单实例转发）与窗口拖放经事件推送
    const offOpen = EventsOn('open-sql-file', (path: string) => openSqlFile(path));
    const offDrop = EventsOn('files-dropped', (files: string[]) => {
      const sqlFiles = (files || []).filter((f) => /\.sql$/i.test(f));
      sqlFiles.forEach((f) => openSqlFile(f));
      if ((files || []).length > sqlFiles.length) {
        message.info(t('common.mainLayout.dropUnsupported'));
      }
    });
    return () => {
      cancelled = true;
      offOpen();
      offDrop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paletteCommands = useMemo((): Command[] => {
    const dispatch = (action: string) =>
      window.dispatchEvent(new CustomEvent('menu-action', { detail: { action } }));
    const cmds: Command[] = [
      {
        id: 'act-new-sql',
        label: t('common.newQueryBtn'),
        category: t('common.commands'),
        icon: <ThunderboltOutlined />,
        action: () => dispatch('new-query'),
      },
      {
        id: 'act-new-conn',
        label: t('common.newConnectionBtn'),
        category: t('common.commands'),
        icon: <PlusOutlined />,
        action: () => dispatch('new-connection'),
      },
      {
        id: 'act-search',
        label: t('common.mainLayout.globalSearch'),
        category: t('common.commands'),
        icon: <SearchOutlined />,
        action: () => layout.setGlobalSearchOpen(true),
      },
      {
        id: 'act-settings',
        label: t('common.options'),
        category: t('common.commands'),
        icon: <SettingOutlined />,
        action: () => dispatch('options'),
      },
    ];

    for (const c of connMgr.connections) {
      cmds.push({
        id: `conn-${c.id}`,
        label: c.name,
        description: `${(c.db_type || '').toUpperCase()} · ${c.host}:${c.port}`,
        category: t('common.connections'),
        icon: <DatabaseOutlined />,
        action: () => {
          connMgr.handleConnect(c.id).catch(() => {});
        },
      });
    }

    for (const [connId, dbs] of Object.entries(connMgr.connectionDatabases || {})) {
      const connName = connMgr.connections.find((c) => c.id === connId)?.name;
      for (const db of dbs) {
        for (const tb of db.tables || []) {
          const isView = (tb.table_type || '').toUpperCase() === 'VIEW';
          cmds.push({
            id: `tb-${connId}-${db.database}-${tb.table_name}`,
            label: tb.table_name,
            description: `${db.database}${connName ? ` · ${connName}` : ''}`,
            category: isView ? t('common.viewsLabel') : t('common.tablesLabel'),
            icon: isView ? <EyeOutlined /> : <TableOutlined />,
            action: () => {
              connMgr.setSelectedConnectionId(connId);
              connMgr.setSelectedDatabase(db.database);
              tabMgr.setTableToOpen({ name: tb.table_name, database: db.database });
            },
          });
        }
      }
    }

    for (const s of paletteSnippets) {
      cmds.push({
        id: `snip-${s.id}`,
        label: s.name,
        description: (s.sql_text || '').replace(/\s+/g, ' ').slice(0, 60),
        category: t('common.snippets'),
        icon: <BookOutlined />,
        action: () => {
          window.dispatchEvent(new CustomEvent('palette-inject-sql', { detail: { sql: s.sql_text || '' } }));
        },
      });
    }

    for (const [i, h] of paletteHistory.entries()) {
      cmds.push({
        id: `hist-${i}`,
        label: (h.sql || '').replace(/\s+/g, ' ').slice(0, 70),
        description: new Date(h.timestamp).toLocaleString(),
        category: t('common.history'),
        icon: <HistoryOutlined />,
        action: () => {
          window.dispatchEvent(new CustomEvent('palette-inject-sql', { detail: { sql: h.sql } }));
        },
      });
    }

    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connMgr.connections, connMgr.connectionDatabases, paletteSnippets, paletteHistory]);

  return (
    <Layout style={layout.styles.root} data-file-drop-target="main">
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
                 onCancelConnect={connMgr.cancelConnect}
                 onDisconnect={connMgr.handleDisconnect}
                 onEditConnection={connMgr.handleEditConnection}
                 onCopyConnection={connMgr.handleCopyConnection}
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

      {/* ⌘K 全域命令面板：动作/连接/表/片段/历史 */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
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
        destroyOnHidden
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
