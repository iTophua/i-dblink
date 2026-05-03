import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Tabs, Empty, Breadcrumb, Menu, App, Modal, Tooltip } from 'antd';
import type { TabsProps } from 'antd';
import {
  DatabaseOutlined,
  TableOutlined,
  AppstoreOutlined,
  HomeOutlined,
  CloseOutlined,
  PushpinOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { SQLEditor } from '../SQLEditor';
import { DataTable } from '../DataTable';
import { TableList } from '../TableList';
import { TableStructure } from '../TableStructure';
import { TableDesigner } from '../TableDesigner';
import { ViewDefinition } from '../ViewDefinition';
import type { TableInfo, DatabaseType } from '../../types/api';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { api } from '../../api';
import { useFloatingWindowManager } from '../../hooks/useFloatingWindowManager';

interface TabPanelProps {
  selectedConnectionId: string | null;
  selectedConnectionName?: string;
  selectedTable: string | null;
  selectedDatabase?: string;
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
}

interface OpenedSqlTab {
  key: string;
  title: string;
  connectionId?: string;
  database?: string;
  defaultQuery?: string;
  isFloating?: boolean;
  floatingWindowId?: string;
}

interface OpenedDesignerTab {
  key: string;
  title: string;
  connectionId: string;
  database?: string;
  tableName?: string;
  isNewTable?: boolean;
}

interface OpenedViewDefTab {
  key: string;
  title: string;
  connectionId: string;
  database?: string;
  viewName: string;
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
  getDatabaseTabInfo: (connectionId: string, database: string) => { dataTabCount: number };
  getActiveTabInfo: () => ActiveTabInfo;
  getQueryStatus: () => { resultRows?: number; executionTime?: number };
}

export const TabPanel = forwardRef<TabPanelRef, TabPanelProps>(function TabPanelInner(
  {
    selectedConnectionId,
    selectedConnectionName,
    selectedTable,
    selectedDatabase,
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
  const { message } = App.useApp();
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
      const restoredSqlTabs = ws.openedSqlTabs.map((t) => ({
        ...t,
        key: `sql-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        defaultQuery: t.content || undefined,
      }));
      setOpenedTables(ws.openedTables.map((t) => ({ ...t, isDirty: false })));
      setOpenedSqlTabs(restoredSqlTabs);
      setOpenedDesignerTabs(ws.openedDesignerTabs);
      // 只有当 activeKey 对应的 tab 存在时才激活，否则默认 objects
      const validKeys = new Set([
        'objects',
        ...ws.openedTables.map((t) => {
          const baseKey = t.database ? `${t.name}@${t.database}` : t.name;
          return `${baseKey}-data`;
        }),
        ...restoredSqlTabs.map((t) => t.key),
        ...ws.openedDesignerTabs.map((t) => t.key),
      ]);
      setActiveKey(validKeys.has(ws.activeKey) ? ws.activeKey : 'objects');
    }
    isRestoredRef.current = true;
  }, []);

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
    });
    }, 500);
    return () => clearTimeout(timer);
  }, [openedTables, openedSqlTabs, openedDesignerTabs, activeKey]);

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
      const newSqlKey = `sql-${Date.now()}`;
      setOpenedSqlTabs((prev) => [
        ...prev,
        {
          key: newSqlKey,
          title: options.title || 'SQL 查询',
          connectionId: options.connectionId,
          database: options.database,
          defaultQuery: options.content || options.defaultQuery,
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
      return openedTables.some((t) => t.connectionId === connectionId && t.database === database);
    },
    closeConnectionTabs: (connectionId: string) => {
      const tablesToClose = openedTables.filter((t) => t.connectionId === connectionId);
      const sqlTabsToClose = openedSqlTabs.filter((t) => t.connectionId === connectionId);
      const closedDataKeys = new Set(
        tablesToClose.map((t) => {
          const baseKey = t.database ? `${t.name}@${t.database}` : t.name;
          return `${baseKey}-data`;
        })
      );
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
      const closedDataKeys = new Set(
        tablesToClose.map((t) => {
          const baseKey = t.database ? `${t.name}@${t.database}` : t.name;
          return `${baseKey}-data`;
        })
      );
      setOpenedTables((prev) =>
        prev.filter((t) => !(t.connectionId === connectionId && t.database === database))
      );
      setActiveKey((current) => {
        if (closedDataKeys.has(current)) {
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
    }),
    getActiveTabInfo: () => {
      if (activeKey === 'objects') {
        return { type: 'objects' as const, title: '对象列表' };
      }
      if (activeKey.endsWith('-data')) {
        const table = openedTables.find((t) => {
          const baseKey = t.database ? `${t.name}@${t.database}` : t.name;
          return `${baseKey}-data` === activeKey;
        });
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
      if (activeKey.endsWith('-designer')) {
        const designer = openedDesignerTabs.find((t) => t.key === activeKey);
        if (designer) {
          return {
            type: 'designer' as const,
            title: designer.tableName ? `设计: ${designer.tableName}` : '新建表',
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
            title: `视图定义: ${viewDef.viewName}`,
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
      return { type: 'objects' as const, title: '对象列表' };
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
        return { type: 'objects' as const, title: '对象列表' };
      }
      if (activeKey.endsWith('-data')) {
        const table = openedTables.find((t) => {
          const baseKey = t.database ? `${t.name}@${t.database}` : t.name;
          return `${baseKey}-data` === activeKey;
        });
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
      if (activeKey.endsWith('-designer')) {
        const designer = openedDesignerTabs.find((t) => t.key === activeKey);
        if (designer) {
          return {
            type: 'designer' as const,
            title: designer.tableName ? `设计: ${designer.tableName}` : '新建表',
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
            title: `视图定义: ${viewDef.viewName}`,
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
      return { type: 'objects' as const, title: '对象列表' };
    })();
    onActiveTabChange(info);
  }, [activeKey, openedTables, openedSqlTabs, openedDesignerTabs, openedViewDefTabs, onActiveTabChange]);

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
    const sourceCat = getTabCategory(dragKeyRef.current || '');
    const targetCat = getTabCategory(key);
    if (sourceCat !== 'fixed' && sourceCat === targetCat) {
      e.dataTransfer.dropEffect = 'move';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  const handleDrop = (targetKey: string) => {
    const sourceKey = dragKeyRef.current;
    dragKeyRef.current = null;
    if (!sourceKey || sourceKey === targetKey) return;
    const sourceCat = getTabCategory(sourceKey);
    const targetCat = getTabCategory(targetKey);
    if (sourceCat === 'fixed' || sourceCat !== targetCat) return;

    if (sourceCat === 'data') {
      setOpenedTables((prev) => {
        const sourceIndex = prev.findIndex((t) => {
          const k = t.database ? `${t.name}@${t.database}` : t.name;
          return `${k}-data` === sourceKey;
        });
        const targetIndex = prev.findIndex((t) => {
          const k = t.database ? `${t.name}@${t.database}` : t.name;
          return `${k}-data` === targetKey;
        });
        if (sourceIndex === -1 || targetIndex === -1) return prev;
        const next = [...prev];
        const [removed] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, removed);
        return next;
      });
    } else if (sourceCat === 'sql') {
      setOpenedSqlTabs((prev) => {
        const sourceIndex = prev.findIndex((t) => t.key === sourceKey);
        const targetIndex = prev.findIndex((t) => t.key === targetKey);
        if (sourceIndex === -1 || targetIndex === -1) return prev;
        const next = [...prev];
        const [removed] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, removed);
        return next;
      });
    } else if (sourceCat === 'designer') {
      setOpenedDesignerTabs((prev) => {
        const sourceIndex = prev.findIndex((t) => t.key === sourceKey);
        const targetIndex = prev.findIndex((t) => t.key === targetKey);
        if (sourceIndex === -1 || targetIndex === -1) return prev;
        const next = [...prev];
        const [removed] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, removed);
        return next;
      });
    }
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
        const newSqlKey = `sql-${Date.now()}`;
        const connId = eventConnId || selectedConnectionId;
        // 如果传入了数据库，使用传入的；否则使用当前选中的数据库
        const dbName = eventDb || selectedDatabase;
        setOpenedSqlTabs((prev) => [
          ...prev,
          {
            key: newSqlKey,
            title: 'SQL 查询',
            connectionId: connId || undefined,
            database: dbName,
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

      const baseKey = database ? `${tableName}@${database}` : tableName;
      const dataTabKey = `${baseKey}-data`;

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
          },
        ]);
      }
      setActiveKey(dataTabKey);
    },
    [selectedConnectionId, selectedConnectionName, openedTables]
  );

  // 将 SQL 标签页浮动到独立窗口
  const floatSqlTab = useCallback(
    async (sqlTabKey: string) => {
      const sqlTab = openedSqlTabs.find((t) => t.key === sqlTabKey);
      if (!sqlTab) return;

      try {
        // 创建新的 Tauri 窗口并加载应用 URL
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        const windowId = `floating-sql-${sqlTabKey}`;
        const appWindow = new WebviewWindow(windowId, {
          url: `/?floating=true&tabKey=${encodeURIComponent(sqlTabKey)}`,
          title: `SQL 查询 - ${sqlTab.title}`,
          width: 1000,
          height: 700,
        });

        // 更新状态，标记这个标签页已浮动
        setOpenedSqlTabs((prev) =>
          prev.map((t) =>
            t.key === sqlTabKey ? { ...t, isFloating: true, floatingWindowId: windowId } : t
          )
        );

        message.success('已在独立窗口中打开 SQL 查询');
      } catch (error) {
        console.error('Failed to create floating window:', error);
        message.error('创建浮动窗口失败');
      }
    },
    [openedSqlTabs, message]
  );

  // 打开表设计器 Tab
  const openDesignerTab = useCallback(
    (tableName?: string) => {
      if (!selectedConnectionId) return;

      const isNewTable = !tableName || tableName === '';
      const tabKey = isNewTable ? `designer-new-${Date.now()}` : `designer-${tableName}`;

      const exists = openedDesignerTabs.find((t) => {
        if (isNewTable) return t.key === tabKey;
        return t.tableName === tableName && t.connectionId === selectedConnectionId;
      });
      if (!exists) {
        setOpenedDesignerTabs((prev) => [
          ...prev,
          {
            key: tabKey,
            title: isNewTable ? '新建表' : `设计表: ${tableName}`,
            connectionId: selectedConnectionId,
            database: selectedDatabase,
            tableName: isNewTable ? undefined : tableName,
            isNewTable,
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

      const tabKey = `viewdef-${viewName}`;

      const exists = openedViewDefTabs.find((t) => t.viewName === viewName && t.connectionId === selectedConnectionId);
      if (!exists) {
        setOpenedViewDefTabs((prev) => [
          ...prev,
          {
            key: tabKey,
            title: `视图定义: ${viewName}`,
            connectionId: selectedConnectionId,
            database: selectedDatabase,
            viewName,
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
  const handleTableDirtyChange = useCallback((tabKey: string, isDirty: boolean) => {
    const baseKey = tabKey.replace(/-data$/, '');
    setOpenedTables((prev) =>
      prev.map((t) => {
        const tKey = t.database ? `${t.name}@${t.database}` : t.name;
        return tKey === baseKey ? { ...t, isDirty } : t;
      })
    );
  }, []);

  // 关闭单个 Tab
  const handleCloseTab = useCallback(
    (key: string) => {
      if (key.endsWith('-data')) {
        // 检查 dirty 状态
        const baseKey = key.replace(/-data$/, '');
        const table = openedTables.find((t) => {
          const tKey = t.database ? `${t.name}@${t.database}` : t.name;
          return tKey === baseKey;
        });

        if (table?.isDirty) {
          // 有未保存的更改，显示确认对话框
          Modal.confirm({
            title: '未保存的更改',
            content: `"${table.name}" 有未保存的数据更改，确定要关闭吗？`,
            okText: '关闭',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => {
              setOpenedTables((prev) =>
                prev.filter((t) => {
                  const tKey = t.database ? `${t.name}@${t.database}` : t.name;
                  return tKey !== baseKey;
                })
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
          prev.filter((t) => {
            const tKey = t.database ? `${t.name}@${t.database}` : t.name;
            return tKey !== baseKey;
          })
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
    [activeKey, openedTables]
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
        case 'close':
          handleCloseTab(tabKey);
          break;

        case 'closeOthers':
          // 关闭其他所有 Tab
          if (tabKey.endsWith('-data')) {
            const baseKey = tabKey.replace(/-data$/, '');
            setOpenedTables((prev) =>
              prev.filter((t) => {
                const tKey = t.database ? `${t.name}@${t.database}` : t.name;
                return tKey === baseKey;
              })
            );
          } else if (tabKey.startsWith('sql-')) {
            setOpenedSqlTabs((prev) => prev.filter((t) => t.key === tabKey));
          }
          setActiveKey(tabKey);
          message.success('已关闭其他标签');
          break;

        case 'closeRight':
          // 关闭右侧所有 Tab
          if (tabKey.endsWith('-data')) {
            const allDataKeys = openedTables.map((t) => {
              const baseKey = t.database ? `${t.name}@${t.database}` : t.name;
              return `${baseKey}-data`;
            });
            const currentIndex = allDataKeys.indexOf(tabKey);
            if (currentIndex >= 0) {
              const keysToClose = allDataKeys.slice(currentIndex + 1);
              const baseKeysToKeep = keysToClose.map((k) => k.replace(/-data$/, ''));
              setOpenedTables((prev) =>
                prev.filter((t) => {
                  const tKey = t.database ? `${t.name}@${t.database}` : t.name;
                  return !baseKeysToKeep.includes(tKey);
                })
              );
            }
          } else if (tabKey.startsWith('sql-')) {
            const sqlKeys = openedSqlTabs.map((t) => t.key);
            const currentIndex = sqlKeys.indexOf(tabKey);
            if (currentIndex >= 0) {
              const keysToClose = sqlKeys.slice(currentIndex + 1);
              setOpenedSqlTabs((prev) => prev.filter((t) => !keysToClose.includes(t.key)));
            }
          }
          setActiveKey(tabKey);
          message.success('已关闭右侧标签');
          break;

        case 'closeAll':
          // 关闭所有 Tab
          setOpenedTables([]);
          setOpenedSqlTabs([]);
          setActiveKey('objects');
          message.success('已关闭所有标签');
          break;
      }
    },
    [handleCloseTab, openedTables, openedSqlTabs]
  );

  // 关闭 Tab
  const handleTabEdit = useCallback(
    (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
      if (action === 'add') {
        // 点击 + 号新增 SQL 查询 Tab
        const newSqlKey = `sql-${Date.now()}`;
        setOpenedSqlTabs((prev) => [...prev, { key: newSqlKey, title: 'SQL 查询' }]);
        setActiveKey(newSqlKey);
      } else if (action === 'remove') {
        const key = typeof targetKey === 'string' ? targetKey : '';
        handleCloseTab(key);
      }
    },
    [activeKey, openedTables, openedSqlTabs, handleCloseTab]
  );

  // 构建 Tab 列表
  const tabItems: TabsProps['items'] = [
    {
      key: 'objects',
      label: (
        <span>
          <AppstoreOutlined style={{ marginRight: 4 }} />
          对象
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
                          <HomeOutlined /> 首页
                        </span>
                      ),
                    },
                    selectedConnectionId ? { title: selectedConnectionName || '对象列表' } : null,
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
                    message.success(`表 ${tableName} 已删除`);
                    window.dispatchEvent(
                      new CustomEvent('refresh-connection-tree', {
                        detail: { connectionId: selectedConnectionId },
                      })
                    );
                  } catch (e: any) {
                    message.error(`删除失败：${e.message || e}`);
                  }
                }}
                onTableTruncate={async (tableName, db) => {
                  try {
                    await api.truncateTable(selectedConnectionId, tableName, db);
                    message.success(`表 ${tableName} 已清空`);
                    window.dispatchEvent(
                      new CustomEvent('refresh-connection-tree', {
                        detail: { connectionId: selectedConnectionId },
                      })
                    );
                  } catch (e: any) {
                    message.error(`清空失败：${e.message || e}`);
                  }
                }}
                onTableCopy={(tableName) => {
                  message.warning('复制表功能即将推出');
                }}
                onTableDump={(tableName) => {
                  message.warning('转储 SQL 功能即将推出');
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
              <Empty description="请从左侧选择一个连接" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </div>
      ),
      closable: false,
    },
    // 已打开的数据表 Tab
    ...openedTables.flatMap((table) => {
      const baseKey = table.database ? `${table.name}@${table.database}` : table.name;
      const dataTabKey = `${baseKey}-data`;
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
                {table.isView ? <EyeOutlined style={{ marginRight: 4, flexShrink: 0 }} /> : <TableOutlined style={{ marginRight: 4, flexShrink: 0 }} />}
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
            <div style={{ height: '100%' }}>
              <DataTable
                tableName={table.name}
                connectionId={table.connectionId}
                database={table.database}
                pageSize={pageSize}
                onDirtyChange={(isDirty) => handleTableDirtyChange(dataTabKey, isDirty)}
              />
            </div>
          ),
          closable: true,
        },
      ];
    }),
    // 动态 SQL 查询 Tab
    ...openedSqlTabs.map((sqlTab, index) => ({
      key: sqlTab.key,
      label: (
        <span
          onContextMenu={(e) => handleTabContextMenu(e, sqlTab.key)}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onDoubleClick={() => {
            Modal.confirm({
              title: '重命名标签页',
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
              okText: '确定',
              cancelText: '取消',
              onOk: () => {},
            });
          }}
        >
          <DatabaseOutlined style={{ marginRight: 4 }} />
          {sqlTab.title || `SQL ${index + 1}`}
        </span>
      ),
      children: (
        <div style={{ height: '100%' }}>
          <SQLEditor
            connectionId={selectedConnectionId}
            database={sqlTab.database || selectedDatabase}
            defaultQuery={sqlTab.defaultQuery}
            dbType={
              selectedConnectionId
                ? (connectionDatabases?.[selectedConnectionId]?.[0]?.db_type as
                    | DatabaseType
                    | undefined)
                : undefined
            }
            availableDatabases={
              selectedConnectionId && connectionDatabases?.[selectedConnectionId]
                ? connectionDatabases[selectedConnectionId].map((db) => db.database)
                : []
            }
            onDatabaseChange={(database) => {
              setOpenedSqlTabs((prev) =>
                prev.map((t) => (t.key === sqlTab.key ? { ...t, database } : t))
              );
            }}
            onQueryStatusChange={onQueryStatusChange}
          />
        </div>
      ),
      closable: true,
    })),
    // 表设计器 Tab
    ...openedDesignerTabs.map((designerTab) => ({
      key: designerTab.key,
      label: (
        <span
          onContextMenu={(e) => handleTabContextMenu(e, designerTab.key)}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
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
            dbType={
              designerTab.connectionId
                ? (connectionDatabases?.[designerTab.connectionId]?.[0]?.db_type as
                    | DatabaseType
                    | undefined)
                : undefined
            }
            onSave={async (sql: string) => {
              try {
                const statements = sql.split(';').filter((s) => s.trim());
                for (const stmt of statements) {
                  if (stmt.trim()) {
                    await api.executeDDL(
                      designerTab.connectionId,
                      stmt.trim(),
                      designerTab.database
                    );
                  }
                }
                message.success(designerTab.isNewTable ? '表已创建' : '表结构已更新');
                setOpenedDesignerTabs((prev) =>
                  prev.filter((t) => t.key !== designerTab.key)
                );
                setActiveKey('objects');
                window.dispatchEvent(
                  new CustomEvent('refresh-connection-tree', {
                    detail: { connectionId: designerTab.connectionId },
                  })
                );
              } catch (err: any) {
                message.error(`执行失败：${err.message || err}`);
              }
            }}
            onCancel={() => {
              setOpenedDesignerTabs((prev) => prev.filter((t) => t.key !== designerTab.key));
              setActiveKey('objects');
            }}
          />
        </div>
      ),
      closable: true,
    })),
    // 视图定义 Tab
    ...openedViewDefTabs.map((viewDefTab) => ({
      key: viewDefTab.key,
      label: (
        <span
          onContextMenu={(e) => handleTabContextMenu(e, viewDefTab.key)}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
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
      closable: true,
    })),
  ];

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
      <Tabs
        type="editable-card"
        size="small"
        activeKey={activeKey}
        onChange={setActiveKey}
        hideAdd
        destroyInactiveTabPane
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
        tabBarStyle={{ margin: 0, padding: '0 4px', background: 'transparent', flexShrink: 0 }}
        tabBarGutter={2}
        items={tabItems}
        onEdit={handleTabEdit}
        renderTabBar={renderDraggableTabBar}
      />

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
              { key: 'close', label: '关闭', icon: <CloseOutlined /> },
              { key: 'closeOthers', label: '关闭其他' },
              { key: 'closeRight', label: '关闭右侧' },
              { type: 'divider' },
              { key: 'closeAll', label: '关闭全部', danger: true },
            ]}
            onClick={({ key }) => handleContextMenuAction(key, contextMenu.tabKey)}
          />
        </div>
      )}
    </div>
  );
});

export default TabPanel;
