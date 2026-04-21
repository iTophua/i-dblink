import React, { useRef, useCallback, useState, useMemo, useEffect, ChangeEvent, MouseEvent } from 'react';
import { Tree, Spin, Dropdown, Badge, Modal, message, Tooltip, theme } from 'antd';
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
  MinusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { Connection, ConnectionGroup } from '../../stores/appStore';
import { useAppStore } from '../../stores/appStore';
import type { TableInfo } from '../../types/api';
import { GroupDialog } from './GroupDialog';
import { EnhancedEmptyState } from '../LoadingStates';
import { GlobalInput } from '../GlobalInput';

const DB_TYPE_COLORS: Record<string, string> = {
  mysql: '#1890ff',
  postgresql: '#52c41a',
  sqlite: '#faad14',
  sqlserver: '#eb2f96',
  oracle: '#fa8c16',
  mariadb: '#13c2c2',
  dameng: '#722ed1',
};

const isBaseTable = (tableType: string): boolean => {
  const normalizedType = (tableType || '').toUpperCase().trim();
  if (!normalizedType || normalizedType === 'NULL') return false;
  return (
    normalizedType === 'BASE TABLE' ||
    normalizedType === 'TABLE' ||
    normalizedType === 'BASE_TABLE' ||
    normalizedType === 'SYSTEM TABLE' ||
    normalizedType === 'SYSTEM TABLES' ||
    normalizedType === 'LOCAL TEMPORARY' ||
    normalizedType === 'GLOBAL TEMPORARY' ||
    normalizedType === 'TEMPORARY'
  );
};

const isView = (tableType: string): boolean => {
  const normalizedType = (tableType || '').toUpperCase().trim();
  if (!normalizedType) return false;
  return (
    normalizedType === 'VIEW' ||
    normalizedType === 'SYSTEM VIEW' ||
    normalizedType === 'SYSTEM VIEWS' ||
    normalizedType === 'MATERIALIZED VIEW' ||
    normalizedType === 'MATERIALIZED_VIEW'
  );
};

const TABLE_NODE_STYLE = {
  cursor: 'pointer',
  padding: '1px 4px',
  borderRadius: 3,
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  gap: 4,
  transition: 'all 0.2s ease',
};

const SELECTED_BG_DARK = 'rgba(24, 144, 255, 0.2)';
const SELECTED_BG_LIGHT = 'rgba(24, 144, 255, 0.1)';

interface QuickActionButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick: (e: React.MouseEvent) => void;
  visible: boolean;
  isDarkMode: boolean;
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  icon,
  tooltip,
  onClick,
  visible,
  isDarkMode,
}) => {
  if (!visible) return null;

  return (
    <Tooltip title={tooltip} placement="right">
      <span
        onClick={onClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 11,
          background: isDarkMode ? '#303030' : '#f0f0f0',
          color: isDarkMode ? '#bfbfbf' : '#595959',
          transition: 'all 0.2s ease',
          marginLeft: 4,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isDarkMode ? '#434343' : '#d9d9d9';
          e.currentTarget.style.color = '#1890ff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isDarkMode ? '#303030' : '#f0f0f0';
          e.currentTarget.style.color = isDarkMode ? '#bfbfbf' : '#595959';
        }}
      >
        {icon}
      </span>
    </Tooltip>
  );
};

interface TableNodeProps {
  connId: string;
  database: string;
  table: TableInfo;
  selectedTableId: string | null;
  isDarkMode: boolean;
  onTableClick: (tableName: string, database: string) => void;
  onTableOpen: (tableName: string, database: string) => void;
  onContextMenu: (connId: string, tableName: string, database?: string) => MenuProps;
  onNewQuery: (connId: string) => void;
}

