import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Tabs, Empty, Breadcrumb, Menu, App, Modal, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import type { TabsProps } from 'antd';
import {
  DatabaseOutlined,
  TableOutlined,
  AppstoreOutlined,
  HomeOutlined,
  CloseOutlined,
  CopyOutlined,
  EyeOutlined,
  PushpinOutlined,
  PushpinFilled,
  ColumnWidthOutlined,
  ColumnHeightOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { SQLEditor } from '../SQLEditor';
import { DataTable } from '../DataTable';
import { TableList } from '../TableList';
import { TableStructure } from '../TableStructure';
import { TableDesigner } from '../TableDesigner';
import { ViewDefinition } from '../ViewDefinition';
import { TableImportWizard } from '../TableImportWizard';
import { parseSqlStatements } from '../../utils/parseSql';
import { TableExportWizard } from '../TableExportWizard';
import { DumpDialog } from '../DumpDialog';
import { CopyTableDialog } from '../CopyTableDialog';
import type { TableInfo, DatabaseType, ColumnInfo } from '../../types/api';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAppStore } from '../../stores/appStore';
import { api } from '../../api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { SplitView } from './SplitView';

interface TabPanelProps {
  selectedConnectionId: string | null;
  selectedConnectionName?: string;
  selectedTable: string | null;
  selectedDatabase?: string;
  selectedSchema?: string;
  selectedObjectType?: 'table' | 'view' | 'all';
  /** 双击表时设置此值，TabPanel 会打开新的数据浏览 Tab */
  tableToOpen?: { name: string; database?: string; isView?: boolean } | null;
  /** 当有 SQL 查询 Tab 打开时回调，用于控制日志面板显示 */
  onSqlTabCountChange?: (count: number) => void;
  /** 活跃 Tab 变化时回调 */
  onActiveTabChange?: (info: ActiveTabInfo) => void;
  /** 查询状态变化回调 */
  onQueryStatusChange?: (isQuerying: boolean) => void;
  /** 分页大小 */
  pageSize?: number;
  /** 当前连接的数据库列表 */
  connectionDatabases?: Record<
    string,
    {
      database: string;
      tables: TableInfo[];
      loaded: boolean;
      loadFailed?: boolean;
      db_type?: string;
      triggers?: import('../../types/api').TriggerInfo[];
    }[]
  >;
}

interface OpenedTable {
  name: string;
  connectionId: string;
  connectionName: string;
  database?: string;
  isDirty?: boolean;
  isView?: boolean;
  pinned?: boolean;
  createdAt: number;
}

interface OpenedSqlTab {
  key: string;
  title: string;
  connectionId?: string;
  connectionName?: string;
  database?: string;
  defaultQuery?: string;
  isFloating?: boolean;
  floatingWindowId?: string;
  pinned?: boolean;
  createdAt: number;
}

interface OpenedDesignerTab {
  key: string;
  title: string;
  connectionId: string;
  database?: string;
  tableName?: string;
  isNewTable?: boolean;
  pinned?: boolean;
  createdAt: number;
}

interface OpenedViewDefTab {
  key: string;
  title: string;
  connectionId: string;
  database?: string;
  viewName: string;
  pinned?: boolean;
  createdAt: number;
}

export interface ActiveTabInfo {
  type: 'objects' | 'data' | 'sql' | 'designer';
  title: string;
  connectionId?: string;
  database?: string;
  tableName?: string;
}

export interface TabPanelRef {
  openDesignerTab: (tableName?: string) => void;
  openViewDefTab: (viewName: string) => void;
  openSqlTab: (options: {
    connectionId?: string;
    database?: string;
    title?: string;
    defaultQuery?: string;
    content?: string;
  }) => void;
  hasConnectionTabs: (connectionId: string) => boolean;
  hasDatabaseTabs: (connectionId: string, database: string) => boolean;
  closeConnectionTabs: (connectionId: string) => void;
  closeDatabaseTabs: (connectionId: string, database: string) => void;
  getConnectionTabInfo: (connectionId: string) => { dataTabCount: number; sqlTabCount: number };
  getDatabaseTabInfo: (connectionId: string, database: string) => { dataTabCount: number; sqlTabCount: number };
  getActiveTabInfo: () => ActiveTabInfo;
  getQueryStatus: () => { resultRows?: number; executionTime?: number };
}

