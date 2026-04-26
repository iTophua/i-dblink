import React, { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Tabs, Empty, Breadcrumb, Menu, App, Modal, Tooltip } from 'antd';
import type { TabsProps } from 'antd';
import {
  DatabaseOutlined,
  TableOutlined,
  AppstoreOutlined,
  HomeOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { SQLEditor } from '../SQLEditor';
import { DataTable } from '../DataTable';
import { TableList } from '../TableList';
import { TableStructure } from '../TableStructure';
import type { TableInfo } from '../../types/api';

interface TabPanelProps {
  selectedConnectionId: string | null;
  selectedConnectionName?: string;
  selectedTable: string | null;
  selectedDatabase?: string;
  selectedObjectType?: 'table' | 'view' | 'all';
  /** 双击表时设置此值，TabPanel 会打开新的数据浏览 Tab */
  tableToOpen?: { name: string; database?: string } | null;
  /** 当有 SQL 查询 Tab 打开时回调，用于控制日志面板显示 */
  onSqlTabCountChange?: (count: number) => void;
  /** 分页大小 */
  pageSize?: number;
  /** 当前连接的数据库列表 */
  connectionDatabases?: Record<string, { database: string; tables: TableInfo[]; loaded: boolean; loadFailed?: boolean }[]>;
}

interface OpenedTable {
  name: string;
  connectionId: string;
  connectionName: string;
  database?: string;
  isDirty?: boolean; // 是否有未保存的更改
}

interface OpenedSqlTab {
  key: string;
  title: string;
  connectionId?: string;
  database?: string;
}

export interface TabPanelRef {
  hasConnectionTabs: (connectionId: string) => boolean;
  hasDatabaseTabs: (connectionId: string, database: string) => boolean;
  closeConnectionTabs: (connectionId: string) => void;
  closeDatabaseTabs: (connectionId: string, database: string) => void;
  getConnectionTabInfo: (connectionId: string) => { dataTabCount: number; sqlTabCount: number };
  getDatabaseTabInfo: (connectionId: string, database: string) => { dataTabCount: number };
}

export const TabPanel = forwardRef<TabPanelRef, TabPanelProps>(function TabPanelInner({
  selectedConnectionId,
  selectedConnectionName,
  selectedTable,
  selectedDatabase,
  selectedObjectType = 'all',
  tableToOpen,
  onSqlTabCountChange,
  pageSize,
  connectionDatabases,
}, ref) {
  const { message } = App.useApp();
  // 已打开的数据浏览 Tab 列表
  const [openedTables, setOpenedTables] = useState<OpenedTable[]>([]);
  // SQL 查询 Tab 列表（动态添加/删除）
  const [openedSqlTabs, setOpenedSqlTabs] = useState<OpenedSqlTab[]>([]);
  const [activeKey, setActiveKey] = useState('objects');

  useImperativeHandle(ref, () => ({
    hasConnectionTabs: (connectionId: string) => {
      const hasDataTabs = openedTables.some((t) => t.connectionId === connectionId);
      const hasSqlTabs = openedSqlTabs.some((t) => t.connectionId === connectionId);
      return hasDataTabs || hasSqlTabs;
    },
    hasDatabaseTabs: (connectionId: string, database: string) => {
      return openedTables.some(
        (t) => t.connectionId === connectionId && t.database === database
      );
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
  }));

  // 通知父组件 SQL Tab 数量变化
  useEffect(() => {
    onSqlTabCountChange?.(openedSqlTabs.length);
  }, [openedSqlTabs.length, onSqlTabCountChange]);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    tabKey: string;
  }>({ visible: false, x: 0, y: 0, tabKey: '' });

  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 监听 tab-action 事件（来自菜单或工具栏）
  useEffect(() => {
    const handleTabAction = (event: CustomEvent<{ action: string; connectionId?: string; database?: string }>) => {
      const { action, connectionId: eventConnId, database: eventDb } = event.detail;
      if (action === 'new-sql-tab') {
        const newSqlKey = `sql-${Date.now()}`;
        const connId = eventConnId || selectedConnectionId;
        // 如果传入了数据库，使用传入的；否则使用当前选中的数据库
        const dbName = eventDb || selectedDatabase;
        setOpenedSqlTabs((prev) => [
          ...prev,
          { key: newSqlKey, title: 'SQL 查询', connectionId: connId || undefined, database: dbName },
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
    (tableName: string, database?: string) => {
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
          },
        ]);
      }
      setActiveKey(dataTabKey);
    },
    [selectedConnectionId, selectedConnectionName, openedTables]
  );

  // 监听 tableToOpen 变化，当双击树中的表时打开新 Tab
  useEffect(() => {
    if (tableToOpen && selectedConnectionId) {
      openTableTab(tableToOpen.name, tableToOpen.database);
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
                <TableOutlined style={{ marginRight: 4, flexShrink: 0 }} />
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {table.name}
                </span>
                {table.isDirty && <span style={{ color: 'var(--color-error)', marginLeft: 4 }}>*</span>}
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
            availableDatabases={
              selectedConnectionId && connectionDatabases?.[selectedConnectionId]
                ? connectionDatabases[selectedConnectionId].map((db) => db.database)
                : []
            }
            onDatabaseChange={(database) => {
              setOpenedSqlTabs((prev) =>
                prev.map((t) =>
                  t.key === sqlTab.key ? { ...t, database } : t
                )
              );
            }}
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