const TableNode = React.memo<TableNodeProps>(({
  connId,
  database,
  table,
  selectedTableId,
  isDarkMode,
  onTableClick,
  onTableOpen,
  onContextMenu,
  onNewQuery,
}) => {
  const [hovered, setHovered] = useState(false);
  const isSelected = selectedTableId === table.table_name;
  const backgroundColor = isSelected
    ? isDarkMode ? SELECTED_BG_DARK : SELECTED_BG_LIGHT
    : hovered
    ? isDarkMode ? 'rgba(24, 144, 255, 0.1)' : 'rgba(24, 144, 255, 0.05)'
    : 'transparent';

  return (
    <Dropdown menu={onContextMenu(connId, table.table_name, database)} trigger={['contextMenu']}>
      <span
        style={{
          ...TABLE_NODE_STYLE,
          background: backgroundColor,
          border: isSelected ? `1px solid ${isDarkMode ? '#177ddc60' : '#1890ff60'}` : '1px solid transparent',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onTableClick(table.table_name, database);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onTableOpen(table.table_name, database);
        }}
      >
        <TableOutlined style={{ color: '#52c41a', fontSize: 11 }} />
        <span style={{ fontSize: 12 }}>{table.table_name}</span>
        {hovered && (
          <>
            <QuickActionButton
              icon={<PlayCircleOutlined />}
              tooltip="新建查询"
              visible={hovered}
              isDarkMode={isDarkMode}
              onClick={(e) => {
                e.stopPropagation();
                onNewQuery(connId);
              }}
            />
            <QuickActionButton
              icon={<SwapOutlined style={{ fontSize: 10 }} />}
              tooltip="查看数据"
              visible={hovered}
              isDarkMode={isDarkMode}
              onClick={(e) => {
                e.stopPropagation();
                onTableOpen(table.table_name, database);
              }}
            />
          </>
        )}
      </span>
    </Dropdown>
  );
});

interface ViewNodeProps {
  connId: string;
  database: string;
  view: TableInfo;
  selectedTableId: string | null;
  isDarkMode: boolean;
  onTableClick: (tableName: string, database: string) => void;
  onTableOpen: (tableName: string, database: string) => void;
  onContextMenu: (connId: string, tableName: string, database?: string) => MenuProps;
  onNewQuery: (connId: string) => void;
}

const ViewNode = React.memo<ViewNodeProps>(({
  connId,
  database,
  view,
  selectedTableId,
  isDarkMode,
  onTableClick,
  onTableOpen,
  onContextMenu,
  onNewQuery,
}) => {
  const [hovered, setHovered] = useState(false);
  const isSelected = selectedTableId === view.table_name;
  const backgroundColor = isSelected
    ? isDarkMode ? SELECTED_BG_DARK : SELECTED_BG_LIGHT
    : hovered
    ? isDarkMode ? 'rgba(24, 144, 255, 0.1)' : 'rgba(24, 144, 255, 0.05)'
    : 'transparent';

  return (
    <Dropdown menu={onContextMenu(connId, view.table_name, database)} trigger={['contextMenu']}>
      <span
        style={{
          ...TABLE_NODE_STYLE,
          background: backgroundColor,
          border: isSelected ? `1px solid ${isDarkMode ? '#177ddc60' : '#1890ff60'}` : '1px solid transparent',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onTableClick(view.table_name, database);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onTableOpen(view.table_name, database);
        }}
      >
        <EyeOutlined style={{ color: '#1890ff', fontSize: 11 }} />
        <span style={{ fontSize: 12 }}>{view.table_name}</span>
        {hovered && (
          <QuickActionButton
            icon={<PlayCircleOutlined />}
            tooltip="新建查询"
            visible={hovered}
            isDarkMode={isDarkMode}
            onClick={(e) => {
              e.stopPropagation();
              onNewQuery(connId);
            }}
          />
        )}
      </span>
    </Dropdown>
  );
});

type ConnectionTreeProps = {
  connections: Connection[];
  groups: ConnectionGroup[];
  selectedId: string | null;
  selectedTableId: string | null;
  onSelect: (id: string | null) => void;
  onTableSelect: (table: string | null, database?: string) => void;
  onObjectTypeSelect?: (objectType: 'table' | 'view' | 'all', database?: string) => void;
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
  onDatabaseClose?: (connectionId: string, database: string) => void;
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
  onCreateConnection?: () => void;
};

function getDbIcon(dbType: string) {
  const color = DB_TYPE_COLORS[dbType] || '#8c8c8c';
  return <DatabaseOutlined style={{ color }} />;
}

function getConnIcon(dbType: string) {
  const color = DB_TYPE_COLORS[dbType] || '#8c8c8c';
  return <CloudServerOutlined style={{ color }} />;
}

