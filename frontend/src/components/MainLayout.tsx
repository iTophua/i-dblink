import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Events, Dialogs, Window as WailsWindow } from '@wailsio/runtime';
import { Layout, Form, Input, Modal, Tooltip, App } from 'antd';
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
  DashboardOutlined,
} from '@ant-design/icons';
import { GlobalInput } from './GlobalInput';
import { GlobalSearch } from './GlobalSearch';
import { Favorites } from './Favorites';
import { CommandPalette, type Command } from './CommandPalette';
import { useInitApp } from '../hooks/useApi';
import { Toolbar, ToolbarBrand, SidebarAppControls } from './Toolbar';
import { isMacOS } from '../constants/menuShortcuts';
import { PanelLeft } from 'lucide-react';

import { EnhancedConnectionTree } from './ConnectionTree/EnhancedConnectionTree';
import { TabPanel, type TabPanelRef } from './TabPanel';
import { StatusBar } from './StatusBar';
import { AIChatPanel } from './AIChatPanel';
import { ConnectionDialog } from './ConnectionDialog';
import { ConnectionExportDialog } from './ConnectionExportDialog';
import { BatchManageDialog } from './ConnectionTree/BatchManageDialog';
import { SettingsDialog } from './SettingsDialog';
import { BackupRestoreDialog } from './BackupRestoreDialog';
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
  const { message } = App.useApp();
  const isMac = isMacOS();
  const isWailsEnv =
    typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>)._wails;
  // mac 通高侧栏布局：工具栏合并进标签栏右侧，省掉一整行高度
  const mergedRow = isMac;

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
    if (tabMgr.activeTabInfo.title && tabMgr.activeTabInfo.type !== 'objects')
      parts.push(tabMgr.activeTabInfo.title);
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

  // ── 首页「打开 SQL 文件」/ 双击 .sql / 拖放文件打开（Wails v3 文件能力）──
  // 路径打开逻辑抽成稳定回调：文件选择、双击、拖放三条入口共用
  const openSqlFileByPath = useCallback(
    (path: string) => {
      const name = path.split(/[\\/]/).pop() || 'query.sql';
      api
        .readSqlFile(path)
        .then((content) => tabPanelRef.current?.openSqlTab({ title: name, defaultQuery: content }))
        .catch((err) => {
          message.error(`${t('common.mainLayout.openSqlFileFailed')}: ${getErrorMessage(err)}`);
        });
    },
    [t]
  );

  // 首页「打开 SQL 文件」：系统文件选择框 → 读文件 → 开 SQL Tab
  const handlePickSqlFile = useCallback(async () => {
    try {
      const picked = await Dialogs.OpenFile({
        Title: t('common.openSqlFile'),
        CanChooseFiles: true,
        CanChooseDirectories: false,
        AllowsMultipleSelection: false,
        Filters: [{ DisplayName: 'SQL', Pattern: '*.sql' }],
      });
      const path = Array.isArray(picked) ? picked[0] : picked;
      if (path) openSqlFileByPath(path);
    } catch {
      // 用户取消选择或平台不支持：静默
    }
  }, [t, openSqlFileByPath]);

  // 首页「最近使用」：建连（含密码弹框兜底）→ 选中并展开目标库
  const { handleConnect: connMgrConnect, handleDatabaseExpand: connMgrExpandDatabase } = connMgr;
  const handleOpenRecentDatabase = useCallback(
    async (connectionId: string, database: string) => {
      try {
        await connMgrConnect(connectionId);
      } catch {
        return;
      }
      // 密码弹框/连接失败路径不抛错，但状态仍是 disconnected —— 不做后续动作
      const conn = useAppStore.getState().connections.find((c) => c.id === connectionId);
      if (!conn || conn.status !== 'connected') return;
      await connMgrExpandDatabase(connectionId, database);
    },
    [connMgrConnect, connMgrExpandDatabase]
  );

  useEffect(() => {
    let cancelled = false;
    // 冷启动：双击 .sql 拉起应用，启动后取待打开路径
    api
      .takePendingOpenFile()
      .then((p) => {
        if (p && !cancelled) openSqlFileByPath(p);
      })
      .catch(() => {});
    // 已运行实例：双击 .sql（单实例转发）与窗口拖放经事件推送
    const offOpen = EventsOn('open-sql-file', (path: string) => openSqlFileByPath(path));
    const offDrop = EventsOn('files-dropped', (files: string[]) => {
      const list = files || [];
      const sqlFiles = list.filter((f) => /\.sql$/i.test(f));
      sqlFiles.forEach((f) => openSqlFileByPath(f));
      // 导入文件 → 当前数据表的导入向导（无数据表时提示）
      const importFiles = list.filter((f) => /\.(csv|xlsx|xls|json|xml|txt)$/i.test(f));
      if (importFiles.length > 0) {
        const active = tabPanelRef.current?.getActiveTabInfo();
        if (active?.type === 'data') {
          tabPanelRef.current?.openImportWizard(importFiles[0]);
        } else {
          message.info(t('common.mainLayout.dropImportNeedsTable'));
        }
      }
      const rest = list.length - sqlFiles.length - importFiles.length;
      if (rest > 0) {
        message.info(t('common.mainLayout.dropUnsupported'));
      }
    });
    return () => {
      cancelled = true;
      offOpen();
      offDrop();
    };
  }, [openSqlFileByPath, t]);

  // ── 托盘「快速连接」面板的数据源：应答其请求，返回连接+分组快照 ──
  useEffect(() => {
    const off = EventsOn('conn-picker:request-data', () => {
      const store = useAppStore.getState();
      Events.Emit('conn-picker:data', {
        connections: store.connections.map((c) => ({
          id: c.id,
          name: c.name,
          db_type: c.db_type,
          host: c.host,
          port: c.port,
          status: c.status,
          group_id: c.group_id ?? null,
        })),
        groups: store.groups.map((g) => ({ id: g.id, name: g.name })),
      }).catch(() => {});
    });
    return off;
  }, []);

  // ── 关闭保护聚合：SQL 编辑器 dirty（多实例并集）∨ 数据 tab dirty → backend ──
  const guardSqlDirtyIdsRef = useRef<Set<string>>(new Set());
  const guardDataDirtyRef = useRef(false);
  useEffect(() => {
    const pushGuard = () => {
      api
        .setCloseGuardState(guardDataDirtyRef.current || guardSqlDirtyIdsRef.current.size > 0)
        .catch(() => {});
    };
    const onSql = (e: Event) => {
      const { id, dirty } = (e as CustomEvent<{ id: string; dirty: boolean }>).detail;
      if (dirty) guardSqlDirtyIdsRef.current.add(id);
      else guardSqlDirtyIdsRef.current.delete(id);
      pushGuard();
    };
    const onData = (e: Event) => {
      guardDataDirtyRef.current = !!(e as CustomEvent<{ dirty: boolean }>).detail?.dirty;
      pushGuard();
    };
    window.addEventListener('sql-dirty-change', onSql);
    window.addEventListener('data-dirty-change', onData);
    pushGuard();
    return () => {
      window.removeEventListener('sql-dirty-change', onSql);
      window.removeEventListener('data-dirty-change', onData);
    };
  }, []);

  const paletteCommands = useMemo((): Command[] => {
    // 显式 void：dispatchEvent 返回 boolean，泄漏到 action 的返回类型会
    // 与 Command['action'] 的 void | Promise<void> 联合类型冲突
    const dispatch = (action: string): void => {
      window.dispatchEvent(new CustomEvent('menu-action', { detail: { action } }));
    };
    const activeConnName =
      connMgr.connections.find((c) => c.id === connMgr.selectedConnectionId)?.name || '';
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
      {
        id: 'act-connection-monitor',
        label: t('common.connectionMonitor'),
        description: connMgr.selectedConnectionId
          ? `${t('common.connectionMonitor')} · ${activeConnName}`
          : undefined,
        category: t('common.commands'),
        icon: <DashboardOutlined />,
        action: () => dispatch('connection-monitor'),
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
          window.dispatchEvent(
            new CustomEvent('palette-inject-sql', { detail: { sql: s.sql_text || '' } })
          );
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
    <Layout
      hasSider
      className="app-shell"
      style={{
        ...layout.styles.root,
        // 左侧底板 + 右侧卡片：侧栏不再是独立卡片，它和窗口底色连成同一块
        // 「底板」，右侧内容作为卡片内嵌在底板里（四周留 8px 缝，圆角 + 投影）
        background: 'var(--app-base)',
        padding: 8,
        // 侧栏贴左，底板色从窗口左缘连续铺开；收起侧栏后补回左边距
        paddingLeft: layout.collapsed ? 8 : 0,
        gap: layout.collapsed ? 0 : 8,
        boxSizing: 'border-box',
      }}
      data-file-drop-target="main"
    >
      {/* 通高侧栏：贯穿整个窗口高度，macOS 红绿灯落在侧栏顶部拖拽条上 */}
      <Sider
        theme="light"
        collapsible
        collapsed={layout.collapsed}
        onCollapse={(value) => layout.setCollapsed(value)}
        width={320}
        collapsedWidth={0}
        trigger={null}
        style={{
          ...layout.styles.sider,
          // 侧栏是底板的一部分：不要圆角/描边/投影，底板色与窗口底色无缝相接
          borderRadius: 0,
          border: 'none',
          boxShadow: 'none',
          overflow: 'hidden',
        }}
        className="sidebar-enhanced"
      >
        <div style={layout.styles.siderContent} className="sidebar-content">
          {!layout.collapsed && (
            <>
              {/* 拖拽条：可拖动窗口；mac 左侧避让红绿灯，品牌区紧随其后，
                  折叠按钮放在面板内部的右端（收起后由标签栏左槽接管） */}
              <div
                className="toolbar-drag-region"
                style={{
                  height: 44,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: isMac && isWailsEnv ? 82 : 14,
                  paddingRight: 8,
                }}
              >
                <ToolbarBrand />
                <span
                  className="toolbar-no-drag hoverable"
                  onClick={() => layout.setCollapsed(true)}
                  title={t('common.collapse')}
                  style={{
                    marginLeft: 'auto',
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  <PanelLeft size="1em" strokeWidth={1.8} />
                </span>
              </div>
              <div
                style={{
                  ...layout.styles.searchContainer,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
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
            </>
          )}

          {/* 连接分区头：给密集连接列表一个结构起点（标题 + 数量 + 新建） */}
          {!layout.collapsed && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 16px 4px',
                flexShrink: 0,
                fontSize: 11,
                letterSpacing: '0.3px',
                color: 'var(--text-tertiary)',
                userSelect: 'none',
              }}
            >
              {t('common.connections')}
              <span
                style={{
                  fontFamily: 'var(--font-family-code)',
                  fontSize: 10,
                  color: 'var(--text-disabled)',
                }}
              >
                {connMgr.connections.length}
              </span>
              <span
                className="toolbar-no-drag"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('menu-action', { detail: { action: 'new-connection' } })
                  )
                }
                style={{
                  marginLeft: 'auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '1px 7px',
                  borderRadius: 5,
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  fontSize: 10.5,
                  lineHeight: '16px',
                }}
                title={t('common.newConnection')}
              >
                <PlusOutlined style={{ fontSize: 10 }} />
                {t('common.newConnection')}
              </span>
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
          {!layout.collapsed && (
            <div
              style={{
                flexShrink: 0,
                // 与顶部品牌条同高（44），侧栏上下两条栏形成对称节奏
                height: 44,
                borderTop: '1px solid var(--border-color)',
                // 不再铺工具栏底色：侧栏现在是底板的一部分，四按钮直接坐在底板上
                background: 'transparent',
                // 2px 容器内边距 + 按钮自身 8px = 10px，与搜索框左右边缘严格对齐
                padding: '0 2px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 12,
              }}
            >
              {/* 全局偏好工具条：带文字的四个入口（AI / 快捷键 / 主题 / 设置） */}
              <SidebarAppControls />
            </div>
          )}
        </div>
      </Sider>

      {/* 右列：工具栏（非 mac）+ 内容区 + 状态栏 —— 第二块圆角面板 */}
      <Layout
        className="app-panel"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--background-card)',
          borderRadius: 14,
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        {!mergedRow && (
          <Toolbar
            sidebarCollapsed={layout.collapsed}
            onToggleSidebar={() => layout.setCollapsed(!layout.collapsed)}
          />
        )}
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
              onOpenRecentDatabase={handleOpenRecentDatabase}
              onOpenSqlFile={handlePickSqlFile}
              onActivateConnection={(connectionId, database) => {
                connMgr.setSelectedConnectionId(connectionId);
                connMgr.setSelectedDatabase(database);
                connMgr.setActiveConnection(connectionId);
              }}
              pageSize={useSettingsStore.getState().settings.pageSize}
              connectionDatabases={connMgr.connectionDatabases}
              tabBarExtra={
                mergedRow
                  ? {
                      // 折叠后才在标签栏左侧接管开关（展开时开关在面板内部）
                      left: layout.collapsed ? (
                        <Toolbar
                          variant="inline"
                          slot="left"
                          sidebarCollapsed
                          onToggleSidebar={() => layout.setCollapsed(false)}
                        />
                      ) : undefined,
                      right: (
                        <Toolbar
                          variant="inline"
                          slot="right"
                          sidebarCollapsed={layout.collapsed}
                          onToggleSidebar={() => layout.setCollapsed(!layout.collapsed)}
                        />
                      ),
                    }
                  : undefined
              }
              tabBarInsetLeft={mergedRow && layout.collapsed ? 84 : 10}
            />
          </div>
        </Content>
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
      </Layout>

      {/* 全局 AI 聊天面板（独立于 tab，全局可用） */}
      <AIChatPanel
        connections={connMgr.connections}
        selectedConnectionId={connMgr.selectedConnectionId}
        connectionDatabases={connMgr.connectionDatabases}
        onApplySQL={handleInjectSQL}
        onOpenSettings={() =>
          window.dispatchEvent(new CustomEvent('menu-action', { detail: { action: 'options' } }))
        }
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

      <SettingsDialog
        open={layout.settingsDialogOpen}
        onCancel={() => layout.setSettingsDialogOpen(false)}
      />

      {/* 工具菜单 备份/恢复数据库（与连接树右键同一对话框） */}
      <BackupRestoreDialog
        open={layout.backupRestore.open}
        mode={layout.backupRestore.mode}
        connectionId={connMgr.selectedConnectionId || ''}
        database={connMgr.selectedDatabase}
        dbType={
          connMgr.connections.find((c) => c.id === connMgr.selectedConnectionId)?.db_type || ''
        }
        onCancel={() => layout.setBackupRestore((v) => ({ ...v, open: false }))}
        onSuccess={() => layout.setBackupRestore((v) => ({ ...v, open: false }))}
      />

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

      <OperationLog
        open={layout.operationLogOpen}
        onClose={() => layout.setOperationLogOpen(false)}
      />

      <UpdateDialog
        open={layout.updateDialogOpen}
        onClose={() => layout.setUpdateDialogOpen(false)}
      />

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
