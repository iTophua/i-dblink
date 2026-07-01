import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { theme, message } from 'antd';
import { useMenuShortcuts } from '../../../hooks/useMenuShortcuts';
import type { TableInfo } from '../../../types/api';
import type { Connection } from '../../../stores/appStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { api } from '../../../api';
import { getMainLayoutStyles } from '../styles';

interface UseLayoutActionsParams {
  selectedConnectionId: string | null;
  selectedDatabase: string | undefined;
  expandedKeys: string[];
  setExpandedKeys: React.Dispatch<React.SetStateAction<string[]>>;
  connectionDatabases: Record<
    string,
    {
      database: string;
      tables: TableInfo[];
      loaded: boolean;
      loadFailed?: boolean;
      procedures?: string[];
      functions?: string[];
      triggers?: import('../../../types/api').TriggerInfo[];
      routinesLoaded?: boolean;
    }[]
  >;
  connections: Connection[];
  loadDatabaseTables: (connectionId: string, database: string, forceRefresh?: boolean) => Promise<void>;
  handleConnect: (connectionId: string) => Promise<void>;
  handleDisconnect: (connectionId: string) => void;
  handleNewQuery: (connectionId: string) => Promise<void>;
  setConnectionDialogOpen: (open: boolean) => void;
  setConnectionExportOpen: (open: boolean) => void;
}