export function EnhancedConnectionTree({
  connections,
  groups,
  selectedId,
  selectedTableId,
  onSelect,
  onTableSelect,
  onObjectTypeSelect,
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
  onDatabaseClose,
  onLoadDatabases,
  onTableExpand,
  onSaveConnection,
  onSaveGroup,
  onDeleteGroup,
  onCreateConnection,
}: ConnectionTreeProps) {
  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ConnectionGroup | null>(null);
  const [parentGroupId, setParentGroupId] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const prevTableCountsRef = useRef<Map<string, number>>(new Map());
  const connectionDatabasesRef = useRef(connectionDatabases);
  const expandedKeysRef = useRef(expandedKeys);

  useEffect(() => {
    connectionDatabasesRef.current = connectionDatabases;
  }, [connectionDatabases]);

  useEffect(() => {
    expandedKeysRef.current = expandedKeys;
  }, [expandedKeys]);

  useEffect(() => {
    const currentTableCounts = new Map<string, number>();
    Object.entries(connectionDatabases).forEach(([connId, dbs]) => {
      dbs.forEach((db) => {
        if (db.loaded) {
          // 使用与表过滤相同的逻辑计算表数量，保持一致性
          const tableCount = db.tables.filter((t) => isBaseTable(t.table_type)).length;
          currentTableCounts.set(`${connId}::${db.database}`, tableCount);
        }
      });
    });
    prevTableCountsRef.current = currentTableCounts;
  }, [connectionDatabases]);

  const groupedConnections = useMemo(() => {
    const map: Record<string, Connection[]> = {};
    connections.forEach((conn) => {
      const groupId = conn.group_id || 'ungrouped';
      if (!map[groupId]) map[groupId] = [];
      map[groupId].push(conn);
    });
    return map;
  }, [connections]);

  const filteredConnections = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter(
      (conn) =>
        conn.name.toLowerCase().includes(q) ||
        conn.host.toLowerCase().includes(q)
    );
  }, [connections, searchText]);

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
                      label:
                        g.id === 'default' ? (
                          <>
                            <MinusOutlined /> {g.name}
                          </>
                        ) : (
                          <>
                            {g.icon} {g.name}
                          </>
                        ),
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
                      label:
                        g.id === 'default' ? (
                          <>
                            <MinusOutlined /> {g.name}
                          </>
                        ) : (
                          <>
                            {g.icon} {g.name}
                          </>
                        ),
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

  const getDatabaseMenu = useCallback(
    (connId: string, dbName: string): MenuProps => ({
      items: [
        { key: 'new-query', label: '新建查询', icon: <PlayCircleOutlined /> },
        { type: 'divider' },
        { key: 'refresh-db', label: '刷新数据库', icon: <ReloadOutlined /> },
        { key: 'close-db', label: '关闭数据库', icon: <DisconnectOutlined /> },
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
        } else if (key === 'close-db') {
          onDatabaseClose?.(connId, dbName);
        } else {
          message.info('功能开发中...');
        }
      },
    }),
    [onNewQuery, onDatabaseRefresh, onDatabaseClose]
  );

  const getTableMenu = useCallback(
    (_connId: string, tableName: string, database?: string): MenuProps => ({
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

  const handleDoubleClick = useCallback(
    (key: string) => {
      if (key.startsWith('table::')) {
        const parts = key.split('::');
        if (parts.length >= 4) {
          const database = parts[2];
          const tableName = parts.slice(3).join('::');
          onTableOpen(tableName, database);
        }
      } else if (key.startsWith('view::')) {
        const parts = key.split('::');
        if (parts.length >= 4) {
          const database = parts[2];
          const viewName = parts.slice(3).join('::');
          onTableOpen(viewName, database);
        }
      } else if (key.startsWith('db::')) {
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbKey = `db::${connectionId}::${database}`;

          const isExpanded = expandedKeysRef.current.some((k) => k.startsWith(dbKey));

          if (isExpanded) {
            onExpandKeys(expandedKeysRef.current.filter((k) => !k.startsWith(dbKey)));
          } else {
            // 展开数据库时加载数据
            const dbList = connectionDatabasesRef.current[connectionId] || [];
            const db = dbList.find((d) => d.database === database);
            if (!db || !db.loaded || db.tables.length === 0) {
              onDatabaseExpand(connectionId, database);
            }
            onExpandKeys([...expandedKeysRef.current, dbKey]);
          }
        }
      } else if (key.startsWith('tables::') || key.startsWith('views::')) {
        const isExpanded = expandedKeysRef.current.includes(key);
        if (isExpanded) {
          onExpandKeys(expandedKeysRef.current.filter((k) => k !== key));
        } else {
          onExpandKeys([...expandedKeysRef.current, key]);
        }
      } else if (key.startsWith('group-')) {
        const isExpanded = expandedKeysRef.current.includes(key);
        if (isExpanded) {
          onExpandKeys(expandedKeysRef.current.filter((k) => k !== key));
        } else {
          onExpandKeys([...expandedKeysRef.current, key]);
        }
      } else {
        const conn = connections.find((c) => c.id === key);
        if (!conn) return;

        if (conn.status !== 'connected') {
          onConnect(key);
        } else {
          const isExpanded = expandedKeysRef.current.includes(key);
          if (isExpanded) {
            onExpandKeys(expandedKeysRef.current.filter((k) => k !== key));
          } else {
            onExpandKeys([...expandedKeysRef.current, key]);
          }
        }
      }
    },
    [connections, onExpandKeys, onConnect, onTableOpen, onDatabaseExpand]
  );

  const treeData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const treeNodes: any[] = [];

    const matchTables = (tables: TableInfo[]) =>
      !q || tables.some((t) => t.table_name.toLowerCase().includes(q));
    const matchViews = (tables: TableInfo[]) =>
      !q ||
      tables
        .filter((t) => isView(t.table_type))
        .some((v) => v.table_name.toLowerCase().includes(q));

    const buildTableNodes = (
      connId: string,
      db: { database: string; tables: TableInfo[]; loaded: boolean },
      allTableItems: TableInfo[] | undefined,
      allViewItems: TableInfo[] | undefined,
      isDbExpanded: boolean
    ) => {
      // 当正在加载时（allTableItems 为 undefined），使用空数组
      const tableItems = allTableItems || [];
      const viewItems = allViewItems || [];
      // 标记是否正在加载（db 未 loaded 但 allTableItems 为 undefined）
      const isLoading = !db.loaded && allTableItems === undefined;

      const tablesFolderKey = `tables::${connId}::${db.database}`;
      const viewsFolderKey = `views::${connId}::${db.database}`;
      const isTablesFolderExpanded = expandedKeys.includes(tablesFolderKey);
      const isViewsFolderExpanded = expandedKeys.includes(viewsFolderKey);

      const filteredTables = searchText.trim()
        ? tableItems.filter((t) => t.table_name.toLowerCase().includes(searchText.trim().toLowerCase()))
        : tableItems;
      const filteredViews = searchText.trim()
        ? viewItems.filter((v) => v.table_name.toLowerCase().includes(searchText.trim().toLowerCase()))
        : viewItems;

      const tablesNode = {
        key: tablesFolderKey,
        title: isLoading ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#999' }}>
            <Spin size="small" />
            <span>表 (加载中...)</span>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <TableOutlined style={{ color: '#52c41a', fontSize: 12 }} />
            <span>表 ({tableItems.length})</span>
          </span>
        ),
        isLeaf: false,
        children: !db.loaded
          ? [
              {
                key: `init-tables::${connId}::${db.database}`,
                title: <span style={{ color: '#999', fontSize: 11 }}>点击展开加载表...</span>,
                isLeaf: true,
                selectable: false,
              },
            ]
          : isTablesFolderExpanded && tableItems.length > 0
            ? filteredTables.map((table) => ({
                key: `table::${connId}::${db.database}::${table.table_name}`,
                isLeaf: true,
                title: (
                  <TableNode
                    connId={connId}
                    database={db.database}
                    table={table}
                    selectedTableId={selectedTableId}
                    isDarkMode={isDarkMode}
                    onTableClick={handleTableClick}
                    onTableOpen={onTableOpen}
                    onContextMenu={getTableMenu}
                    onNewQuery={onNewQuery}
                  />
                ),
              }))
            : tableItems.length > 0
              ? undefined
              : [
                  {
                    key: `no-tables::${connId}::${db.database}`,
                    title: <span style={{ color: '#999', fontSize: 11 }}>暂无表</span>,
                    isLeaf: true,
                    selectable: false,
                  },
                ],
      };

      const viewsNode = {
        key: viewsFolderKey,
        title: isLoading ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#999', userSelect: 'none' }}>
            <Spin size="small" />
            <span>视图 (加载中...)</span>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
            <EyeOutlined style={{ color: '#1890ff', fontSize: 12 }} />
            <span>视图 ({viewItems.length})</span>
          </span>
        ),
        isLeaf: false,
        children: !db.loaded
          ? [
              {
                key: `init-views::${connId}::${db.database}`,
                title: <span style={{ color: '#999', fontSize: 11 }}>点击展开加载视图...</span>,
                isLeaf: true,
                selectable: false,
              },
            ]
          : isViewsFolderExpanded && viewItems.length > 0
            ? filteredViews.map((view) => ({
                key: `view::${connId}::${db.database}::${view.table_name}`,
                isLeaf: true,
                title: (
                  <ViewNode
                    connId={connId}
                    database={db.database}
                    view={view}
                    selectedTableId={selectedTableId}
                    isDarkMode={isDarkMode}
                    onTableClick={handleTableClick}
                    onTableOpen={onTableOpen}
                    onContextMenu={getViewMenu}
                    onNewQuery={onNewQuery}
                  />
                ),
              }))
            : viewItems.length > 0
              ? undefined
              : [
                  {
                    key: `no-views::${connId}::${db.database}`,
                    title: <span style={{ color: '#999', fontSize: 11 }}>暂无视图</span>,
                    isLeaf: true,
                    selectable: false,
                  },
                ],
      };

      const proceduresNode = {
        key: `procedures::${connId}::${db.database}`,
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
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

      const functionsNode = {
        key: `functions::${connId}::${db.database}`,
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
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

      const dbChildren = q
        ? [
            ...(filteredTables.length ? [tablesNode] : []),
            ...(filteredViews.length ? [viewsNode] : []),
            proceduresNode,
            functionsNode,
          ]
        : [tablesNode, viewsNode, proceduresNode, functionsNode];

      return {
        key: `db::${connId}::${db.database}`,
        title: (
          <div
            style={{ width: '100%' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleDoubleClick(`db::${connId}::${db.database}`);
            }}
          >
            <Dropdown menu={getDatabaseMenu(connId, db.database)} trigger={['contextMenu']}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  userSelect: 'none',
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
                    userSelect: 'none',
                  }}
                >
                  {db.database}
                </span>
              </div>
            </Dropdown>
          </div>
        ),
        children: db.loaded || isDbExpanded ? dbChildren : undefined,
      };
    };

    const buildConnNode = (conn: Connection) => {
      const dbList = connectionDatabases[conn.id] || [];
      const connNameMatch = !q || conn.name.toLowerCase().includes(q);
      const isExpanded = expandedKeys.includes(conn.id);

      let dbNodes: any[] = [];
      for (const db of dbList) {
        const dbMatch = !q || db.database.toLowerCase().includes(q);
        // 直接使用 db.tables，因为 connectionDatabases 已包含加载的表数据
        const isDbExpanded = expandedKeys.some((k) =>
          k.startsWith(`db::${conn.id}::${db.database}`)
        );
        // 当数据库正在展开但数据未加载时，不显示表数量（显示"加载中"）
        const tableItems = db.loaded
          ? db.tables.filter((t) => isBaseTable(t.table_type))
          : isDbExpanded
          ? undefined
          : [];
        const viewItems = db.loaded
          ? db.tables.filter((t) => isView(t.table_type))
          : isDbExpanded
          ? undefined
          : [];

        const tablesMatch = matchTables(tableItems || []);
        const viewsMatch = matchViews(db.tables || []);


        if (q && !dbMatch && !tablesMatch && !viewsMatch && !isDbExpanded) continue;

        const dbNode = buildTableNodes(conn.id, db, tableItems, viewItems, isDbExpanded);
        if (dbNode) dbNodes.push(dbNode);
      }

      if (q && !connNameMatch && dbNodes.length === 0 && !isExpanded) return null;

      const connTitle = (
        <div
          style={{ width: '100%' }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handleDoubleClick(conn.id);
          }}
        >
          <Dropdown menu={getConnectionMenu(conn)} trigger={['contextMenu']}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
            >
              {getConnIcon(conn.db_type)}
              <span
                style={{
                  color: conn.status === 'connected' ? '#52c41a' : undefined,
                  fontWeight: conn.status === 'connected' ? 500 : undefined,
                  userSelect: 'none',
                }}
              >
                {conn.name}
              </span>
              {conn.status === 'connected' && (
                <Tooltip title="已连接">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#52c41a',
                      animation: 'pulse 2s infinite',
                    }}
                  />
                </Tooltip>
              )}
              {conn.status === 'loading' && (
                <Tooltip title="连接中...">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#faad14',
                      animation: 'pulse 1s infinite',
                    }}
                  />
                </Tooltip>
              )}
              {conn.database && (
                <span style={{ color: '#999', fontSize: 11 }}>({conn.database})</span>
              )}
            </div>
          </Dropdown>
        </div>
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

    const realGroups = groups.filter((g) => g.id !== 'default');
    for (const group of realGroups) {
      const groupConnNodes = (groupedConnections[group.id] || [])
        .map((conn) => buildConnNode(conn))
        .filter(Boolean);

      if (groupConnNodes.length === 0 && q) continue;

      const groupKey = `group-${group.id}`;
      const isRenaming = renamingKey === groupKey;

      let groupTitle: React.ReactNode;
      if (isRenaming) {
        groupTitle = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
            <GlobalInput
              size="small"
              value={renameValue}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
              onPressEnter={() => handleRenameCommit(group.id)}
              onBlur={() => handleRenameCommit(group.id)}
              autoFocus
              style={{ width: 100, height: 22, padding: '0 4px' }}
              onClick={(e: MouseEvent) => e.stopPropagation()}
            />
          </div>
        );
      } else {
        groupTitle = (
          <div
            style={{ width: '100%' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleDoubleClick(groupKey);
            }}
          >
            <Dropdown menu={getGroupMenu(group)} trigger={['contextMenu']}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingRight: 4,
                  userSelect: 'none',
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
          </div>
        );
      }

      treeNodes.push({
        key: groupKey,
        title: groupTitle,
        isLeaf: false,
        children: groupConnNodes,
      });
    }

    const ungroupedConnNodes = (groupedConnections['ungrouped'] || [])
      .map((conn) => buildConnNode(conn))
      .filter(Boolean);

    if (ungroupedConnNodes.length > 0 || !q) {
      for (const node of ungroupedConnNodes) {
        treeNodes.push(node);
      }
    }

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
    handleTableClick,
    onTableOpen,
    getTableMenu,
    onNewQuery,
    handleDoubleClick,
    getConnectionMenu,
    getGroupMenu,
    getDatabaseMenu,
    getViewMenu,
    handleRenameCommit,
    handleCopyConnection,
    handleMoveConnection,
    onSaveGroup,
    filteredConnections,
  ]);

  useEffect(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return;

    const expandSet = new Set<string>();

    for (const conn of filteredConnections) {
      const dbList = connectionDatabases[conn.id] || [];
      for (const db of dbList) {
        if (db.database.toLowerCase().includes(q)) {
          expandSet.add(`db::${conn.id}::${db.database}`);
        }

        if (db.loaded && db.tables.length > 0) {
          let matchTables = false;
          let matchViews = false;

          for (const table of db.tables) {
            const tableName = table.table_name.toLowerCase();
            if (tableName.includes(q)) {
              if (isBaseTable(table.table_type)) {
                matchTables = true;
              } else if (isView(table.table_type)) {
                matchViews = true;
              }
            }
          }

          if (matchTables) {
            expandSet.add(`db::${conn.id}::${db.database}`);
            expandSet.add(`tables::${conn.id}::${db.database}`);
          }
          if (matchViews) {
            expandSet.add(`db::${conn.id}::${db.database}`);
            expandSet.add(`views::${conn.id}::${db.database}`);
          }
        }
      }
    }

    if (expandSet.size > 0) {
      onExpandKeys(Array.from(expandSet));
    }
  }, [searchText, filteredConnections, connectionDatabases, onExpandKeys]);

  const handleExpand = useCallback(
    (keys: React.Key[], info: { node: any; expanded: boolean }) => {
      const strKeys = keys as string[];
      onExpandKeys(strKeys);

      const key = info.node?.key as string;
      if (!key) return;

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
          const dbList = connectionDatabases[key] || [];
          if (dbList.length === 0 && onLoadDatabases) {
            onLoadDatabases(key);
          }
        }
        onExpand(key, info.expanded);
      }

      if (key.startsWith('db::') && info.expanded) {
        // 展开数据库时加载表数据
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbList = connectionDatabasesRef.current[connectionId] || [];
          const db = dbList.find((d) => d.database === database);
          if (!db || !db.loaded || db.tables.length === 0) {
            onDatabaseExpand(connectionId, database);
          }
        }
      }

      if (key.startsWith('tables::') && info.expanded) {
        // 展开"表"文件夹时加载表数据
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          // 检查是否已加载
          const dbList = connectionDatabasesRef.current[connectionId] || [];
          const db = dbList.find((d) => d.database === database);
          if (!db || !db.loaded || db.tables.length === 0) {
            onDatabaseExpand(connectionId, database);
          }
        }
      }

      if (key.startsWith('views::') && info.expanded) {
        // 展开"视图"文件夹时也加载表数据（视图和表从同一接口获取）
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          const database = parts[2];
          const dbList = connectionDatabasesRef.current[connectionId] || [];
          const db = dbList.find((d) => d.database === database);
          if (!db || !db.loaded || db.tables.length === 0) {
            onDatabaseExpand(connectionId, database);
          }
        }
      }

      if (key.startsWith('table::') && info.expanded) {
        const parts = key.split('::');
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const tableName = parts.slice(3).join('::');
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
        const parts = key.split('::');
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const tableName = parts.slice(3).join('::');
          onSelect(connectionId);
          onTableSelect(tableName, database);
          onObjectTypeSelect?.('table', database);
        }
      } else if (key.startsWith('view::')) {
        const parts = key.split('::');
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const viewName = parts.slice(3).join('::');
          onSelect(connectionId);
          onTableSelect(viewName, database);
          onObjectTypeSelect?.('view', database);
        }
      } else if (key.startsWith('db::')) {
        // 单击数据库节点只选中，不加载数据（展开时才会加载）
        const parts = key.split('::');
        if (parts.length >= 3) {
          const connectionId = parts[1];
          onSelect(connectionId);
        }
      } else if (key.startsWith('tables::')) {
        const parts = key.split('::');
        const connectionId = parts[1];
        const database = parts[2];
        onSelect(connectionId);
        onTableSelect(null, database);
        onObjectTypeSelect?.('table', database);
      } else if (key.startsWith('views::')) {
        const parts = key.split('::');
        const connectionId = parts[1];
        const database = parts[2];
        onSelect(connectionId);
        onTableSelect(null, database);
        onObjectTypeSelect?.('view', database);
      } else if (key.startsWith('group-')) {
      } else {
        const conn = connections.find((c) => c.id === key);
        if (conn) {
          onSelect(key);
          onTableSelect(null, undefined);
          onObjectTypeSelect?.('all', undefined);
        }
      }
    },
    [onSelect, onTableSelect, onObjectTypeSelect, connections]
  );

  if (collapsed) {
    return (
      <div style={{ padding: '8px 12px' }}>
        {isLoading ? (
          <Spin size="small" />
        ) : connections.length === 0 ? (
          <EnhancedEmptyState
            icon={<DatabaseOutlined />}
            title="暂无连接"
            description="创建第一个数据库连接开始使用"
            action={{
              label: '新建连接',
              onClick: () => onCreateConnection?.(),
              icon: <PlusOutlined />,
            }}
          />
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

  return (
    <div>
      <Spin spinning={isLoading} size="small">
        {connections.length === 0 && !isLoading ? (
          <EnhancedEmptyState
            icon={<DatabaseOutlined />}
            title="暂无连接"
            description="创建第一个数据库连接开始使用 iDBLink"
            action={{
              label: '新建连接',
              onClick: () => onCreateConnection?.(),
              icon: <PlusOutlined />,
            }}
            secondaryAction={{
              label: '导入连接',
              onClick: () => message.info('导入功能开发中...'),
              icon: <FolderOutlined />,
            }}
            tips={[
              '点击左侧「新建连接」按钮创建您的第一个数据库连接',
              '支持 MySQL、PostgreSQL、SQLite、SQL Server 等多种数据库',
              '右键点击连接树可以快速访问更多操作',
            ]}
          />
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
            style={{
              background: 'transparent',
              padding: '0 4px 8px',
              fontSize: 12,
              userSelect: 'none',
            }}
            className="connection-tree"
            blockNode
            virtual
          />
        )}
      </Spin>

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

export default EnhancedConnectionTree;
