import React, { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { Tree, Spin, Empty, Dropdown, Badge, Modal, message, Input, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  DatabaseOutlined,
  TableOutlined,
  EyeOutlined,
  LinkOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  DisconnectOutlined,
  CopyOutlined,
  FolderOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  CloudServerOutlined,
  FunctionOutlined,
  KeyOutlined,
  SearchOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import { theme } from 'antd';
import type { Connection, ConnectionGroup } from '../../stores/appStore';
import { useAppStore } from '../../stores/appStore';
import type { TableInfo, ColumnInfo, IndexInfo } from '../../types/api';
import { GroupDialog } from './GroupDialog';

// ============ Icon helpers ============

const DB_TYPE_COLORS: Record<string, string> = {
  mysql: '#1890ff',
  postgresql: '#52c41a',
  sqlite: '#faad14',
  sqlserver: '#eb2f96',
  oracle: '#fa8c16',
  mariadb: '#13c2c2',
  dameng: '#722ed1',
};

function getDbIcon(dbType: string) {
  const color = DB_TYPE_COLORS[dbType] || '#8c8c8c';
  return <DatabaseOutlined style={{ color }} />;
}

function getConnIcon(dbType: string) {
  const color = DB_TYPE_COLORS[dbType] || '#8c8c8c';
  return <CloudServerOutlined style={{ color }} />;
}

// ============ Props ============

type ConnectionTreeProps = {
  connections: Connection[];
  groups: ConnectionGroup[];
  selectedId: string | null;
  selectedTableId: string | null;
  onSelect: (id: string | null) => void;
  onTableSelect: (table: string | null, database?: string) => void;
  onTableOpen: (tableName: string, database?: string) => void;
  onExpand: (connectionId: string, expanded: boolean) => void;
  collapsed: boolean;
  searchText: string;
  expandedKeys: string[];
  onExpandKeys: (keys: string[]) => void;
  connectionDatabases: Record<string, { database: string; tables: TableInfo[]; loaded: boolean }[]>;
  isLoading: boolean;
  onConnect: (connectionId: string) => void;
  onDisconnect: (connectionId: string) => void;
  onEditConnection: (connection: Connection) => void;
  onDeleteConnection: (connectionId: string) => void;
  onNewQuery: (connectionId: string) => void;
  onDatabaseExpand: (connectionId: string, database: string) => void;
  onDatabaseRefresh?: (connectionId: string, database: string) => void;
  onLoadDatabases?: (connectionId: string) => void;
  onTableExpand: (connectionId: string, database: string, tableName: string) => void;
  onSaveConnection: (data: any) => Promise<void>;
  onSaveGroup: (data: {
    id?: string;
    name: string;
    icon: string;
    color: string;
    parent_id?: string;
  }) => void;
  onDeleteGroup: (id: string) => void;
  tableStructures: Record<string, { columns: ColumnInfo[]; indexes: IndexInfo[]; loaded: boolean }>;
};

// ============ Component ============

export function ConnectionTree({
  connections,
  groups,
  selectedId,
  selectedTableId,
  onSelect,
  onTableSelect,
  onTableOpen,
  onExpand,
  collapsed,
  searchText,
  expandedKeys,
  onExpandKeys,
  connectionDatabases,
  isLoading,
  onConnect,
  onDisconnect,
  onEditConnection,
  onDeleteConnection,
  onNewQuery,
  onDatabaseExpand,
  onDatabaseRefresh,
  onLoadDatabases,
  onTableExpand,
  onSaveConnection,
  onSaveGroup,
  onDeleteGroup,
  tableStructures,
}: ConnectionTreeProps) {
  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group dialog state
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ConnectionGroup | null>(null);
  const [parentGroupId, setParentGroupId] = useState<string | null>(null);

  // Inline rename state
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // 上一帧的数据库表数量快照，用于日志记录
  const prevTableCountsRef = useRef<Map<string, number>>(new Map());

  // 使用 ref 存储最新的 connectionDatabases，避免闭包问题
  const connectionDatabasesRef = useRef(connectionDatabases);
  useEffect(() => {
    connectionDatabasesRef.current = connectionDatabases;
  }, [connectionDatabases]);

  // 从 appStore 中获取表数据，确保与右侧同步
  const getTablesFromStore = useCallback((connectionId: string, database: string) => {
    const { getTableData } = useAppStore.getState();
    const cacheKey = `${connectionId}::${database || ''}`;
    const cached = getTableData(cacheKey);
    return cached?.tables || [];
  }, []);

  // 订阅 appStore 的 tableDataCache 变化，确保表数据更新时重新渲染
  const [storeVersion, setStoreVersion] = useState(0);
  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prevState) => {
      if (state.tableDataCache !== prevState.tableDataCache) {
        setStoreVersion((v) => v + 1);
      }
    });
    return unsub;
  }, []);

  // 表数据加载完成时记录日志（不再需要强制刷新 Tree）
  useEffect(() => {
    // 收集当前表数量并更新快照
    const currentTableCounts = new Map<string, number>();
    Object.entries(connectionDatabases).forEach(([connId, dbs]) => {
      dbs.forEach((db) => {
        if (db.loaded) {
          const tableCount = db.tables.filter((t) => t.table_type === 'BASE TABLE').length;
          currentTableCounts.set(`${connId}::${db.database}`, tableCount);
        }
      });
    });
    prevTableCountsRef.current = currentTableCounts;
  }, [connectionDatabases]);

  // ---- Grouped connections map ----
  const groupedConnections = useMemo(() => {
    const map: Record<string, Connection[]> = {};
    connections.forEach((conn) => {
      const groupId = conn.group_id || 'ungrouped';
      if (!map[groupId]) map[groupId] = [];
      map[groupId].push(conn);
    });
    return map;
  }, [connections]);

  // ---- Connection context menu ----
  const getConnectionMenu = useCallback(
    (conn: Connection): MenuProps => ({
      items:
        conn.status === 'connected'
          ? [
              { key: 'disconnect', label: '断开连接', icon: <DisconnectOutlined /> },
              { key: 'refresh', label: '刷新', icon: <ReloadOutlined /> },
              { type: 'divider' },
              { key: 'edit', label: '编辑连接', icon: <EditOutlined /> },
              { key: 'copy', label: '复制连接配置', icon: <CopyOutlined /> },
              { type: 'divider' },
              { key: 'new-query', label: '新建查询', icon: <PlayCircleOutlined /> },
              { type: 'divider' },
              {
                key: 'move',
                label: '移动至分组',
                icon: <FolderOutlined />,
                children: [
                  ...groups
                    .filter((g) => g.id !== 'default' || conn.group_id !== 'default')
                    .map((g) => ({
                      key: `move-to-${g.id}`,
                      label: g.id === 'default' 
                        ? <><MinusOutlined /> {g.name}</>
                        : <>{g.icon} {g.name}</>,
                      disabled: conn.group_id === g.id,
                    })),
                  { type: 'divider' },
                  { key: 'new-group', label: '新建分组', icon: <PlusOutlined /> },
                ],
              },
              { type: 'divider' },
              { key: 'delete', label: '删除连接', icon: <DeleteOutlined />, danger: true },
            ]
          : [
              { key: 'connect', label: '连接', icon: <LinkOutlined /> },
              { key: 'edit', label: '编辑连接', icon: <EditOutlined /> },
              { key: 'copy', label: '复制连接配置', icon: <CopyOutlined /> },
              { type: 'divider' },
              {
                key: 'move',
                label: '移动至分组',
                icon: <FolderOutlined />,
                children: [
                  ...groups
                    .filter((g) => g.id !== 'default' || conn.group_id !== 'default')
                    .map((g) => ({
                      key: `move-to-${g.id}`,
                      label: g.id === 'default' 
                        ? <><MinusOutlined /> {g.name}</>
                        : <>{g.icon} {g.name}</>,
                      disabled: conn.group_id === g.id,
                    })),
                  { type: 'divider' },
                  { key: 'new-group', label: '新建分组', icon: <PlusOutlined /> },
                ],
              },
              { type: 'divider' },
              { key: 'delete', label: '删除连接', icon: <DeleteOutlined />, danger: true },
            ],
      onClick: ({ key }) => {
        if (key === 'connect') {
          onConnect(conn.id);
        } else if (key === 'disconnect') {
          onDisconnect(conn.id);
        } else if (key === 'refresh') {
          // Collapse and re-expand to refresh
          onExpandKeys(expandedKeys.filter((k) => !k.startsWith(`db::${conn.id}::`)));
          onExpand(conn.id, true);
        } else if (key === 'edit') {
          onEditConnection(conn);
        } else if (key === 'delete') {
          Modal.confirm({
            title: '确认删除',
            content: `确定要删除连接 "${conn.name}" 吗？此操作不可撤销。`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => onDeleteConnection(conn.id),
          });
        } else if (key === 'new-query') {
          onNewQuery(conn.id);
        } else if (key === 'copy') {
          handleCopyConnection(conn);
        } else if (key === 'new-group') {
          setEditingGroup(null);
          setParentGroupId(null);
          setGroupDialogOpen(true);
        } else if (key.startsWith('move-to-')) {
          const targetGroupId = key.replace('move-to-', '');
          handleMoveConnection(conn.id, targetGroupId);
        }
      },
    }),
    [
      groups,
      expandedKeys,
      onConnect,
      onDisconnect,
      onExpand,
      onEditConnection,
      onDeleteConnection,
      onNewQuery,
      onExpandKeys,
      setGroupDialogOpen,
      setEditingGroup,
      setParentGroupId,
    ]
  );

  // ---- Group context menu ----
  const getGroupMenu = useCallback(
    (group: ConnectionGroup): MenuProps => ({
      items: [
        { key: 'new-connection', label: '新建连接', icon: <PlusOutlined /> },
        { key: 'new-group', label: '新建分组', icon: <FolderOutlined /> },
        { type: 'divider' },
        { key: 'rename', label: '重命名 (F2)', icon: <EditOutlined /> },
        { type: 'divider' },
        { key: 'export', label: '导出分组' },
        { type: 'divider' },
        {
          key: 'delete',
          label: '删除分组',
          icon: <DeleteOutlined />,
          danger: true,
          disabled: group.id === 'default',
        },
      ],
      onClick: ({ key }) => {
        if (key === 'new-connection') {
          // Trigger new connection with this group
          onEditConnection({
            id: '',
            name: '',
            db_type: 'mysql',
            host: 'localhost',
            port: 3306,
            username: '',
            status: 'disconnected',
            group_id: group.id,
          } as Connection);
        } else if (key === 'new-group') {
          setEditingGroup(null);
          setParentGroupId(group.id);
          setGroupDialogOpen(true);
        } else if (key === 'rename') {
          setRenamingKey(`group-${group.id}`);
          setRenameValue(group.name);
        } else if (key === 'delete') {
          const connCount = groupedConnections[group.id]?.length || 0;
          Modal.confirm({
            title: '确认删除分组',
            content:
              connCount > 0
                ? `确定要删除分组 "${group.name}" 吗？该分组下有 ${connCount} 个连接，连接将移至"不分组"。`
                : `确定要删除分组 "${group.name}" 吗？`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => onDeleteGroup(group.id),
          });
        }
      },
    }),
    [groupedConnections, onEditConnection, onDeleteGroup]
  );

  // ---- Database node context menu ----
  const getDatabaseMenu = useCallback(
    (connId: string, dbName: string): MenuProps => ({
      items: [
        { key: 'new-query', label: '新建查询', icon: <PlayCircleOutlined /> },
        { type: 'divider' },
        { key: 'refresh-db', label: '刷新数据库', icon: <ReloadOutlined /> },
        { type: 'divider' },
        { key: 'dump-structure', label: '转储 SQL 文件 → 仅结构' },
        { key: 'dump-full', label: '转储 SQL 文件 → 结构和数据' },
        { type: 'divider' },
        { key: 'run-sql-file', label: '运行 SQL 文件' },
        { type: 'divider' },
        { key: 'db-properties', label: '数据库属性' },
      ],
      onClick: ({ key }) => {
        if (key === 'new-query') {
          onNewQuery(connId);
        } else if (key === 'refresh-db') {
          onDatabaseRefresh?.(connId, dbName);
        } else {
          message.info('功能开发中...');
        }
      },
    }),
    [expandedKeys, onNewQuery, onDatabaseRefresh, onExpandKeys]
  );

  // ---- Table node context menu ----
  const getTableMenu = useCallback(
    (connId: string, tableName: string, database?: string): MenuProps => ({
      items: [
        { key: 'open-table', label: '打开表（浏览数据）' },
        { key: 'design-table', label: '设计表' },
        { type: 'divider' },
        { key: 'copy-table', label: '复制表 → 仅结构' },
        { key: 'copy-table-data', label: '复制表 → 结构和数据' },
        { type: 'divider' },
        { key: 'truncate-table', label: '清空表', danger: true },
        { key: 'drop-table', label: '删除表', danger: true },
        { type: 'divider' },
        { key: 'dump-table', label: '转储 SQL 文件' },
        { key: 'import-csv', label: '导入 CSV' },
        { key: 'export-csv', label: '导出 CSV' },
      ],
      onClick: ({ key }) => {
        if (key === 'open-table' || key === 'design-table') {
          onTableOpen(tableName, database);
        } else if (key === 'truncate-table') {
          Modal.confirm({
            title: '确认清空表',
            content: `确定要清空表 "${tableName}" 的所有数据吗？此操作不可撤销！`,
            okText: '清空',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => message.info('清空表功能开发中...'),
          });
        } else if (key === 'drop-table') {
          Modal.confirm({
            title: '确认删除表',
            content: `确定要删除表 "${tableName}" 及其所有数据吗？此操作不可撤销！`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => message.info('删除表功能开发中...'),
          });
        } else {
          message.info('功能开发中...');
        }
      },
    }),
    [onTableOpen]
  );

  // ---- View node context menu ----
  const getViewMenu = useCallback(
    (_connId: string, viewName: string, _database?: string): MenuProps => ({
      items: [
        { key: 'open-view', label: '打开视图（浏览数据）' },
        { key: 'design-view', label: '设计视图' },
        { type: 'divider' },
        { key: 'rename-view', label: '重命名视图' },
        { key: 'drop-view', label: '删除视图', danger: true },
        { type: 'divider' },
        { key: 'view-dependencies', label: '查看依赖关系' },
        { key: 'view-properties', label: '属性' },
      ],
      onClick: ({ key }) => {
        if (key === 'open-view' || key === 'design-view') {
          message.info('视图功能开发中...');
        } else if (key === 'drop-view') {
          Modal.confirm({
            title: '确认删除视图',
            content: `确定要删除视图 "${viewName}" 吗？`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => message.info('删除视图功能开发中...'),
          });
        } else {
          message.info('功能开发中...');
        }
      },
    }),
    []
  );

  // ---- Action handlers ----

  const handleCopyConnection = useCallback(
    async (conn: Connection) => {
      try {
        const copyData = {
          id: null,
          name: `${conn.name} (副本)`,
          db_type: conn.db_type,
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: '',
          database: conn.database,
          group_id: conn.group_id,
        };
        await onSaveConnection(copyData);
        message.success('连接配置已复制，请重新输入密码后保存');
      } catch (error: any) {
        message.error(`复制连接失败：${error.message || error}`);
      }
    },
    [onSaveConnection]
  );

  const handleMoveConnection = useCallback(
    async (connectionId: string, targetGroupId: string) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;
      try {
        await onSaveConnection({
          ...conn,
          id: conn.id,
          group_id: targetGroupId === 'default' ? null : targetGroupId,
        });
        const group = groups.find((g) => g.id === targetGroupId);
        message.success(`已移动到"${group?.name || '不分组'}"分组`);
      } catch (error: any) {
        message.error(`移动失败：${error.message || error}`);
      }
    },
    [connections, groups, onSaveConnection]
  );

  const handleGroupSave = useCallback(
    async (data: {
      id?: string;
      name: string;
      icon: string;
      color: string;
      parent_id?: string;
    }) => {
      onSaveGroup(data);
      setGroupDialogOpen(false);
      setEditingGroup(null);
      setParentGroupId(null);
    },
    [onSaveGroup]
  );

  const handleRenameCommit = useCallback(
    async (groupId: string) => {
      if (!renameValue.trim()) {
        setRenamingKey(null);
        return;
      }
      const group = groups.find((g) => g.id === groupId);
      if (group && group.name !== renameValue.trim()) {
        onSaveGroup({
          id: groupId,
          name: renameValue.trim(),
          icon: group.icon,
          color: group.color,
        });
      }
      setRenamingKey(null);
    },
    [groups, renameValue, onSaveGroup]
  );

  // ---- Click handler for dbl-click / single-click ----
  const handleTableClick = useCallback(
    (tableName: string, database?: string) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        onTableOpen(tableName, database);
      } else {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          onTableSelect(tableName, database);
        }, 250);
      }
    },
    [onTableOpen, onTableSelect]
  );

  // ---- Double click handler ----
  const handleDoubleClick = useCallback(
    (key: string) => {
      if (key.startsWith('table::')) {
        // 双击表 → 打开数据浏览
        const parts = key.split('::');
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const tableName = parts.slice(3).join('::');
          onTableOpen(tableName, database);
        }
      } else if (key.startsWith('view::')) {
        // 双击视图 → 打开视图数据浏览（未来实现）
        const parts = key.split('::');
        if (parts.length >= 4) {
          const viewName = parts.slice(3).join('::');
          message.info(`视图浏览功能开发中... (${viewName})`);
        }
      } else if (key.startsWith('db::')) {
        // 双击数据库 → 切换展开
        // 提取连接 ID 和数据库名（忽略可能的 loaded/tables 后缀）
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbKey = `db::${connectionId}::${database}`;

          // 检查是否已展开（匹配任何变体）
          const isExpanded = expandedKeys.some((k) => k.startsWith(dbKey));

          if (isExpanded) {
            onExpandKeys(expandedKeys.filter((k) => !k.startsWith(dbKey)));
          } else {
            // 先展开节点
            onExpandKeys([...expandedKeys, dbKey]);
            // 然后检查并加载表数据
            // 使用 ref 获取最新的 connectionDatabases，避免闭包问题
            const dbList = connectionDatabasesRef.current[connectionId] || [];
            const db = dbList.find((d) => d.database === database);

            // 如果数据库未加载或表数量为 0，触发加载
            if (!db || !db.loaded) {
              onDatabaseExpand(connectionId, database);
            }
          }
        }
      } else if (key.startsWith('tables::') || key.startsWith('views::')) {
        // 双击表/视图分组 → 切换展开
        const isExpanded = expandedKeys.includes(key);
        if (isExpanded) {
          onExpandKeys(expandedKeys.filter((k) => k !== key));
        } else {
          onExpandKeys([...expandedKeys, key]);
        }
      } else if (key.startsWith('group-')) {
        // 双击分组 → 切换展开
        const isExpanded = expandedKeys.includes(key);
        if (isExpanded) {
          onExpandKeys(expandedKeys.filter((k) => k !== key));
        } else {
          onExpandKeys([...expandedKeys, key]);
        }
      } else {
        // 双击连接 → 连接/切换展开
        const conn = connections.find((c) => c.id === key);
        if (!conn) return;

        if (conn.status !== 'connected') {
          onConnect(key);
        } else {
          // 已连接 → 切换展开
          const isExpanded = expandedKeys.includes(key);
          if (isExpanded) {
            onExpandKeys(expandedKeys.filter((k) => k !== key));
          } else {
            onExpandKeys([...expandedKeys, key]);
          }
        }
      }
    },
    [
      connections,
      expandedKeys,
      onExpandKeys,
      onConnect,
      onTableOpen,
      onDatabaseExpand,
    ]
  );

  // ---- Build connection node ----
  const buildConnectionNode = useCallback(
    (conn: Connection) => {
      // 使用 ref 获取最新的 connectionDatabases，避免闭包问题
      const dbList = connectionDatabasesRef.current[conn.id] || [];
      const isConnRenaming = false;

      const databaseChildren = dbList.map((db) => {
        // 优先从 appStore 中读取表数据，确保与右侧同步
        const storeTables = getTablesFromStore(conn.id, db.database);
        const isLoaded = db.loaded || storeTables.length > 0;
        const tableItems = isLoaded
          ? (storeTables.length > 0 ? storeTables : db.tables).filter((t) => t.table_type === 'BASE TABLE')
          : [];
        const viewItems = isLoaded
          ? (storeTables.length > 0 ? storeTables : db.tables).filter((t) => t.table_type === 'VIEW')
          : [];

        const dbExpanded = expandedKeys.some((k) => k.startsWith(`db::${conn.id}::${db.database}`));

        return {
          key: `db::${conn.id}::${db.database}`,
          title: (
            <Dropdown menu={getDatabaseMenu(conn.id, db.database)} trigger={['contextMenu']}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleDoubleClick(`db::${conn.id}::${db.database}`);
                }}
              >
                <DatabaseOutlined
                  style={{
                    color: isLoaded ? '#52c41a' : '#1890ff',
                    fontSize: 12,
                  }}
                />
                <span
                  style={{
                    color: isLoaded ? '#52c41a' : undefined,
                    fontWeight: isLoaded ? 500 : undefined,
                  }}
                >
                  {db.database}
                </span>
              </div>
            </Dropdown>
          ),
          children: isLoaded
            ? [
                {
                  key: `tables::${conn.id}::${db.database}`,
                  title: (
                    <span
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleDoubleClick(`tables::${conn.id}::${db.database}`);
                      }}
                    >
                      <TableOutlined style={{ color: '#52c41a', fontSize: 12 }} />表 (
                      {tableItems.length})
                    </span>
                  ),
                  isLeaf: false,
                  children:
                    tableItems.length > 0
                      ? tableItems.map((table) => ({
                          key: `table::${conn.id}::${db.database}::${table.table_name}`,
                          isLeaf: true,
                          title: (
                            <span
                              style={{
                                cursor: 'pointer',
                                padding: '1px 4px',
                                borderRadius: 3,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                              onClick={() => handleTableClick(table.table_name, db.database)}
                              onDoubleClick={() => onTableOpen(table.table_name, db.database)}
                            >
                              <TableOutlined style={{ color: '#52c41a', fontSize: 11 }} />
                              {table.table_name}
                            </span>
                          ),
                        }))
                      : [
                          {
                            key: `no-tables::${conn.id}::${db.database}`,
                            title: <span style={{ color: '#999', fontSize: 11 }}>暂无表</span>,
                            isLeaf: true,
                            selectable: false,
                          },
                        ],
                },
                {
                  key: `views::${conn.id}::${db.database}`,
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <EyeOutlined style={{ color: '#1890ff', fontSize: 12 }} />
                      视图 ({viewItems.length})
                    </span>
                  ),
                  isLeaf: false,
                  children:
                    viewItems.length > 0
                      ? viewItems.map((view) => ({
                          key: `view::${conn.id}::${db.database}::${view.table_name}`,
                          isLeaf: true,
                          title: (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <EyeOutlined style={{ color: '#1890ff', fontSize: 11 }} />
                              {view.table_name}
                            </span>
                          ),
                        }))
                      : [
                          {
                            key: `no-views::${conn.id}::${db.database}`,
                            title: <span style={{ color: '#999', fontSize: 11 }}>暂无视图</span>,
                            isLeaf: true,
                            selectable: false,
                          },
                        ],
                },
              ]
            : undefined,
        };
      });

      // Connection title
      let connTitle: React.ReactNode;
      if (isConnRenaming) {
        connTitle = <Input size="small" defaultValue={conn.name} style={{ width: 100 }} />;
      } else {
        const isConnected = conn.status === 'connected';

        connTitle = (
          <Dropdown menu={getConnectionMenu(conn)} trigger={['contextMenu']}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flex: 1,
                paddingRight: 4,
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleDoubleClick(conn.id);
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    filter: isConnected ? 'none' : 'grayscale(100%)',
                    opacity: isConnected ? 1 : 0.4,
                  }}
                >
                  {getDbIcon(conn.db_type)}
                </span>
                <span
                  style={{
                    color: isConnected
                      ? isDarkMode
                        ? '#e8e8e8'
                        : '#262626'
                      : isDarkMode
                        ? '#666666'
                        : '#999999',
                    fontWeight: isConnected ? 500 : 400,
                    transition: 'color 0.2s ease',
                  }}
                >
                  {conn.name}
                </span>
                {conn.status === 'connected' && (
                  <span style={{ color: '#52c41a', fontSize: 10 }}>●</span>
                )}
                {conn.status === 'loading' && (
                  <span style={{ color: '#faad14', fontSize: 10 }}>●</span>
                )}
              </span>
            </div>
          </Dropdown>
        );
      }

      const isConnected = conn.status === 'connected';

      return {
        key: conn.id,
        title: connTitle,
        children: isConnected
          ? databaseChildren.length > 0
            ? databaseChildren
            : [
                {
                  key: `tables-${conn.id}`,
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <TableOutlined style={{ color: '#52c41a', fontSize: 12 }} />表
                    </span>
                  ),
                  isLeaf: false,
                  selectable: false,
                  children: [],
                },
                {
                  key: `views-${conn.id}`,
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <EyeOutlined style={{ color: '#1890ff', fontSize: 12 }} />
                      视图
                    </span>
                  ),
                  isLeaf: false,
                  selectable: false,
                  children: [],
                },
                {
                  key: `procedures-${conn.id}`,
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ThunderboltOutlined style={{ color: '#faad14', fontSize: 12 }} />
                      存储过程
                    </span>
                  ),
                  isLeaf: true,
                  selectable: false,
                },
                {
                  key: `functions-${conn.id}`,
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FunctionOutlined style={{ color: '#722ed1', fontSize: 12 }} />
                      函数
                    </span>
                  ),
                  isLeaf: true,
                  selectable: false,
                },
              ]
          : undefined,
      };
    },
    [
      connectionDatabases,
      tableStructures,
      selectedTableId,
      isDarkMode,
      expandedKeys,
      storeVersion,
      getConnectionMenu,
      getDatabaseMenu,
      getTableMenu,
      getViewMenu,
      handleTableClick,
      handleDoubleClick,
    ]
  );

  // ---- Build tree data ----
  const treeData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const treeNodes: any[] = [];
    const autoExpandKeys: string[] = [];

    // 辅助函数：判断表类型
    const isBaseTable = (tableType: string): boolean => {
      const normalizedType = tableType.toUpperCase().trim();
      return (
        normalizedType === 'BASE TABLE' ||
        normalizedType === 'TABLE' ||
        normalizedType === 'BASE_TABLE' ||
        // SQLite 可能返回空字符串或 null
        normalizedType === '' ||
        normalizedType === 'NULL'
      );
    };

    const isView = (tableType: string): boolean => {
      const normalizedType = tableType.toUpperCase().trim();
      return (
        normalizedType === 'VIEW' ||
        normalizedType === 'SYSTEM VIEW' ||
        normalizedType === 'MATERIALIZED VIEW' ||
        normalizedType === 'MATERIALIZED_VIEW'
      );
    };

    // Helper: check if any item in a list matches the query
    const matchTables = (tables: TableInfo[]) =>
      !q || tables.some((t) => t.table_name.toLowerCase().includes(q));
    const matchViews = (tables: TableInfo[]) =>
      !q ||
      tables
        .filter((t) => isView(t.table_type))
        .some((v) => v.table_name.toLowerCase().includes(q));

    // Build table children with filtering
    const buildTableNodes = (
      connId: string,
      db: { database: string; tables: TableInfo[]; loaded: boolean },
      allTableItems: TableInfo[],
      allViewItems: TableInfo[],
      isDbExpanded: boolean
    ) => {
      const tableItems = allTableItems;
      const viewItems = allViewItems;

      // Filter tables
      const filteredTables = q
        ? tableItems.filter((t) => t.table_name.toLowerCase().includes(q))
        : tableItems;
      const filteredViews = q
        ? viewItems.filter((v) => v.table_name.toLowerCase().includes(q))
        : viewItems;

      // Build "Tables" folder
      const tablesNode = {
        key: `tables::${connId}::${db.database}`,
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <TableOutlined style={{ color: '#52c41a', fontSize: 12 }} />
            <span>表 ({db.loaded ? filteredTables.length : 0})</span>
          </span>
        ),
        isLeaf: false,
        children: !db.loaded
          ? [
              {
                key: `loading-tables::${connId}::${db.database}`,
                title: <span style={{ color: '#999', fontSize: 11 }}>点击展开加载表...</span>,
                isLeaf: true,
                selectable: false,
              },
            ]
          : filteredTables.length > 0
            ? filteredTables.map((table) => ({
                key: `table::${connId}::${db.database}::${table.table_name}`,
                isLeaf: true,
                title: (
                  <Dropdown
                    menu={getTableMenu(connId, table.table_name, db.database)}
                    trigger={['contextMenu']}
                  >
                    <span
                      style={{
                        cursor: 'pointer',
                        background:
                          selectedTableId === table.table_name
                            ? isDarkMode
                              ? 'rgba(24, 144, 255, 0.2)'
                              : 'rgba(24, 144, 255, 0.1)'
                            : 'transparent',
                        padding: '1px 4px',
                        borderRadius: 3,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTableClick(table.table_name, db.database);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onTableOpen(table.table_name, db.database);
                      }}
                    >
                      <TableOutlined style={{ color: '#52c41a', fontSize: 11 }} />
                      {table.table_name}
                    </span>
                  </Dropdown>
                ),
              }))
            : [
                {
                  key: `no-tables::${connId}::${db.database}`,
                  title: <span style={{ color: '#999', fontSize: 11 }}>暂无表</span>,
                  isLeaf: true,
                  selectable: false,
                },
              ],
      };

      // Build "Views" folder
      const viewsNode = {
        key: `views::${connId}::${db.database}`,
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <EyeOutlined style={{ color: '#1890ff', fontSize: 12 }} />
            <span>视图 ({db.loaded ? filteredViews.length : 0})</span>
          </span>
        ),
        isLeaf: false,
        children: !db.loaded
          ? [
              {
                key: `loading-views::${connId}::${db.database}`,
                title: <span style={{ color: '#999', fontSize: 11 }}>点击展开加载视图...</span>,
                isLeaf: true,
                selectable: false,
              },
            ]
          : filteredViews.length > 0
            ? filteredViews.map((view) => ({
                key: `view::${connId}::${db.database}::${view.table_name}`,
                isLeaf: true,
                title: (
                  <Dropdown
                    menu={getViewMenu(connId, view.table_name, db.database)}
                    trigger={['contextMenu']}
                  >
                    <span
                      style={{
                        cursor: 'pointer',
                        padding: '1px 4px',
                        borderRadius: 3,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        message.info(`视图浏览功能开发中... (${view.table_name})`);
                      }}
                    >
                      <EyeOutlined style={{ color: '#1890ff', fontSize: 11 }} />
                      {view.table_name}
                    </span>
                  </Dropdown>
                ),
              }))
            : [
                {
                  key: `no-views::${connId}::${db.database}`,
                  title: <span style={{ color: '#999', fontSize: 11 }}>暂无视图</span>,
                  isLeaf: true,
                  selectable: false,
                },
              ],
      };

      // Build "Procedures" folder
      const proceduresNode = {
        key: `procedures::${connId}::${db.database}`,
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ThunderboltOutlined style={{ color: '#faad14', fontSize: 12 }} />
            存储过程
          </span>
        ),
        isLeaf: true,
        selectable: false,
        children: [
          {
            key: `no-procedures::${connId}::${db.database}`,
            title: <span style={{ color: '#999', fontSize: 11 }}>暂无存储过程</span>,
            isLeaf: true,
            selectable: false,
          },
        ],
      };

      // Build "Functions" folder
      const functionsNode = {
        key: `functions::${connId}::${db.database}`,
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FunctionOutlined style={{ color: '#722ed1', fontSize: 12 }} />
            函数
          </span>
        ),
        isLeaf: true,
        selectable: false,
        children: [
          {
            key: `no-functions::${connId}::${db.database}`,
            title: <span style={{ color: '#999', fontSize: 11 }}>暂无函数</span>,
            isLeaf: true,
            selectable: false,
          },
        ],
      };

      // Only show tables/views nodes if they have content or if no search
      const dbChildren = q
        ? [
            ...(filteredTables.length ? [tablesNode] : []),
            ...(filteredViews.length ? [viewsNode] : []),
            proceduresNode,
            functionsNode,
          ]
        : [tablesNode, viewsNode, proceduresNode, functionsNode];

      // Auto-expand if search matches children
      if (q && (filteredTables.length > 0 || filteredViews.length > 0)) {
        autoExpandKeys.push(`db::${connId}::${db.database}`);
        if (filteredTables.length > 0) autoExpandKeys.push(tablesNode.key);
        if (filteredViews.length > 0) autoExpandKeys.push(viewsNode.key);
      }

      return {
        key: `db::${connId}::${db.database}`,
        title: (
          <Dropdown menu={getDatabaseMenu(connId, db.database)} trigger={['contextMenu']}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleDoubleClick(`db::${connId}::${db.database}`);
              }}
            >
              <DatabaseOutlined
                style={{
                  color: db.loaded ? '#52c41a' : '#1890ff',
                  fontSize: 12,
                }}
              />
              <span
                style={{
                  color: db.loaded ? '#52c41a' : undefined,
                  fontWeight: db.loaded ? 500 : undefined,
                }}
              >
                {db.database}
              </span>
            </div>
          </Dropdown>
        ),
        isLeaf: !db.loaded,
        children: db.loaded ? dbChildren : undefined,
      };
    };

    // Build connection node with filtering
    const buildConnNode = (conn: Connection) => {
      const dbList = connectionDatabases[conn.id] || [];
      const connNameMatch = !q || conn.name.toLowerCase().includes(q);
      const isExpanded = expandedKeys.includes(conn.id);

      let dbNodes: any[] = [];
      for (const db of dbList) {
        const dbMatch = !q || db.database.toLowerCase().includes(q);
        const storeTables = getTablesFromStore(conn.id, db.database);
        const isLoaded = db.loaded || storeTables.length > 0;
        const tableItems = isLoaded
          ? (storeTables.length > 0 ? storeTables : db.tables).filter((t) => t.table_type === 'BASE TABLE')
          : [];
        const viewItems = isLoaded
          ? (storeTables.length > 0 ? storeTables : db.tables).filter((t) => t.table_type === 'VIEW')
          : [];

        const tablesMatch = matchTables(tableItems);
        const viewsMatch = matchViews(storeTables.length > 0 ? storeTables : db.tables);
        const isDbExpanded = expandedKeys.some((k) => k.startsWith(`db::${conn.id}::${db.database}`));

        if (q && !dbMatch && !tablesMatch && !viewsMatch && !isDbExpanded) continue;

        const dbNode = buildTableNodes(conn.id, db, tableItems, viewItems, isDbExpanded);
        if (dbNode) dbNodes.push(dbNode);

        if (q && dbNode && (tablesMatch || viewsMatch || dbMatch)) {
          autoExpandKeys.push(conn.id);
        }
      }

      // If search is active and no children match, hide this connection (unless it's expanded)
      if (q && !connNameMatch && dbNodes.length === 0 && !isExpanded) return null;

      const connTitle = (
        <Dropdown menu={getConnectionMenu(conn)} trigger={['contextMenu']}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleDoubleClick(conn.id);
            }}
          >
            {getConnIcon(conn.db_type)}
            <span
              style={{
                color: conn.status === 'connected' ? '#52c41a' : undefined,
                fontWeight: conn.status === 'connected' ? 500 : undefined,
              }}
            >
              {conn.name}
            </span>
            {conn.status === 'connected' && (
              <span style={{ color: '#52c41a', fontSize: 10 }}>●</span>
            )}
            {conn.status === 'loading' && (
              <span style={{ color: '#faad14', fontSize: 10 }}>●</span>
            )}
            {conn.database && (
              <span style={{ color: '#999', fontSize: 11 }}>({conn.database})</span>
            )}
          </div>
        </Dropdown>
      );

      return {
        key: conn.id,
        title: connTitle,
        isLeaf: conn.status !== 'connected',
        children:
          conn.status === 'connected'
            ? dbNodes.length > 0
              ? dbNodes
              : [
                  {
                    key: `loading::${conn.id}`,
                    title: <span style={{ color: '#999', fontSize: 11 }}>暂无数据库</span>,
                    isLeaf: true,
                    selectable: false,
                  },
                ]
            : undefined,
      };
    };

    // 1. 遍历有实际分组的连接
    const realGroups = groups.filter((g) => g.id !== 'default');
    for (const group of realGroups) {
      const groupMatch = !q || group.name.toLowerCase().includes(q);
      const groupConns: Connection[] = [];

      for (const conn of groupedConnections[group.id] || []) {
        const node = buildConnNode(conn);
        if (node) groupConns.push(conn); // just track it exists
      }

      // Rebuild to get actual nodes
      const groupConnNodes = (groupedConnections[group.id] || [])
        .map((conn) => buildConnNode(conn))
        .filter(Boolean);

      if (groupConnNodes.length === 0 && q) continue;

      // Auto-expand group if search matches
      if (q && (groupMatch || groupConnNodes.length > 0)) {
        autoExpandKeys.push(`group-${group.id}`);
      }

      const groupKey = `group-${group.id}`;
      const isRenaming = renamingKey === groupKey;

      let groupTitle: React.ReactNode;
      if (isRenaming) {
        groupTitle = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
            <Input
              size="small"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onPressEnter={() => handleRenameCommit(group.id)}
              onBlur={() => handleRenameCommit(group.id)}
              autoFocus
              style={{ width: 100, height: 22, padding: '0 4px' }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        );
      } else {
        groupTitle = (
          <Dropdown menu={getGroupMenu(group)} trigger={['contextMenu']}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flex: 1,
                paddingRight: 4,
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleDoubleClick(groupKey);
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 14 }}>{group.icon}</span>
                <span style={{ fontWeight: 500, color: group.color }}>{group.name}</span>
              </span>
              <Badge
                count={groupConnNodes.length}
                style={{ backgroundColor: group.color, boxShadow: 'none' }}
              />
            </div>
          </Dropdown>
        );
      }

      treeNodes.push({
        key: groupKey,
        title: groupTitle,
        isLeaf: false,
        children: groupConnNodes,
      });
    }

    // 2. 添加不分组的连接（直接作为顶级节点）
    const ungroupedConnNodes = (groupedConnections['ungrouped'] || [])
      .map((conn) => buildConnNode(conn))
      .filter(Boolean);

    if (ungroupedConnNodes.length > 0 || !q) {
      for (const node of ungroupedConnNodes) {
        treeNodes.push(node);
      }
    }

    // Auto-expand matching keys (MOVED TO useEffect BELOW)
    // if (q && autoExpandKeys.length > 0) {
    //   onExpandKeys([...new Set(autoExpandKeys)]);
    // }

    return treeNodes;
  }, [
    groups,
    groupedConnections,
    connections,
    searchText,
    connectionDatabases,
    expandedKeys,
    selectedTableId,
    isDarkMode,
    renamingKey,
    renameValue,
    storeVersion,
    buildConnectionNode,
    getGroupMenu,
    getDatabaseMenu,
    getTableMenu,
    getViewMenu,
    getConnectionMenu,
    handleDoubleClick,
    handleTableClick,
    handleRenameCommit,
    onExpandKeys,
    onTableOpen,
  ]);

  // Auto-expand matching keys when search changes
  useEffect(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return;

    const autoExpandKeys: string[] = [];

    // Collect keys that match search
    for (const conn of connections) {
      if (conn.name.toLowerCase().includes(q)) {
        autoExpandKeys.push(conn.id);
        if (conn.group_id) {
          autoExpandKeys.push(`group-${conn.group_id}`);
        }
        const dbList = connectionDatabases[conn.id] || [];
        for (const db of dbList) {
          if (db.database.toLowerCase().includes(q)) {
            autoExpandKeys.push(`db::${conn.id}::${db.database}`);
          }
          const tableItems = db.loaded
            ? db.tables.filter((t) => t.table_type === 'BASE TABLE')
            : [];
          const viewItems = db.loaded ? db.tables.filter((t) => t.table_type === 'VIEW') : [];
          const matchTables = tableItems.some((t) => t.table_name.toLowerCase().includes(q));
          const matchViews = viewItems.some((v) => v.table_name.toLowerCase().includes(q));
          if (matchTables) {
            autoExpandKeys.push(
              conn.id,
              `db::${conn.id}::${db.database}`,
              `tables::${conn.id}::${db.database}`
            );
          }
          if (matchViews) {
            autoExpandKeys.push(
              conn.id,
              `db::${conn.id}::${db.database}`,
              `views::${conn.id}::${db.database}`
            );
          }
        }
      }
    }

    if (autoExpandKeys.length > 0) {
      onExpandKeys([...new Set(autoExpandKeys)]);
    }
  }, [searchText, connections, connectionDatabases, onExpandKeys]);

  // ---- Tree event handlers ----

  const handleExpand = useCallback(
    (keys: React.Key[], info: { node: any; expanded: boolean }) => {
      const strKeys = keys as string[];
      onExpandKeys(strKeys);

      const key = info.node?.key as string;
      if (!key) return;

      console.log('[Tree] handleExpand key:', key, 'expanded:', info.expanded);

      // Connection expand: auto-connect on expand
      if (
        !key.startsWith('group-') &&
        !key.startsWith('tables::') &&
        !key.startsWith('views::') &&
        !key.startsWith('db::') &&
        !key.startsWith('procedures::') &&
        !key.startsWith('functions::')
      ) {
        const conn = connections.find((c) => c.id === key);
        if (info.expanded && conn && conn.status !== 'connected') {
          onConnect(key);
        } else if (info.expanded && conn && conn.status === 'connected') {
          // 已连接但数据库列表未加载时，加载数据库列表
          const dbList = connectionDatabases[key] || [];
          if (dbList.length === 0 && onLoadDatabases) {
            console.log(
              '[Tree] Connection expanded but no databases loaded, calling onLoadDatabases...'
            );
            onLoadDatabases(key);
          }
        }
        onExpand(key, info.expanded);
      }

      // Database expand - 展开数据库节点时加载表列表
      if (key.startsWith('db::') && info.expanded) {
        const parts = key.split('::');
        const connectionId = parts[1];
        const database = parts[2];

        // 使用 ref 获取最新的 connectionDatabases，避免闭包问题
        const dbList = connectionDatabasesRef.current[connectionId] || [];
        const db = dbList.find((d) => d.database === database);

        if (db && !db.loaded) {
          onDatabaseExpand(connectionId, database);
        } else if (!db) {
          onDatabaseExpand(connectionId, database);
        } else if (db.tables.length === 0) {
          // 即使已加载，如果表数量为 0，也尝试重新加载
          onDatabaseExpand(connectionId, database);
        }
      }

      // Table expand - 展开表节点时加载列和索引
      if (key.startsWith('table::') && info.expanded) {
        const parts = key.split('::');
        // table::connectionId::database::tableName
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const tableName = parts.slice(3).join('::'); // 处理表名中包含 :: 的情况
          console.log('[Tree] Table expand:', connectionId, database, tableName);
          onTableExpand(connectionId, database, tableName);
        }
      }
    },
    [
      connections,
      connectionDatabases,
      onExpandKeys,
      onConnect,
      onExpand,
      onDatabaseExpand,
      onTableExpand,
      onLoadDatabases,
    ]
  );

  const handleSelect = useCallback(
    (keys: React.Key[]) => {
      const key = keys[0] as string;
      if (!key) return;

      if (key.startsWith('table::')) {
        // Table selection - extract connectionId, database and tableName
        const parts = key.split('::');
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const tableName = parts.slice(3).join('::');
          onSelect(connectionId);
          onTableSelect(tableName, database);
        }
      } else if (key.startsWith('db::')) {
        // DB selection - 单击不做任何操作
        return;
      } else if (key.startsWith('tables::') || key.startsWith('views::')) {
        // Tables/Views group selection - extract connectionId and database
        const parts = key.split('::');
        const connectionId = parts[1];
        const database = parts[2];
        onSelect(connectionId);
        onTableSelect(null, database);
      } else if (key.startsWith('group-')) {
        // Group selection - do nothing special
      } else if (key.startsWith('table::') || key.startsWith('view::')) {
        // 表/视图选择
      } else {
        // 连接节点 - 单击不做任何操作
        return;
      }
    },
    [onSelect, onTableSelect]
  );

  // ---- Collapsed tree view ----
  if (collapsed) {
    return (
      <div style={{ padding: '8px 12px' }}>
        {isLoading ? (
          <Spin size="small" />
        ) : connections.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无连接" />
        ) : (
          connections.map((conn) => (
            <Dropdown key={conn.id} menu={getConnectionMenu(conn)} trigger={['contextMenu']}>
              <div
                onClick={() => onSelect(conn.id)}
                style={{
                  padding: '8px',
                  marginBottom: 4,
                  borderRadius: 6,
                  cursor: 'pointer',
                  background:
                    selectedId === conn.id
                      ? isDarkMode
                        ? 'rgba(24, 144, 255, 0.2)'
                        : 'rgba(24, 144, 255, 0.1)'
                      : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
              >
                {getDbIcon(conn.db_type)}
              </div>
            </Dropdown>
          ))
        )}

        <div
          style={{
            marginTop: 8,
            padding: '6px',
            borderRadius: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
            border: `1px dashed ${isDarkMode ? '#434343' : '#d9d9d9'}`,
          }}
          onClick={() => {
            setEditingGroup(null);
            setParentGroupId(null);
            setGroupDialogOpen(true);
          }}
        >
          <PlusOutlined style={{ color: isDarkMode ? '#8c8c8c' : '#bfbfbf' }} />
        </div>

        <GroupDialog
          open={groupDialogOpen}
          editingGroup={editingGroup}
          parentGroupId={parentGroupId}
          onCancel={() => {
            setGroupDialogOpen(false);
            setEditingGroup(null);
            setParentGroupId(null);
          }}
          onSave={handleGroupSave}
        />
      </div>
    );
  }

  // ---- Full tree view ----
  return (
    <div>
      <Spin spinning={isLoading} size="small">
        {connections.length === 0 && !isLoading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无连接"
            style={{ padding: '20px 0' }}
          >
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}
            >
              <span style={{ fontSize: 12, color: '#999' }}>创建第一个连接开始使用</span>
            </div>
          </Empty>
        ) : (
          <Tree
            showIcon={false}
            selectedKeys={selectedId ? [selectedId] : []}
            expandedKeys={expandedKeys}
            onExpand={(keys, info) => {
              handleExpand(keys, info);
            }}
            onSelect={handleSelect}
            treeData={treeData as any}
            style={{ background: 'transparent', padding: '0 4px 8px', fontSize: 12 }}
            className="connection-tree"
          />
        )}
      </Spin>

      {/* Group Dialog */}
      <GroupDialog
        open={groupDialogOpen}
        editingGroup={editingGroup}
        parentGroupId={parentGroupId}
        onCancel={() => {
          setGroupDialogOpen(false);
          setEditingGroup(null);
          setParentGroupId(null);
        }}
        onSave={handleGroupSave}
      />
    </div>
  );
}

export default ConnectionTree;