export function useLayoutActions({
  selectedConnectionId,
  selectedDatabase,
  expandedKeys,
  setExpandedKeys,
  connectionDatabases,
  connections,
  loadDatabaseTables,
  handleConnect,
  handleDisconnect,
  handleNewQuery,
  setConnectionDialogOpen,
  setConnectionExportOpen,
}: UseLayoutActionsParams) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [operationLogOpen, setOperationLogOpen] = useState(false);

  const workspaceRestoredRef = useRef(false);

  // 恢复侧边栏工作区状态
  useEffect(() => {
    if (workspaceRestoredRef.current) return;
    const ws = useWorkspaceStore.getState();
    setCollapsed(ws.sidebarCollapsed);
    // 应用重启后不恢复连接展开状态，保持所有连接收起
    setExpandedKeys([]);
    workspaceRestoredRef.current = true;
  }, []);

  // 保存侧边栏状态
  useEffect(() => {
    if (!workspaceRestoredRef.current) return;
    useWorkspaceStore.getState().updateWorkspace({
      sidebarCollapsed: collapsed,
      expandedKeys,
    });
  }, [collapsed, expandedKeys]);

  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';
  const styles = useMemo(() => getMainLayoutStyles(), []);

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

  const menuActions = useMemo(
    () => ({
      onNewConnection: () => setConnectionDialogOpen(true),
      onSave: () => {},
      onSaveAs: () => {},
      onImport: () => setConnectionExportOpen(true),
      onExport: () => setConnectionExportOpen(true),
      onQuit: () => {},
      onUndo: () => {},
      onRedo: () => {},
      onCut: () => {},
      onCopy: () => {},
      onPaste: () => {},
      onDelete: () => {},
      onSelectAll: () => {},
      onFind: () => {},
      onRefresh: () => {
        if (selectedConnectionId && selectedDatabase) {
          loadDatabaseTables(selectedConnectionId, selectedDatabase, true);
        }
      },
      onZoomIn: () => {},
      onZoomOut: () => {},
      onZoomReset: () => {},
      onFullscreen: () => {
        const elem = document.fullscreenElement
          ? document.exitFullscreen()
          : document.documentElement.requestFullscreen();
        elem.catch(() => {});
      },
      onConnectSelected: () => {
        if (selectedConnectionId) {
          handleConnect(selectedConnectionId);
        }
      },
      onDisconnect: () => {
        if (selectedConnectionId) {
          handleDisconnect(selectedConnectionId);
        }
      },
      onNewQuery: () => {
        if (selectedConnectionId) {
          handleNewQuery(selectedConnectionId);
        }
      },
      onExecuteQuery: () => {
        window.dispatchEvent(
          new CustomEvent('tab-action', { detail: { action: 'execute-query' } })
        );
      },
      onOptions: () => setSettingsDialogOpen(true),
      onSearch: () => setGlobalSearchOpen(true),
      onNewTab: () => {
        window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'new-sql-tab' } }));
      },
      onCloseTab: () => {
        window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'close-tab' } }));
      },
      onNextTab: () => {
        window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'next-tab' } }));
      },
      onPrevTab: () => {
        window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'prev-tab' } }));
      },
      onDocumentation: () => {},
    }),
    [selectedConnectionId, selectedDatabase]
  );

  useMenuShortcuts(menuActions);

  useEffect(() => {
    const handleMenuAction = async (event: CustomEvent<{ action: string }>) => {
      const { action } = event.detail;
      switch (action) {
        case 'new-connection':
          setConnectionDialogOpen(true);
          break;
        case 'open-connection':
          message.info(t('common.featureNotImplemented'));
          break;
        case 'import-connections':
        case 'export-connections':
          setConnectionExportOpen(true);
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
        case 'save-as':
          message.info(t('common.featureNotImplemented'));
          break;
        case 'import':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'import' } }));
          break;
        case 'export':
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action: 'export' } }));
          break;
        case 'undo':
        case 'redo':
        case 'cut':
        case 'copy':
        case 'paste':
        case 'delete':
        case 'select-all':
          // 编辑操作（撤销/重做/剪切/复制/粘贴/全选）由浏览器原生处理
          // Go 菜单未绑定系统快捷键，因此 WebView 会收到原生 keydown 事件
          window.dispatchEvent(new CustomEvent('tab-action', { detail: { action } }));
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
          try {
            await api.quitApp();
          } catch (e) {
            console.error('Failed to quit:', e);
          }
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
          window.dispatchEvent(new CustomEvent('app-action', { detail: { action } }));
          break;
        case 'data-sync':
          message.info(t('common.featureNotImplemented'));
          break;
        case 'favorites':
          setFavoritesOpen(true);
          break;
        case 'backup':
          message.info(t('common.featureNotImplemented'));
          break;
        case 'restore':
          message.info(t('common.featureNotImplemented'));
          break;
        case 'model-designer':
          message.info(t('common.featureNotImplemented'));
          break;
        case 'cascade':
          message.info(t('common.featureNotImplemented'));
          break;
        case 'tile-horizontally':
          message.info(t('common.featureNotImplemented'));
          break;
        case 'tile-vertically':
          message.info(t('common.featureNotImplemented'));
          break;
        case 'operation-log':
          setOperationLogOpen(true);
          break;
        default:
          console.log(`Unknown menu action: ${action}`);
      }
    };

    window.addEventListener('menu-action', handleMenuAction);

    const handleRefreshConnectionTree = async (event: Event) => {
      const customEvent = event as CustomEvent<{ connectionId: string; database?: string }>;
      const { connectionId, database } = customEvent.detail;
      if (database) {
        await loadDatabaseTables(connectionId, database, true);
      } else {
        // 如果没有指定数据库，刷新该连接下的所有数据库
        const dbList = connectionDatabases[connectionId] || [];
        for (const db of dbList) {
          await loadDatabaseTables(connectionId, db.database, true);
        }
      }
    };

    window.addEventListener('refresh-connection-tree', handleRefreshConnectionTree);

    return () => {
      window.removeEventListener('menu-action', handleMenuAction);
      window.removeEventListener('refresh-connection-tree', handleRefreshConnectionTree);
    };
  }, [selectedConnectionId, selectedDatabase, loadDatabaseTables, handleConnect, handleDisconnect, connectionDatabases]);

  return {
    collapsed,
    setCollapsed,
    searchText,
    setSearchText,
    handleSearchChange,
    settingsDialogOpen,
    setSettingsDialogOpen,
    globalSearchOpen,
    setGlobalSearchOpen,
    favoritesOpen,
    setFavoritesOpen,
    operationLogOpen,
    setOperationLogOpen,
    styles,
    isDarkMode,
    token,
    filteredConnections,
    connectionStats,
    allDatabases,
    menuActions,
  };
}