export const TabPanel = forwardRef<TabPanelRef, TabPanelProps>(function TabPanelInner(
  {
    selectedConnectionId,
    selectedConnectionName,
    selectedTable,
    selectedDatabase,
    selectedSchema,
    selectedObjectType = 'all',
    tableToOpen,
    onSqlTabCountChange,
    onActiveTabChange,
    onQueryStatusChange,
    pageSize,
    connectionDatabases,
  },
  ref
) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const connections = useAppStore((state) => state.connections);
  const getDbType = useCallback(
    (connectionId: string | undefined | null): DatabaseType | undefined => {
      if (!connectionId) return undefined;
      return connections.find((c) => c.id === connectionId)?.db_type as DatabaseType | undefined;
    },
    [connections]
  );
  // 已打开的数据浏览 Tab 列表
  const [openedTables, setOpenedTables] = useState<OpenedTable[]>([]);
  // SQL 查询 Tab 列表（动态添加/删除）
  const [openedSqlTabs, setOpenedSqlTabs] = useState<OpenedSqlTab[]>([]);
  // 表设计器 Tab 列表
  const [openedDesignerTabs, setOpenedDesignerTabs] = useState<OpenedDesignerTab[]>([]);
  // 视图定义 Tab 列表
  const [openedViewDefTabs, setOpenedViewDefTabs] = useState<OpenedViewDefTab[]>([]);
  const [activeKey, setActiveKey] = useState('objects');
  const isRestoredRef = useRef(false);

  // Split view state
  const [splitMode, setSplitMode] = useState<'none' | 'horizontal' | 'vertical'>(
    () => useWorkspaceStore.getState().splitMode || 'none'
  );
  const [splitRatio, setSplitRatio] = useState(
    () => useWorkspaceStore.getState().splitRatio || 0.5
  );
  const [secondaryActiveKey, setSecondaryActiveKey] = useState(
    () => useWorkspaceStore.getState().secondaryActiveKey || ''
  );
  const [activePane, setActivePane] = useState<'primary' | 'secondary'>('primary');
  const [secondaryTabKeys, setSecondaryTabKeys] = useState<string[]>(() =>
    (useWorkspaceStore.getState().secondaryTabKeys || []).filter(Boolean)
  );

  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [exportWizardOpen, setExportWizardOpen] = useState(false);
  const [dumpDialogOpen, setDumpDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [wizardTableName, setWizardTableName] = useState('');
  const [wizardColumns, setWizardColumns] = useState<ColumnInfo[]>([]);

  // 生成数据浏览 Tab 的 key（包含 connectionId 避免不同连接冲突）
  const getDataTabKey = useCallback(
    (table: { name: string; database?: string; connectionId: string }): string => {
      const base = table.database
        ? `${table.name}@${table.database}@${table.connectionId}`
        : `${table.name}@${table.connectionId}`;
      return `${base}-data`;
    },
    []
  );

  // 从 workspaceStore 恢复工作区
  useEffect(() => {
    if (isRestoredRef.current) return;
    const ws = useWorkspaceStore.getState();
    if (
      ws.openedTables.length > 0 ||
      ws.openedSqlTabs.length > 0 ||
      ws.openedDesignerTabs.length > 0
    ) {
      // 重新生成 SQL Tab 的 key 避免时间戳冲突
      const restoredSqlTabs = ws.openedSqlTabs.map((t) => {
        const connName = t.connectionId
          ? connections.find((c) => c.id === t.connectionId)?.name || t.connectionId
          : undefined;
        return {
          ...t,
          key: `sql-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          connectionName: connName,
          defaultQuery: t.content || undefined,
          createdAt: Date.now(),
        };
      });
      setOpenedTables(
        ws.openedTables.map((t) => ({ ...t, isDirty: false, createdAt: Date.now() }))
      );
      setOpenedSqlTabs(restoredSqlTabs);
      setOpenedDesignerTabs(
        ws.openedDesignerTabs.map((t) => ({ ...t, createdAt: Date.now() }))
      );
      // 只有当 activeKey 对应的 tab 存在时才激活，否则默认 objects
      const validKeys = new Set([
        'objects',
        ...ws.openedTables.map((t) =>
          getDataTabKey({ name: t.name, database: t.database, connectionId: t.connectionId })
        ),
        ...restoredSqlTabs.map((t) => t.key),
        ...ws.openedDesignerTabs.map((t) => t.key),
      ]);
      setActiveKey(validKeys.has(ws.activeKey) ? ws.activeKey : 'objects');
    }
    isRestoredRef.current = true;
  }, [getDataTabKey]);

  // 保存工作区到 store（debounced）
  useEffect(() => {
    if (!isRestoredRef.current) return;
    const timer = setTimeout(() => {
      useWorkspaceStore.getState().updateWorkspace({
        openedTables: openedTables.map(({ isDirty, ...rest }) => rest),
        openedSqlTabs: openedSqlTabs.map(({ defaultQuery: _dp, ...rest }) => rest),
        openedDesignerTabs,
        openedViewDefTabs: openedViewDefTabs.map(({ key: _k, ...rest }) => rest),
        activeKey,
        splitMode,
        splitRatio,
        secondaryActiveKey,
        secondaryTabKeys,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [openedTables, openedSqlTabs, openedDesignerTabs, activeKey, splitMode, splitRatio, secondaryActiveKey, secondaryTabKeys]);

  // 清理 secondaryTabKeys 中已关闭的标签
  useEffect(() => {
    if (secondaryTabKeys.length === 0) return;
    const allKeys = new Set([
      ...openedTables.map((t) => getDataTabKey(t)),
      ...openedSqlTabs.map((t) => t.key),
      ...openedDesignerTabs.map((t) => t.key),
      ...openedViewDefTabs.map((t) => t.key),
    ]);
    const stale = secondaryTabKeys.filter((k) => !allKeys.has(k));
    if (stale.length > 0) {
      setSecondaryTabKeys((prev) => prev.filter((k) => allKeys.has(k)));
      if (stale.includes(secondaryActiveKey)) {
        setSecondaryActiveKey('');
        setActivePane('primary');
      }
    }
  }, [openedTables, openedSqlTabs, openedDesignerTabs, openedViewDefTabs, secondaryTabKeys, secondaryActiveKey, getDataTabKey]);

  // 键盘快捷键：Cmd+\ 切换分屏，Cmd+Shift+\ 切换方向
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        if (e.shiftKey) {
          // 切换分屏方向
          setSplitMode((prev) => {
            if (prev === 'none') return 'vertical';
            if (prev === 'horizontal') return 'vertical';
            return 'horizontal';
          });
        } else {
          // 切换分屏
          setSplitMode((prev) => (prev === 'none' ? 'vertical' : 'none'));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 监听 pane-focus 事件
  useEffect(() => {
    const handler = (e: CustomEvent<{ pane: 'primary' | 'secondary' }>) => {
      setActivePane(e.detail.pane);
    };
    window.addEventListener('pane-focus', handler as EventListener);
    return () => window.removeEventListener('pane-focus', handler as EventListener);
  }, []);

  useImperativeHandle(ref, () => ({
    openDesignerTab: (tableName?: string) => {
      openDesignerTab(tableName);
    },
    openViewDefTab: (viewName: string) => {
      openViewDefTab(viewName);
    },
    openSqlTab: (options: {
      connectionId?: string;
      database?: string;
      title?: string;
      defaultQuery?: string;
      content?: string;
    }) => {
      const rand = Math.random().toString(36).slice(2, 8);
      const newSqlKey = `sql-${Date.now()}-${rand}`;
      const connName = options.connectionId
        ? connections.find((c) => c.id === options.connectionId)?.name || options.connectionId
        : undefined;
      setOpenedSqlTabs((prev) => [
        ...prev,
        {
          key: newSqlKey,
          title: options.title || t('common.sqlQuery'),
          connectionId: options.connectionId,
          connectionName: connName,
          database: options.database,
          defaultQuery: options.content || options.defaultQuery,
          createdAt: Date.now(),
        },
      ]);
      setActiveKey(newSqlKey);
    },
    hasConnectionTabs: (connectionId: string) => {
      const hasDataTabs = openedTables.some((t) => t.connectionId === connectionId);
      const hasSqlTabs = openedSqlTabs.some((t) => t.connectionId === connectionId);
      return hasDataTabs || hasSqlTabs;
    },
    hasDatabaseTabs: (connectionId: string, database: string) => {
      return (
        openedTables.some((t) => t.connectionId === connectionId && t.database === database) ||
        openedSqlTabs.some((t) => t.connectionId === connectionId && t.database === database)
      );
    },
    closeConnectionTabs: (connectionId: string) => {
      const tablesToClose = openedTables.filter((t) => t.connectionId === connectionId);
      const sqlTabsToClose = openedSqlTabs.filter((t) => t.connectionId === connectionId);
      const closedDataKeys = new Set(tablesToClose.map((t) => getDataTabKey(t)));
      const closedSqlKeys = new Set(sqlTabsToClose.map((t) => t.key));
      setOpenedTables((prev) => prev.filter((t) => t.connectionId !== connectionId));
      setOpenedSqlTabs((prev) => prev.filter((t) => t.connectionId !== connectionId));
      setActiveKey((current) => {
        if (closedDataKeys.has(current) || closedSqlKeys.has(current)) {
          return 'objects';
        }
        return current;
      });
    },
    closeDatabaseTabs: (connectionId: string, database: string) => {
      const tablesToClose = openedTables.filter(
        (t) => t.connectionId === connectionId && t.database === database
      );
      const sqlTabsToClose = openedSqlTabs.filter(
        (t) => t.connectionId === connectionId && t.database === database
      );
      const closedDataKeys = new Set(tablesToClose.map((t) => getDataTabKey(t)));
      const closedSqlKeys = new Set(sqlTabsToClose.map((t) => t.key));
      setOpenedTables((prev) =>
        prev.filter((t) => !(t.connectionId === connectionId && t.database === database))
      );
      setOpenedSqlTabs((prev) =>
        prev.filter((t) => !(t.connectionId === connectionId && t.database === database))
      );
      setActiveKey((current) => {
        if (closedDataKeys.has(current) || closedSqlKeys.has(current)) {
          return 'objects';
        }
        return current;
      });
    },
    getConnectionTabInfo: (connectionId: string) => ({
      dataTabCount: openedTables.filter((t) => t.connectionId === connectionId).length,
      sqlTabCount: openedSqlTabs.filter((t) => t.connectionId === connectionId).length,
    }),
    getDatabaseTabInfo: (connectionId: string, database: string) => ({
      dataTabCount: openedTables.filter(
        (t) => t.connectionId === connectionId && t.database === database
      ).length,
      sqlTabCount: openedSqlTabs.filter(
        (t) => t.connectionId === connectionId && t.database === database
      ).length,
    }),
    getActiveTabInfo: () => {
      if (activeKey === 'objects') {
        return { type: 'objects' as const, title: t('common.objectList') };
      }
      if (activeKey.endsWith('-data')) {
        const table = openedTables.find((t) => getDataTabKey(t) === activeKey);
        if (table) {
          return {
            type: 'data' as const,
            title: table.name,
            connectionId: table.connectionId,
            database: table.database,
            tableName: table.name,
          };
        }
      }
      if (activeKey.startsWith('designer-') && !activeKey.startsWith('designer-new-')) {
        const designer = openedDesignerTabs.find((t) => t.key === activeKey);
        if (designer) {
          return {
            type: 'designer' as const,
            title: designer.tableName
              ? `${t('common.design')}: ${designer.tableName}`
              : t('common.newTable'),
            connectionId: designer.connectionId,
            database: designer.database,
            tableName: designer.tableName,
          };
        }
      }
      if (activeKey.startsWith('viewdef-')) {
        const viewDef = openedViewDefTabs.find((t) => t.key === activeKey);
        if (viewDef) {
          return {
            type: 'sql' as const,
            title: `${t('common.viewDefinitionTitle')}: ${viewDef.viewName}`,
            connectionId: viewDef.connectionId,
            database: viewDef.database,
          };
        }
      }
      const sqlTab = openedSqlTabs.find((t) => t.key === activeKey);
      if (sqlTab) {
        return {
          type: 'sql' as const,
          title: sqlTab.title,
          connectionId: sqlTab.connectionId,
          database: sqlTab.database,
        };
      }
      return { type: 'objects' as const, title: t('common.objectList') };
    },
    getQueryStatus: () => ({ resultRows: 0, executionTime: 0 }),
  }));

  // 通知父组件 SQL Tab 数量变化
  useEffect(() => {
    onSqlTabCountChange?.(openedSqlTabs.length);
  }, [openedSqlTabs.length, onSqlTabCountChange]);

  // 活跃 Tab 变化时通知父组件
  useEffect(() => {
    if (!onActiveTabChange) return;
    const info = (() => {
      if (activeKey === 'objects') {
        return { type: 'objects' as const, title: t('common.objectList') };
      }
      if (activeKey.endsWith('-data')) {
        const table = openedTables.find((t) => getDataTabKey(t) === activeKey);
        if (table) {
          return {
            type: 'data' as const,
            title: table.name,
            connectionId: table.connectionId,
            database: table.database,
            tableName: table.name,
          };
        }
      }
      if (activeKey.startsWith('designer-') && !activeKey.startsWith('designer-new-')) {
        const designer = openedDesignerTabs.find((t) => t.key === activeKey);
        if (designer) {
          return {
            type: 'designer' as const,
            title: designer.tableName
              ? `${t('common.design')}: ${designer.tableName}`
              : t('common.newTable'),
            connectionId: designer.connectionId,
            database: designer.database,
            tableName: designer.tableName,
          };
        }
      }
      if (activeKey.startsWith('viewdef-')) {
        const viewDef = openedViewDefTabs.find((t) => t.key === activeKey);
        if (viewDef) {
          return {
            type: 'sql' as const,
            title: `${t('common.viewDefinitionTitle')}: ${viewDef.viewName}`,
            connectionId: viewDef.connectionId,
            database: viewDef.database,
          };
        }
      }
      const sqlTab = openedSqlTabs.find((t) => t.key === activeKey);
      if (sqlTab) {
        return {
          type: 'sql' as const,
          title: sqlTab.title,
          connectionId: sqlTab.connectionId,
          database: sqlTab.database,
        };
      }
      return { type: 'objects' as const, title: t('common.objectList') };
    })();
    onActiveTabChange(info);
  }, [
    activeKey,
    openedTables,
    openedSqlTabs,
    openedDesignerTabs,
    openedViewDefTabs,
    onActiveTabChange,
  ]);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    tabKey: string;
  }>({ visible: false, x: 0, y: 0, tabKey: '' });

  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 标签页拖拽排序
  const dragKeyRef = useRef<string | null>(null);

  const getTabCategory = (key: string): 'data' | 'sql' | 'designer' | 'fixed' => {
    if (key === 'objects') return 'fixed';
    if (key.endsWith('-data')) return 'data';
    if (key.startsWith('sql-')) return 'sql';
    if (key.startsWith('designer-')) return 'designer';
    return 'fixed';
  };

  const handleDragStart = (key: string) => {
    dragKeyRef.current = key;
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    const targetCat = getTabCategory(key);
    if (dragKeyRef.current && targetCat !== 'fixed') {
      e.dataTransfer.dropEffect = 'move';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  const handleDrop = (targetKey: string) => {
    const sourceKey = dragKeyRef.current;
    dragKeyRef.current = null;
    if (!sourceKey || sourceKey === targetKey) return;
    const targetCat = getTabCategory(targetKey);
    if (targetCat === 'fixed') return;

    const allItems: { key: string; createdAt: number }[] = [
      ...openedTables.map((t) => ({ key: getDataTabKey(t), createdAt: t.createdAt })),
      ...openedSqlTabs.map((t) => ({ key: t.key, createdAt: t.createdAt })),
      ...openedDesignerTabs.map((t) => ({ key: t.key, createdAt: t.createdAt })),
      ...openedViewDefTabs.map((t) => ({ key: t.key, createdAt: t.createdAt })),
    ].sort((a, b) => a.createdAt - b.createdAt);

    if (!allItems.some((i) => i.key === sourceKey)) return;

    const withoutSource = allItems.filter((i) => i.key !== sourceKey);
    const insertPos = withoutSource.findIndex((i) => i.key === targetKey);
    if (insertPos === -1) return;

    const newCreatedAt =
      insertPos === 0
        ? withoutSource[0].createdAt - 1
        : (withoutSource[insertPos - 1].createdAt + withoutSource[insertPos].createdAt) / 2;

    setOpenedTables((prev) =>
      prev.map((t) => (getDataTabKey(t) === sourceKey ? { ...t, createdAt: newCreatedAt } : t))
    );
    setOpenedSqlTabs((prev) =>
      prev.map((t) => (t.key === sourceKey ? { ...t, createdAt: newCreatedAt } : t))
    );
    setOpenedDesignerTabs((prev) =>
      prev.map((t) => (t.key === sourceKey ? { ...t, createdAt: newCreatedAt } : t))
    );
    setOpenedViewDefTabs((prev) =>
      prev.map((t) => (t.key === sourceKey ? { ...t, createdAt: newCreatedAt } : t))
    );
  };

  const renderDraggableTabBar: TabsProps['renderTabBar'] = (tabBarProps, DefaultTabBar) => (
    <DefaultTabBar {...tabBarProps}>
      {(node) => {
        const key = (node as any).key as string;
        const cat = getTabCategory(key);
        const draggable = cat !== 'fixed';
        return (
          <div
            draggable={draggable}
            onDragStart={() => handleDragStart(key)}
            onDragOver={(e) => handleDragOver(e, key)}
            onDrop={() => handleDrop(key)}
            style={{
              display: 'inline-block',
              cursor: draggable ? 'grab' : 'default',
              opacity: dragKeyRef.current && dragKeyRef.current !== key ? 0.6 : 1,
            }}
          >
            {node}
          </div>
        );
      }}
    </DefaultTabBar>
  );

  // 监听 tab-action 事件（来自菜单或工具栏）
  useEffect(() => {
    const handleTabAction = (
      event: CustomEvent<{ action: string; connectionId?: string; database?: string }>
    ) => {
      const { action, connectionId: eventConnId, database: eventDb } = event.detail;
      if (action === 'new-sql-tab') {
        const rand = Math.random().toString(36).slice(2, 8);
        const newSqlKey = `sql-${Date.now()}-${rand}`;
        const connId = eventConnId || selectedConnectionId;
        const dbName = eventDb || selectedDatabase;
        const connName = connId
          ? connections.find((c) => c.id === connId)?.name || connId
          : undefined;
        setOpenedSqlTabs((prev) => [
          ...prev,
          {
            key: newSqlKey,
            title: t('common.sqlQuery'),
            connectionId: connId || undefined,
            connectionName: connName,
            database: dbName,
            createdAt: Date.now(),
          },
        ]);
        setActiveKey(newSqlKey);
      } else if (action === 'close-tab') {
        if (activeKey.startsWith('sql-')) {
          const keyToClose = activeKey;
          setOpenedSqlTabs((prev) => prev.filter((t) => t.key !== keyToClose));
          setActiveKey('objects');
        }
      }
    };

    window.addEventListener('tab-action', handleTabAction as EventListener);
    return () => {
      window.removeEventListener('tab-action', handleTabAction as EventListener);
    };
  }, [activeKey, selectedConnectionId, selectedDatabase]);

  // 双击表时调用（来自树或表列表），打开新的数据浏览 Tab
  const openTableTab = useCallback(
    (tableName: string, database?: string, isView?: boolean) => {
      if (!selectedConnectionId) return;

      const dataTabKey = getDataTabKey({
        name: tableName,
        database,
        connectionId: selectedConnectionId,
      });

      const exists = openedTables.find(
        (t) =>
          t.name === tableName && t.connectionId === selectedConnectionId && t.database === database
      );
      if (!exists) {
        setOpenedTables((prev) => [
          ...prev,
          {
            name: tableName,
            connectionId: selectedConnectionId,
            connectionName: selectedConnectionName || selectedConnectionId,
            database,
            isDirty: false,
            isView,
            createdAt: Date.now(),
          },
        ]);
      }
      setActiveKey(dataTabKey);
    },
    [selectedConnectionId, selectedConnectionName, openedTables, getDataTabKey]
  );

  // 将 SQL 标签页浮动到独立窗口
  const floatSqlTab = useCallback(
    async (sqlTabKey: string) => {
      const sqlTab = openedSqlTabs.find((t) => t.key === sqlTabKey);
      if (!sqlTab) return;

      try {
        message.info(t('common.floatingWindowNotSupported'));
        console.log('Float window requested for:', sqlTabKey, sqlTab.title);
      } catch (error) {
        console.error('Failed to create floating window:', error);
        message.error(t('common.createFloatingWindowFailed'));
      }
    },
    [openedSqlTabs, message]
  );

  // 打开表设计器 Tab
  const openDesignerTab = useCallback(
    (tableName?: string) => {
      if (!selectedConnectionId) return;

      const isNewTable = !tableName || tableName === '';
      const tabKey = isNewTable
        ? `designer-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        : selectedDatabase
          ? `designer-${tableName}@${selectedDatabase}@${selectedConnectionId}`
          : `designer-${tableName}@${selectedConnectionId}`;

      const exists = openedDesignerTabs.find((t) => {
        if (isNewTable) return t.key === tabKey;
        return (
          t.tableName === tableName &&
          t.connectionId === selectedConnectionId &&
          t.database === selectedDatabase
        );
      });
      if (!exists) {
        setOpenedDesignerTabs((prev) => [
          ...prev,
          {
            key: tabKey,
            title: isNewTable ? t('common.newTable') : `${t('common.design')}: ${tableName}`,
            connectionId: selectedConnectionId,
            database: selectedDatabase,
            tableName: isNewTable ? undefined : tableName,
            isNewTable,
            createdAt: Date.now(),
          },
        ]);
      }
      setActiveKey(tabKey);
    },
    [selectedConnectionId, selectedDatabase, openedDesignerTabs]
  );

  // 打开视图定义 Tab
  const openViewDefTab = useCallback(
    (viewName: string) => {
      if (!selectedConnectionId) return;

      const tabKey = selectedDatabase
        ? `viewdef-${viewName}@${selectedDatabase}@${selectedConnectionId}`
        : `viewdef-${viewName}@${selectedConnectionId}`;

      const exists = openedViewDefTabs.find(
        (t) =>
          t.viewName === viewName &&
          t.connectionId === selectedConnectionId &&
          t.database === selectedDatabase
      );
      if (!exists) {
        setOpenedViewDefTabs((prev) => [
          ...prev,
          {
            key: tabKey,
            title: `${t('common.viewDefinitionTitle')}: ${viewName}`,
            connectionId: selectedConnectionId,
            database: selectedDatabase,
            viewName,
            createdAt: Date.now(),
          },
        ]);
      }
      setActiveKey(tabKey);
    },
    [selectedConnectionId, selectedDatabase, openedViewDefTabs]
  );

  // 监听 tableToOpen 变化，当双击树中的表时打开新 Tab
  useEffect(() => {
    if (tableToOpen && selectedConnectionId) {
      openTableTab(tableToOpen.name, tableToOpen.database, tableToOpen.isView);
    }
  }, [tableToOpen, selectedConnectionId, openTableTab]);

  // 更新 Tab 的 dirty 状态
  const handleTableDirtyChange = useCallback(
    (tabKey: string, isDirty: boolean) => {
      setOpenedTables((prev) =>
        prev.map((t) =>
          getDataTabKey(t) === tabKey ? { ...t, isDirty } : t
        )
      );
    },
    [getDataTabKey]
  );

  // 切换 Tab 固定状态
  const toggleTabPin = useCallback(
    (key: string) => {
      if (key.endsWith('-data')) {
        setOpenedTables((prev) =>
          prev.map((t) =>
            getDataTabKey(t) === key ? { ...t, pinned: !t.pinned } : t
          )
        );
      } else if (key.startsWith('sql-')) {
        setOpenedSqlTabs((prev) =>
          prev.map((t) => (t.key === key ? { ...t, pinned: !t.pinned } : t))
        );
      } else if (key.startsWith('designer-')) {
        setOpenedDesignerTabs((prev) =>
          prev.map((t) => (t.key === key ? { ...t, pinned: !t.pinned } : t))
        );
      } else if (key.startsWith('viewdef-')) {
        setOpenedViewDefTabs((prev) =>
          prev.map((t) => (t.key === key ? { ...t, pinned: !t.pinned } : t))
        );
      }
    },
    [getDataTabKey]
  );

  // 检查 Tab 是否已固定
  const isTabPinned = useCallback(
    (key: string): boolean => {
      if (key === 'objects') return false;
      if (key.endsWith('-data')) {
        const table = openedTables.find((t) => getDataTabKey(t) === key);
        return !!table?.pinned;
      }
      if (key.startsWith('sql-')) {
        return !!openedSqlTabs.find((t) => t.key === key)?.pinned;
      }
      if (key.startsWith('designer-')) {
        return !!openedDesignerTabs.find((t) => t.key === key)?.pinned;
      }
      if (key.startsWith('viewdef-')) {
        return !!openedViewDefTabs.find((t) => t.key === key)?.pinned;
      }
      return false;
    },
    [openedTables, openedSqlTabs, openedDesignerTabs, openedViewDefTabs, getDataTabKey]
  );

  // 关闭单个 Tab
  const handleCloseTab = useCallback(
    (key: string) => {
      // 固定的标签页不允许关闭
      if (isTabPinned(key)) return;

      if (key.endsWith('-data')) {
        // 检查 dirty 状态
        const table = openedTables.find((t) => getDataTabKey(t) === key);

        if (table?.isDirty) {
          // 有未保存的更改，显示确认对话框
          Modal.confirm({
            title: t('common.unsavedChangesTitle'),
            content: t('common.unsavedChangesContent'),
            okText: t('common.close'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            transitionName: '',
            maskTransitionName: '',
            onOk: () => {
              setOpenedTables((prev) =>
                prev.filter((t) => getDataTabKey(t) !== key)
              );
              if (activeKey === key) {
                setActiveKey('objects');
              }
            },
          });
          return;
        }

        // 没有未保存的更改，直接关闭
        setOpenedTables((prev) =>
          prev.filter((t) => getDataTabKey(t) !== key)
        );
        if (activeKey === key) {
          setActiveKey('objects');
        }
      } else if (key.startsWith('sql-')) {
        // 关闭 SQL 查询 Tab
        setOpenedSqlTabs((prev) => prev.filter((tab) => tab.key !== key));
        if (activeKey === key) {
          setActiveKey('objects');
        }
      } else if (key.startsWith('designer-')) {
        // 关闭表设计器 Tab
        setOpenedDesignerTabs((prev) => prev.filter((tab) => tab.key !== key));
        if (activeKey === key) {
          setActiveKey('objects');
        }
      } else if (key.startsWith('viewdef-')) {
        // 关闭视图定义 Tab
        setOpenedViewDefTabs((prev) => prev.filter((tab) => tab.key !== key));
        if (activeKey === key) {
          setActiveKey('objects');
        }
      }
    },
    [activeKey, openedTables, isTabPinned]
  );

  // 右键菜单处理
  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      tabKey,
    });
  }, []);

  // 关闭右键菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        contextMenu.visible &&
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu.visible]);

  // 右键菜单操作
  const handleContextMenuAction = useCallback(
    (action: string, tabKey: string) => {
      setContextMenu((prev) => ({ ...prev, visible: false }));

      switch (action) {
        case 'pin':
          toggleTabPin(tabKey);
          break;

        case 'close':
          handleCloseTab(tabKey);
          break;

        case 'closeOthers':
          // 关闭其他所有 Tab（保留固定标签）
          setOpenedTables((prev) =>
            prev.filter((t) => getDataTabKey(t) === tabKey || t.pinned)
          );
          setOpenedSqlTabs((prev) =>
            prev.filter((t) => t.key === tabKey || t.pinned)
          );
          setOpenedDesignerTabs((prev) =>
            prev.filter((t) => t.key === tabKey || t.pinned)
          );
          setOpenedViewDefTabs((prev) =>
            prev.filter((t) => t.key === tabKey || t.pinned)
          );
          setActiveKey(tabKey);
          message.success(t('common.closeOtherTabs'));
          break;

        case 'closeRight': {
          // 关闭右侧所有 Tab（保留固定标签）
          const allItems: { key: string; createdAt: number; pinned: boolean }[] = [
            ...openedTables.map((t) => ({ key: getDataTabKey(t), createdAt: t.createdAt, pinned: !!t.pinned })),
            ...openedSqlTabs.map((t) => ({ key: t.key, createdAt: t.createdAt, pinned: !!t.pinned })),
            ...openedDesignerTabs.map((t) => ({ key: t.key, createdAt: t.createdAt, pinned: !!t.pinned })),
            ...openedViewDefTabs.map((t) => ({ key: t.key, createdAt: t.createdAt, pinned: !!t.pinned })),
          ].sort((a, b) => a.createdAt - b.createdAt);

          const currentIdx = allItems.findIndex((i) => i.key === tabKey);
          if (currentIdx >= 0) {
            const keysToClose = new Set(
              allItems.slice(currentIdx + 1).filter((i) => !i.pinned).map((i) => i.key)
            );
            setOpenedTables((prev) =>
              prev.filter((t) => !keysToClose.has(getDataTabKey(t)))
            );
            setOpenedSqlTabs((prev) =>
              prev.filter((t) => !keysToClose.has(t.key))
            );
            setOpenedDesignerTabs((prev) =>
              prev.filter((t) => !keysToClose.has(t.key))
            );
            setOpenedViewDefTabs((prev) =>
              prev.filter((t) => !keysToClose.has(t.key))
            );
          }
          setActiveKey(tabKey);
          message.success(t('common.closeRightTabs'));
          break;
        }

        case 'closeAll':
          // 关闭所有 Tab（保留固定标签）
          setOpenedTables((prev) => prev.filter((t) => t.pinned));
          setOpenedSqlTabs((prev) => prev.filter((t) => t.pinned));
          setOpenedDesignerTabs((prev) => prev.filter((t) => t.pinned));
          setOpenedViewDefTabs((prev) => prev.filter((t) => t.pinned));
          setActiveKey('objects');
          message.success(t('common.closeAllTabs'));
          break;

        case 'copySql': {
          // 复制 SQL Tab 的初始内容到剪贴板（编辑器内当前内容需用 Ctrl+A/Ctrl+C）
          const sqlTab = openedSqlTabs.find((x) => x.key === tabKey);
          const content = sqlTab?.defaultQuery || '';
          if (content) {
            navigator.clipboard.writeText(content).then(
              () => message.success(t('common.copiedToClipboard')),
              () => message.error(t('common.copyFailed'))
            );
          } else {
            message.info(t('common.noContentToCopy'));
          }
          break;
        }

        case 'copyTableName': {
          // 复制 data Tab 的表名
          const dataTab = openedTables.find((x) => getDataTabKey(x) === tabKey);
          const name = dataTab?.name || '';
          if (name) {
            navigator.clipboard.writeText(name).then(
              () => message.success(t('common.copiedToClipboard')),
              () => message.error(t('common.copyFailed'))
            );
          }
          break;
        }

        case 'duplicateSql': {
          // 复制 SQL Tab 为新 Tab
          const src = openedSqlTabs.find((x) => x.key === tabKey);
          if (src) {
            const newKey = `sql-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            setOpenedSqlTabs((prev) => [
              ...prev,
              { ...src, key: newKey, title: `${src.title} ${t('common.copySuffix')}`, createdAt: Date.now() },
            ]);
            setActiveKey(newKey);
          }
          break;
        }

        case 'moveToOtherPane': {
          const isSecondary = secondaryTabKeys.includes(tabKey);
          if (isSecondary) {
            setSecondaryTabKeys((prev) => prev.filter((k) => k !== tabKey));
            if (secondaryActiveKey === tabKey) {
              const remaining = secondaryTabKeys.filter((k) => k !== tabKey);
              setSecondaryActiveKey(remaining.length > 0 ? remaining[0] : '');
            }
          } else {
            setSecondaryTabKeys((prev) => [...prev, tabKey]);
            setSecondaryActiveKey(tabKey);
          }
          break;
        }

        case 'splitHorizontal':
          setSecondaryTabKeys([tabKey]);
          setSecondaryActiveKey(tabKey);
          setSplitMode('horizontal');
          break;

        case 'splitVertical':
          setSecondaryTabKeys([tabKey]);
          setSecondaryActiveKey(tabKey);
          setSplitMode('vertical');
          break;

        case 'unsplit':
          setSecondaryTabKeys([]);
          setSecondaryActiveKey('');
          setSplitMode('none');
          setActivePane('primary');
          break;
      }
    },
    [handleCloseTab, openedTables, openedSqlTabs, toggleTabPin, secondaryTabKeys, secondaryActiveKey]
  );

  // 关闭 Tab
  const handleTabEdit = useCallback(
    (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
      if (action === 'add') {
        // 点击 + 号新增 SQL 查询 Tab
        const rand = Math.random().toString(36).slice(2, 8);
        const newSqlKey = `sql-${Date.now()}-${rand}`;
        const connName = selectedConnectionId
          ? connections.find((c) => c.id === selectedConnectionId)?.name || selectedConnectionId
          : undefined;
        setOpenedSqlTabs((prev) => [
          ...prev,
          {
            key: newSqlKey,
            title: t('common.sqlQuery'),
            connectionId: selectedConnectionId ?? undefined,
            connectionName: connName,
            database: selectedDatabase ?? undefined,
            createdAt: Date.now(),
          },
        ]);
        // 根据活跃面板分配新标签
        if (splitMode !== 'none' && activePane === 'secondary') {
          setSecondaryTabKeys((prev) => [...prev, newSqlKey]);
          setSecondaryActiveKey(newSqlKey);
        } else {
          setActiveKey(newSqlKey);
        }
      } else if (action === 'remove') {
        const key = typeof targetKey === 'string' ? targetKey : '';
        handleCloseTab(key);
      }
    },
    [activeKey, openedTables, openedSqlTabs, handleCloseTab, splitMode, activePane]
  );

  // Secondary pane 的 onEdit 处理
  const handleSecondaryPaneEdit = useCallback(
    (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
      if (action === 'add') {
        const rand = Math.random().toString(36).slice(2, 8);
        const newSqlKey = `sql-${Date.now()}-${rand}`;
        const connName = selectedConnectionId
          ? connections.find((c) => c.id === selectedConnectionId)?.name || selectedConnectionId
          : undefined;
        setOpenedSqlTabs((prev) => [
          ...prev,
          {
            key: newSqlKey,
            title: t('common.sqlQuery'),
            connectionId: selectedConnectionId ?? undefined,
            connectionName: connName,
            database: selectedDatabase ?? undefined,
            createdAt: Date.now(),
          },
        ]);
        setSecondaryTabKeys((prev) => [...prev, newSqlKey]);
        setSecondaryActiveKey(newSqlKey);
        setActivePane('secondary');
      } else if (action === 'remove') {
        const key = typeof targetKey === 'string' ? targetKey : '';
        handleCloseTab(key);
        if (key === secondaryActiveKey) {
          const remaining = secondaryTabKeys.filter((k) => k !== key);
          const nextActive = remaining.length > 0 ? remaining[remaining.length - 1] : '';
          setSecondaryActiveKey(nextActive);
          if (!nextActive) setActivePane('primary');
        }
      }
    },
    [handleCloseTab, secondaryActiveKey, secondaryTabKeys, selectedConnectionId, selectedDatabase]
  );

  // 动态 Tab：合并并按 createdAt 排序（固定标签排前面）
  const dynamicTabItems: TabsProps['items'] = [
    ...openedTables.flatMap((table) => {
      const dataTabKey = getDataTabKey(table);
      const tooltipTitle = table.database
        ? `${table.database} @ ${table.connectionName}`
        : table.connectionName;

      return [
        {
          key: dataTabKey,
          label: (
            <Tooltip title={tooltipTitle} placement="bottom">
              <span
                onContextMenu={(e) => handleTabContextMenu(e, dataTabKey)}
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  maxWidth: 160,
                }}
              >
                {table.pinned && (
                  <PushpinFilled style={{ marginRight: 2, flexShrink: 0, fontSize: 10, color: 'var(--color-primary)' }} />
                )}
                {table.isView ? (
                  <EyeOutlined style={{ marginRight: 4, flexShrink: 0 }} />
                ) : (
                  <TableOutlined style={{ marginRight: 4, flexShrink: 0 }} />
                )}
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {table.name}
                </span>
                {table.isDirty && (
                  <span style={{ color: 'var(--color-error)', marginLeft: 4 }}>*</span>
                )}
              </span>
            </Tooltip>
          ),
          children: (
            <div style={{ height: '100%' }} data-testid={`data-tab-${table.name}`}>
              <DataTable
                tableName={table.name}
                connectionId={table.connectionId}
                database={table.database}
                pageSize={pageSize}
                onDirtyChange={(isDirty) => handleTableDirtyChange(dataTabKey, isDirty)}
              />
            </div>
          ),
          closable: !table.pinned,
          _createdAt: table.createdAt ?? 0,
          _pinned: !!table.pinned,
        },
      ];
    }),
    ...openedSqlTabs.map((sqlTab) => {
      const sqlTooltip = sqlTab.database
        ? `${sqlTab.database} @ ${sqlTab.connectionName || ''}`
        : sqlTab.connectionName || '';
      return {
        key: sqlTab.key,
        label: (
          <Tooltip title={sqlTooltip} placement="bottom">
            <span
              onContextMenu={(e) => handleTabContextMenu(e, sqlTab.key)}
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onDoubleClick={() => {
                Modal.confirm({
                  title: t('common.renameTabTitle'),
                  content: (
                    <input
                      autoFocus
                      defaultValue={sqlTab.title}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        background: 'var(--background)',
                        color: 'var(--text)',
                      }}
                      onChange={(e) => {
                        const newTitle = e.target.value;
                        setOpenedSqlTabs((prev) =>
                          prev.map((t) => (t.key === sqlTab.key ? { ...t, title: newTitle } : t))
                        );
                      }}
                    />
                  ),
                  okText: t('common.confirm'),
                  cancelText: t('common.cancel'),
                  transitionName: '',
                  maskTransitionName: '',
                  onOk: () => {},
                });
              }}
            >
              {sqlTab.pinned && (
                <PushpinFilled style={{ marginRight: 2, fontSize: 10, color: 'var(--color-primary)' }} />
              )}
              <DatabaseOutlined style={{ marginRight: 4 }} />
              {sqlTab.title}
            </span>
          </Tooltip>
        ),
        children: (
          <div style={{ height: '100%' }} data-testid={`sql-tab-${sqlTab.key}`}>
            <SQLEditor
              connectionId={sqlTab.connectionId || selectedConnectionId}
              database={sqlTab.database}
              defaultQuery={sqlTab.defaultQuery}
              dbType={getDbType(sqlTab.connectionId || selectedConnectionId)}
              availableDatabases={
                (sqlTab.connectionId || selectedConnectionId) && connectionDatabases?.[sqlTab.connectionId || selectedConnectionId || '']
                  ? connectionDatabases[sqlTab.connectionId || selectedConnectionId || ''].map((db) => db.database)
                  : []
              }
              recentDatabases={useWorkspaceStore.getState().recentDatabases || []}
              onDatabaseChange={(database) => {
                setOpenedSqlTabs((prev) =>
                  prev.map((t) => (t.key === sqlTab.key ? { ...t, database } : t))
                );
                const connId = sqlTab.connectionId || selectedConnectionId;
                if (connId) {
                  const conn = connections.find((c) => c.id === connId);
                  if (conn) {
                    useWorkspaceStore.getState().addRecentDatabase({
                      connectionId: connId,
                      connectionName: conn.name,
                      database,
                    });
                  }
                }
              }}
              onQueryStatusChange={onQueryStatusChange}
            />
          </div>
        ),
        closable: !sqlTab.pinned,
        _createdAt: sqlTab.createdAt ?? 0,
        _pinned: !!sqlTab.pinned,
      };
    }),
    ...openedDesignerTabs.map((designerTab) => ({
      key: designerTab.key,
      label: (
        <span
          onContextMenu={(e) => handleTabContextMenu(e, designerTab.key)}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          {designerTab.pinned && (
            <PushpinFilled style={{ marginRight: 2, fontSize: 10, color: 'var(--color-primary)' }} />
          )}
          <TableOutlined style={{ marginRight: 4 }} />
          {designerTab.title}
        </span>
      ),
      children: (
        <div style={{ height: '100%' }}>
          <TableDesigner
            connectionId={designerTab.connectionId}
            tableName={designerTab.tableName}
            database={designerTab.database}
            dbType={getDbType(designerTab.connectionId)}
            onSave={async (sql: string) => {
              try {
                // 用 parseSqlStatements 正确切分（处理字符串/注释内的分号），
                // 避免简单 split(';') 破坏 DEFAULT 'a;b' 或触发器体
                const { statements } = parseSqlStatements(sql);
                for (const stmt of statements) {
                  await api.executeDDL(
                    designerTab.connectionId,
                    stmt,
                    designerTab.database
                  );
                }
                message.success(
                  designerTab.isNewTable
                    ? t('common.tableCreated')
                    : t('common.tableStructureUpdated')
                );
                setOpenedDesignerTabs((prev) => prev.filter((t) => t.key !== designerTab.key));
                setActiveKey('objects');
                window.dispatchEvent(
                  new CustomEvent('refresh-connection-tree', {
                    detail: { connectionId: designerTab.connectionId },
                  })
                );
              } catch (err: unknown) {
                message.error(t('common.sqlEditor.executeFailed') + ': ' + getErrorMessage(err));
              }
            }}
            onCancel={() => {
              setOpenedDesignerTabs((prev) => prev.filter((t) => t.key !== designerTab.key));
              setActiveKey('objects');
            }}
          />
        </div>
      ),
      closable: !designerTab.pinned,
      _createdAt: designerTab.createdAt ?? 0,
      _pinned: !!designerTab.pinned,
    })),
    ...openedViewDefTabs.map((viewDefTab) => ({
      key: viewDefTab.key,
      label: (
        <span
          onContextMenu={(e) => handleTabContextMenu(e, viewDefTab.key)}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          {viewDefTab.pinned && (
            <PushpinFilled style={{ marginRight: 2, fontSize: 10, color: 'var(--color-primary)' }} />
          )}
          <EyeOutlined style={{ marginRight: 4 }} />
          {viewDefTab.title}
        </span>
      ),
      children: (
        <div style={{ height: '100%' }}>
          <ViewDefinition
            connectionId={viewDefTab.connectionId}
            viewName={viewDefTab.viewName}
            database={viewDefTab.database}
          />
        </div>
      ),
      closable: !viewDefTab.pinned,
      _createdAt: viewDefTab.createdAt ?? 0,
      _pinned: !!viewDefTab.pinned,
    })),
  ].sort((a: any, b: any) => {
    // 固定标签排前面
    if (a._pinned && !b._pinned) return -1;
    if (!a._pinned && b._pinned) return 1;
    return a._createdAt - b._createdAt;
  });

  const tabItems: TabsProps['items'] = [
    {
      key: 'objects',
      label: (
        <span>
          <AppstoreOutlined style={{ marginRight: 4 }} />
          {t('common.object')}
        </span>
      ),
      children: (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            height: '100%',
          }}
          data-testid="objects-tab"
        >
          {/* 面包屑导航 */}
          {selectedTable && (
            <div
              style={{
                padding: '8px 12px',
                borderBottom: `1px solid var(--border)`,
                background: 'var(--background-toolbar)',
                flexShrink: 0,
              }}
            >
              <Breadcrumb
                items={
                  [
                    {
                      title: (
                        <span>
                          <HomeOutlined /> {t('common.home')}
                        </span>
                      ),
                    },
                    selectedConnectionId
                      ? { title: selectedConnectionName || t('common.objectList') }
                      : null,
                    selectedDatabase ? { title: selectedDatabase } : null,
                    { title: selectedTable },
                  ].filter(Boolean) as { title: React.ReactNode }[]
                }
              />
            </div>
          )}

          {/* 内容区域 */}
          {selectedConnectionId ? (
            selectedTable ? (
              // 单击表 → 展示表结构
              <TableStructure
                connectionId={selectedConnectionId}
                tableName={selectedTable}
                database={selectedDatabase}
              />
            ) : (
              // 未选表 → 显示表列表
              <TableList
                connectionId={selectedConnectionId}
                database={selectedDatabase}
                schema={selectedSchema}
                objectType={selectedObjectType}
                onTableSelect={() => {
                  // Single click in TableList → show structure in objects tab
                }}
                onTableOpen={openTableTab}
                onTableDesign={(tableName) => openDesignerTab(tableName)}
                onTableNew={() => openDesignerTab()}
                onTableDelete={async (tableName, db) => {
                  try {
                    await api.dropTable(selectedConnectionId, tableName, db);
                    message.success(t('common.tableDeleted'));
                    window.dispatchEvent(
                      new CustomEvent('refresh-connection-tree', {
                        detail: { connectionId: selectedConnectionId },
                      })
                    );
                  } catch (e: unknown) {
                    message.error(t('common.deleteTableFailed') + ': ' + getErrorMessage(e));
                  }
                }}
                onTableTruncate={async (tableName, db) => {
                  try {
                    await api.truncateTable(selectedConnectionId, tableName, db);
                    message.success(t('common.tableTruncated'));
                    window.dispatchEvent(
                      new CustomEvent('refresh-connection-tree', {
                        detail: { connectionId: selectedConnectionId },
                      })
                    );
                  } catch (e: unknown) {
                    message.error(t('common.truncateTableFailed') + ': ' + getErrorMessage(e));
                  }
                }}
                onTableCopy={(tableName) => {
                  setWizardTableName(tableName);
                  setCopyDialogOpen(true);
                }}
                onTableDump={(tableName) => {
                  setWizardTableName(tableName);
                  setDumpDialogOpen(true);
                }}
                onImport={(tableName, db) => {
                  setWizardTableName(tableName);
                  setWizardColumns([]);
                  setImportWizardOpen(true);
                }}
                onExport={(tableName, db) => {
                  setWizardTableName(tableName);
                  setWizardColumns([]);
                  setExportWizardOpen(true);
                }}
              />
            )
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-tertiary)',
              }}
            >
              <Empty
                description={t('common.pleaseSelectConnection')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          )}
        </div>
      ),
      closable: false,
    },
    ...dynamicTabItems,
  ];

  // Split view: compute pane-specific tab items
  const isSecondaryTabKey = new Set(secondaryTabKeys);
  const primaryTabItems =
    splitMode !== 'none'
      ? tabItems.filter(
          (item) => !isSecondaryTabKey.has(item.key as string)
        )
      : tabItems;
  const secondaryTabItems =
    splitMode !== 'none'
      ? tabItems.filter((item) =>
          isSecondaryTabKey.has(item.key as string)
        )
      : [];

  const renderPrimaryPane = (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
      onClick={() => setActivePane('primary')}
    >
      <Tabs
        type="editable-card"
        size="small"
        activeKey={activeKey}
        onChange={(key) => { setActivePane('primary'); setActiveKey(key); }}
        hideAdd
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
        tabBarStyle={{ margin: 0, padding: '0 4px', background: 'transparent', flexShrink: 0 }}
        tabBarGutter={2}
        items={primaryTabItems}
        onEdit={handleTabEdit}
        renderTabBar={renderDraggableTabBar}
        data-testid="tab-panel-primary"
      />
    </div>
  );

  const renderSecondaryPane =
    secondaryTabItems.length > 0 ? (
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
        onClick={() => setActivePane('secondary')}
      >
        <Tabs
          type="editable-card"
          size="small"
          activeKey={secondaryActiveKey}
          onChange={(key) => { setActivePane('secondary'); setSecondaryActiveKey(key); }}
          hideAdd
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
          tabBarStyle={{ margin: 0, padding: '0 4px', background: 'transparent', flexShrink: 0 }}
          tabBarGutter={2}
          items={secondaryTabItems}
          onEdit={handleSecondaryPaneEdit}
          renderTabBar={renderDraggableTabBar}
          data-testid="tab-panel-secondary"
        />
      </div>
    ) : (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
          fontSize: 13,
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <StopOutlined style={{ fontSize: 24, opacity: 0.4 }} />
        <span>{t('common.dropTabsHere')}</span>
      </div>
    );

  return (
    <div
      style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {splitMode !== 'none' ? (
        <SplitView
          direction={splitMode}
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
          primary={renderPrimaryPane}
          secondary={renderSecondaryPane}
        />
      ) : (
        renderPrimaryPane
      )}

      {/* 右键菜单 */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
            background: 'var(--background-card)',
            border: `1px solid var(--border-dark)`,
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            padding: '4px 0',
            minWidth: 150,
          }}
        >
          <Menu
            items={[
              {
                key: 'pin',
                label: isTabPinned(contextMenu.tabKey)
                  ? t('common.unpinTab')
                  : t('common.pinTab'),
                icon: isTabPinned(contextMenu.tabKey) ? <PushpinOutlined /> : <PushpinFilled />,
              },
              { type: 'divider' },
              { key: 'close', label: t('common.closeTabMenu'), icon: <CloseOutlined />, disabled: isTabPinned(contextMenu.tabKey) },
              { key: 'closeOthers', label: t('common.closeOthersTabMenu') },
              { key: 'closeRight', label: t('common.closeRightTabMenu') },
              { type: 'divider' },
              // SQL Tab 专属：复制 SQL、复制 Tab
              ...(contextMenu.tabKey.startsWith('sql-')
                ? [
                    { key: 'copySql', label: t('common.copySqlContent'), icon: <CopyOutlined /> },
                    { key: 'duplicateSql', label: t('common.duplicateTab'), icon: <CopyOutlined /> },
                    { type: 'divider' as const },
                  ]
                : []),
              // data Tab 专属：复制表名
              ...(contextMenu.tabKey.endsWith('-data')
                ? [
                    { key: 'copyTableName', label: t('common.copyTableName'), icon: <CopyOutlined /> },
                    { type: 'divider' as const },
                  ]
                : []),
              // Split view 选项
              ...(contextMenu.tabKey !== 'objects'
                ? [
                    { type: 'divider' as const },
                    ...(splitMode === 'none'
                      ? [
                          { key: 'splitHorizontal', label: t('common.splitHorizontal'), icon: <ColumnWidthOutlined /> },
                          { key: 'splitVertical', label: t('common.splitVertical'), icon: <ColumnHeightOutlined /> },
                        ]
                      : [
                          {
                            key: 'moveToOtherPane',
                            label: t('common.moveToOtherPane'),
                            icon: <ColumnWidthOutlined />,
                          },
                          { key: 'unsplit', label: t('common.unsplit'), icon: <StopOutlined /> },
                        ]),
                  ]
                : []),
              { key: 'closeAll', label: t('common.closeAllTabMenu'), danger: true },
            ]}
            onClick={({ key }) => handleContextMenuAction(key, contextMenu.tabKey)}
          />
        </div>
      )}

      <TableImportWizard
        open={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        connectionId={selectedConnectionId || ''}
        tableName={wizardTableName}
        database={selectedDatabase}
        dbType={getDbType(selectedConnectionId)}
        columns={wizardColumns}
        onSuccess={() => {
          window.dispatchEvent(
            new CustomEvent('refresh-connection-tree', {
              detail: { connectionId: selectedConnectionId },
            })
          );
        }}
      />
      <TableExportWizard
        open={exportWizardOpen}
        onClose={() => setExportWizardOpen(false)}
        connectionId={selectedConnectionId || ''}
        tableName={wizardTableName}
        database={selectedDatabase}
        dbType={getDbType(selectedConnectionId)}
      />
      <DumpDialog
        open={dumpDialogOpen}
        tableName={wizardTableName}
        database={selectedDatabase}
        connectionId={selectedConnectionId || ''}
        dbType={getDbType(selectedConnectionId)}
        onCancel={() => setDumpDialogOpen(false)}
        onSuccess={() => setDumpDialogOpen(false)}
      />
      <CopyTableDialog
        open={copyDialogOpen}
        sourceTable={wizardTableName}
        sourceDatabase={selectedDatabase}
        connectionId={selectedConnectionId || ''}
        dbType={getDbType(selectedConnectionId)}
        databases={
          connectionDatabases?.[selectedConnectionId || '']?.map((d) => d.database) || []
        }
        onCancel={() => setCopyDialogOpen(false)}
        onSuccess={() => {
          setCopyDialogOpen(false);
          window.dispatchEvent(
            new CustomEvent('refresh-connection-tree', {
              detail: { connectionId: selectedConnectionId },
            })
          );
        }}
      />
    </div>
  );
});

export default TabPanel;
