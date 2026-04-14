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
} from '@ant-design/icons';
import { theme } from 'antd';
import type { Connection, ConnectionGroup } from '../../stores/appStore';
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
  onSaveGroup: (data: { id?: string; name: string; icon: string; color: string; parent_id?: string }) => void;
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
                children: groups
                  .filter((g) => g.id !== 'default' || conn.group_id !== 'default')
                  .map((g) => ({
                    key: `move-to-${g.id}`,
                    label: `${g.icon} ${g.name}`,
                    disabled: conn.group_id === g.id,
                  })),
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
                children: groups
                  .filter((g) => g.id !== 'default' || conn.group_id !== 'default')
                  .map((g) => ({
                    key: `move-to-${g.id}`,
                    label: `${g.icon} ${g.name}`,
                    disabled: conn.group_id === g.id,
                  })),
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
        } else if (key.startsWith('move-to-')) {
          const targetGroupId = key.replace('move-to-', '');
          handleMoveConnection(conn.id, targetGroupId);
        }
      },
    }),
    [groups, expandedKeys, onConnect, onDisconnect, onExpand, onEditConnection, onDeleteConnection, onNewQuery, onExpandKeys]
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
        { key: 'delete', label: '删除分组', icon: <DeleteOutlined />, danger: true, disabled: group.id === 'default' },
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
            content: connCount > 0
              ? `确定要删除分组 "${group.name}" 吗？该分组下有 ${connCount} 个连接，连接将移至"未分组"。`
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
        message.success(`已移动到"${group?.name || '未分组'}"分组`);
      } catch (error: any) {
        message.error(`移动失败：${error.message || error}`);
      }
    },
    [connections, groups, onSaveConnection]
  );

  const handleGroupSave = useCallback(
    async (data: { id?: string; name: string; icon: string; color: string; parent_id?: string }) => {
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
        onSaveGroup({ id: groupId, name: renameValue.trim(), icon: group.icon, color: group.color });
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
      console.log('[Tree] Double click:', key);

      if (key.startsWith('table::')) {
        // 双击表 → 打开数据浏览
        const parts = key.split('::');
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const tableName = parts.slice(3).join('::');
          console.log('[Tree] Open table:', tableName, database);
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
        const isExpanded = expandedKeys.includes(key);
        if (isExpanded) {
          onExpandKeys(expandedKeys.filter((k) => k !== key));
        } else {
          onExpandKeys([...expandedKeys, key]);
          // 展开数据库节点时，如果数据未加载，触发加载
          const parts = key.split('::');
          if (parts.length >= 3) {
            const connectionId = parts[1];
            const database = parts[2];
            const dbList = connectionDatabases[connectionId] || [];
            const db = dbList.find((d) => d.database === database);
            if (db && !db.loaded) {
              onDatabaseExpand(connectionId, database);
            } else if (!db) {
              // 数据库对象不存在，也尝试加载（可能是连接后首次展开）
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
          // 未连接 → 连接
          console.log('[Tree] Connect and expand:', key);
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
    [connections, expandedKeys, onExpandKeys, onConnect, onTableOpen, onDatabaseExpand, connectionDatabases]
  );

  // ---- Build connection node ----
  const buildConnectionNode = useCallback(
    (conn: Connection) => {
      const dbList = connectionDatabases[conn.id] || [];
      const isConnRenaming = false;

      const databaseChildren = dbList.map((db) => {
        const isLoaded = db.loaded;
        const tableItems = isLoaded
          ? db.tables.filter((t) => t.table_type === 'BASE TABLE')
          : [];
        const viewItems = isLoaded ? db.tables.filter((t) => t.table_type === 'VIEW') : [];

        return {
          key: `db::${conn.id}::${db.database}`,
          isLeaf: false,
          title: (
            <Dropdown menu={getDatabaseMenu(conn.id, db.database)} trigger={['contextMenu']}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleDoubleClick(`db::${conn.id}::${db.database}`);
                }}
              >
                <DatabaseOutlined style={{ color: '#1890ff', fontSize: 12 }} />
                <span>{db.database}</span>
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
                      <TableOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                      表 ({tableItems.length})
                    </span>
                  ),
                  isLeaf: false,
                  children:
                    tableItems.length > 0
                      ? tableItems.map((table) => {
                          const tableKey = `${conn.id}::${db.database}::${table.table_name}`;
                          const structure = tableStructures[tableKey];
                          const isTableExpanded = expandedKeys.includes(`table::${tableKey}`);
                          
                          return {
                            key: `table::${tableKey}`,
                            isLeaf: false,  // 改为 false 以支持展开
                            title: (
                              <Dropdown
                                menu={getTableMenu(conn.id, table.table_name, db.database)}
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
                            children: isTableExpanded && structure?.loaded
                              ? [
                                  {
                                    key: `columns::${tableKey}`,
                                    title: (
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <KeyOutlined style={{ color: '#faad14', fontSize: 11 }} />
                                        列 ({structure.columns.length})
                                      </span>
                                    ),
                                    isLeaf: true,
                                    selectable: false,
                                    children: structure.columns.map((col) => ({
                                      key: `column::${tableKey}::${col.column_name}`,
                                      title: (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                          <span style={{ color: col.column_key === 'PRI' ? '#ff4d4f' : '#8c8c8c' }}>
                                            {col.column_key === 'PRI' ? '🔑' : '•'}
                                          </span>
                                          <span>{col.column_name}</span>
                                          <span style={{ color: '#8c8c8c', fontSize: 10 }}>{col.data_type}</span>
                                          {col.is_nullable === false && <span style={{ color: '#ff4d4f', fontSize: 9 }}>NOT NULL</span>}
                                        </span>
                                      ),
                                      isLeaf: true,
                                      selectable: false,
                                    })),
                                  },
                                  {
                                    key: `indexes::${tableKey}`,
                                    title: (
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <SearchOutlined style={{ color: '#1890ff', fontSize: 11 }} />
                                        索引 ({structure.indexes.length})
                                      </span>
                                    ),
                                    isLeaf: true,
                                    selectable: false,
                                    children: structure.indexes.length > 0
                                      ? structure.indexes.map((idx) => ({
                                          key: `index::${tableKey}::${idx.index_name}`,
                                          title: (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                              <span>{idx.is_primary ? '🔑' : '📇'}</span>
                                              <span>{idx.index_name}</span>
                                              <span style={{ color: '#8c8c8c', fontSize: 10 }}>({idx.column_name})</span>
                                              {idx.is_unique && <Tag color="blue" style={{ fontSize: 9, padding: '0 4px', margin: 0 }}>唯一</Tag>}
                                            </span>
                                          ),
                                          isLeaf: true,
                                          selectable: false,
                                        }))
                                      : [{
                                          key: `no-indexes::${tableKey}`,
                                          title: <span style={{ color: '#999', fontSize: 10 }}>暂无索引</span>,
                                          isLeaf: true,
                                          selectable: false,
                                        }],
                                  },
                                ]
                              : [
                                  {
                                    key: `table-loading::${tableKey}`,
                                    title: <span style={{ color: '#999', fontSize: 11 }}>加载中...</span>,
                                    isLeaf: true,
                                    selectable: false,
                                  },
                                ],
                          };
                        })
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
                    <span
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleDoubleClick(`views::${conn.id}::${db.database}`);
                      }}
                    >
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
                            <Dropdown
                              menu={getViewMenu(conn.id, view.table_name, db.database)}
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
                                onClick={() => message.info('视图浏览功能开发中...')}
                              >
                                <EyeOutlined style={{ color: '#1890ff', fontSize: 11 }} />
                                {view.table_name}
                              </span>
                            </Dropdown>
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
                {
                  key: `procedures::${conn.id}::${db.database}`,
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
                      key: `no-procedures::${conn.id}::${db.database}`,
                      title: <span style={{ color: '#999', fontSize: 11 }}>暂无存储过程</span>,
                      isLeaf: true,
                      selectable: false,
                    },
                  ],
                },
                {
                  key: `functions::${conn.id}::${db.database}`,
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
                      key: `no-functions::${conn.id}::${db.database}`,
                      title: <span style={{ color: '#999', fontSize: 11 }}>暂无函数</span>,
                      isLeaf: true,
                      selectable: false,
                    },
                  ],
                },
              ]
            : [
                {
                  key: `db-loading::${conn.id}::${db.database}`,
                  title: <span style={{ color: '#999', fontSize: 11 }}>加载中...</span>,
                  isLeaf: true,
                  selectable: false,
                },
              ],
        };
      });

      // Connection title
      let connTitle: React.ReactNode;
      if (isConnRenaming) {
        connTitle = <Input size="small" defaultValue={conn.name} style={{ width: 100 }} />;
      } else {
        const iconColor = DB_TYPE_COLORS[conn.db_type] || '#8c8c8c';
        const isConnected = conn.status === 'connected';
        const iconStyle: React.CSSProperties = !isConnected
          ? { opacity: 0.5, filter: 'grayscale(100%)' }
          : {};

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
                <span style={iconStyle}>{getDbIcon(conn.db_type)}</span>
                <span
                  style={{
                    color: isConnected
                      ? isDarkMode
                        ? '#e8e8e8'
                        : '#262626'
                      : isDarkMode
                      ? '#595959'
                      : '#8c8c8c',
                    fontWeight: isConnected ? 500 : 400,
                    transition: 'color 0.2s ease',
                  }}
                >
                  {conn.name}
                </span>
              </span>
            </div>
          </Dropdown>
        );
      }

      return {
        key: conn.id,
        title: connTitle,
        isLeaf: false,
        icon: null,
        children:
          databaseChildren.length > 0
            ? databaseChildren
            : [
                {
                  key: `tables-${conn.id}`,
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <TableOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                      表
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
              ],
      };
    },
    [
      connectionDatabases,
      tableStructures,
      selectedTableId,
      isDarkMode,
      expandedKeys,
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

    // Helper: check if any item in a list matches the query
    const matchTables = (tables: TableInfo[]) =>
      !q || tables.some((t) => t.table_name.toLowerCase().includes(q));
    const matchViews = (tables: TableInfo[]) =>
      !q || tables.filter((t) => t.table_type === 'VIEW').some((v) => v.table_name.toLowerCase().includes(q));

    // Build table children with filtering
    const buildTableNodes = (
      connId: string,
      db: { database: string; tables: TableInfo[]; loaded: boolean },
      allTableItems: TableInfo[],
      allViewItems: TableInfo[]
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
        children:
          !db.loaded
            ? [{ key: `loading-tables::${connId}::${db.database}`, title: <span style={{ color: '#999', fontSize: 11 }}>点击展开加载表...</span>, isLeaf: true, selectable: false }]
            : filteredTables.length > 0
            ? filteredTables.map((table) => ({
                key: `table::${connId}::${db.database}::${table.table_name}`,
                isLeaf: true,
                title: (
                  <Dropdown menu={getTableMenu(connId, table.table_name, db.database)} trigger={['contextMenu']}>
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
            : [{ key: `no-tables::${connId}::${db.database}`, title: <span style={{ color: '#999', fontSize: 11 }}>暂无表</span>, isLeaf: true, selectable: false }],
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
        children:
          !db.loaded
            ? [{ key: `loading-views::${connId}::${db.database}`, title: <span style={{ color: '#999', fontSize: 11 }}>点击展开加载视图...</span>, isLeaf: true, selectable: false }]
            : filteredViews.length > 0
            ? filteredViews.map((view) => ({
                key: `view::${connId}::${db.database}::${view.table_name}`,
                isLeaf: true,
                title: (
                  <Dropdown menu={getViewMenu(connId, view.table_name, db.database)} trigger={['contextMenu']}>
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
            : [{ key: `no-views::${connId}::${db.database}`, title: <span style={{ color: '#999', fontSize: 11 }}>暂无视图</span>, isLeaf: true, selectable: false }],
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
            ...filteredTables.length ? [tablesNode] : [],
            ...filteredViews.length ? [viewsNode] : [],
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
        isLeaf: false,
        title: (
          <Dropdown menu={getDatabaseMenu(connId, db.database)} trigger={['contextMenu']}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleDoubleClick(`db::${connId}::${db.database}`);
              }}
            >
              <DatabaseOutlined style={{ color: '#1890ff', fontSize: 12 }} />
              <span>{db.database}</span>
            </div>
          </Dropdown>
        ),
        children: dbChildren,
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
        const tableItems = db.loaded ? db.tables.filter((t) => t.table_type === 'BASE TABLE') : [];
        const viewItems = db.loaded ? db.tables.filter((t) => t.table_type === 'VIEW') : [];

        const tablesMatch = matchTables(tableItems);
        const viewsMatch = matchViews(db.tables);
        const isDbExpanded = expandedKeys.includes(`db::${conn.id}::${db.database}`);

        // Skip if search active and nothing matches (unless db is expanded)
        if (q && !dbMatch && !tablesMatch && !viewsMatch && !isDbExpanded) continue;

        const dbNode = buildTableNodes(conn.id, db, tableItems, viewItems);
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
            {getDbIcon(conn.db_type)}
            <span>{conn.name}</span>
            {conn.database && <span style={{ color: '#999', fontSize: 11 }}>({conn.database})</span>}
          </div>
        </Dropdown>
      );

      return {
        key: conn.id,
        isLeaf: false,
        title: connTitle,
        children: dbNodes.length > 0
          ? dbNodes
          : (conn.status === 'connected'
            ? [{ key: `loading::${conn.id}`, title: <span style={{ color: '#999', fontSize: 11 }}>暂无数据库</span>, isLeaf: true, selectable: false }]
            : undefined),
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

    // 2. 添加未分组的连接（直接作为顶级节点）
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
    searchText,
    connectionDatabases,
    expandedKeys,
    selectedTableId,
    isDarkMode,
    renamingKey,
    renameValue,
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
          const tableItems = db.loaded ? db.tables.filter((t) => t.table_type === 'BASE TABLE') : [];
          const viewItems = db.loaded ? db.tables.filter((t) => t.table_type === 'VIEW') : [];
          const matchTables = tableItems.some((t) => t.table_name.toLowerCase().includes(q));
          const matchViews = viewItems.some((v) => v.table_name.toLowerCase().includes(q));
          if (matchTables) {
            autoExpandKeys.push(conn.id, `db::${conn.id}::${db.database}`, `tables::${conn.id}::${db.database}`);
          }
          if (matchViews) {
            autoExpandKeys.push(conn.id, `db::${conn.id}::${db.database}`, `views::${conn.id}::${db.database}`);
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
            console.log('[Tree] Connection expanded but no databases loaded, calling onLoadDatabases...');
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
        console.log('[Tree] Database expand:', connectionId, database);

        const dbList = connectionDatabases[connectionId] || [];
        console.log('[Tree] dbList:', dbList);

        const db = dbList.find((d) => d.database === database);
        console.log('[Tree] db:', db);

        if (db && !db.loaded) {
          console.log('[Tree] Calling onDatabaseExpand...');
          onDatabaseExpand(connectionId, database);
        } else if (!db) {
          console.warn('[Tree] Database not found in connectionDatabases, trying to load anyway...');
          onDatabaseExpand(connectionId, database);
        } else {
          console.log('[Tree] Database already loaded, skipping');
        }
      }

      // Table expand - 展开表节点时加载列和索引
      if (key.startsWith('table::') && info.expanded) {
        const parts = key.split('::');
        // table::connectionId::database::tableName
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const tableName = parts.slice(3).join('::');  // 处理表名中包含 :: 的情况
          console.log('[Tree] Table expand:', connectionId, database, tableName);
          onTableExpand(connectionId, database, tableName);
        }
      }
    },
    [connections, connectionDatabases, onExpandKeys, onConnect, onExpand, onDatabaseExpand, onTableExpand, onLoadDatabases]
  );

  const handleSelect = useCallback(
    (keys: React.Key[]) => {
      const key = keys[0] as string;
      if (!key) return;

      console.log('[Tree] handleSelect key:', key);

      if (key.startsWith('table::')) {
        // Table selection - extract connectionId, database and tableName
        const parts = key.split('::');
        if (parts.length >= 4) {
          const connectionId = parts[1];
          const database = parts[2];
          const tableName = parts.slice(3).join('::');
          console.log('[Tree] Table select:', connectionId, database, tableName);
          onSelect(connectionId);
          onTableSelect(tableName, database);
        }
      } else if (key.startsWith('db::')) {
        // DB selection - extract connectionId and database
        const parts = key.split('::');
        const connectionId = parts[1];
        const database = parts[2];
        onSelect(connectionId);
        onTableSelect(null, database);
      } else if (key.startsWith('tables::') || key.startsWith('views::')) {
        // Tables/Views group selection - extract connectionId and database
        const parts = key.split('::');
        const connectionId = parts[1];
        const database = parts[2];
        console.log('[Tree] Tables/Views group select:', connectionId, database);
        onSelect(connectionId);
        onTableSelect(null, database);
      } else if (key.startsWith('group-')) {
        // Group selection - do nothing special
      } else {
        onSelect(key);
      }
    },
    [onSelect, onTableSelect]
  );

  // ---- Collapsed view ----
  if (collapsed) {
    return (
      <>
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
      </>
    );
  }

  // ---- Full tree view ----
  return (
    <>
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: 8 }}>
        <Spin spinning={isLoading} size="small">
          {connections.length === 0 && !isLoading ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无连接"
              style={{ padding: '20px 0' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#999' }}>创建第一个连接开始使用</span>
              </div>
            </Empty>
          ) : (
            <Tree
              showIcon={false}
              selectedKeys={selectedId ? [selectedId] : []}
              expandedKeys={expandedKeys}
              onExpand={handleExpand}
              onSelect={handleSelect}
              treeData={treeData as any}
              style={{ background: 'transparent', padding: '0 4px', fontSize: 12 }}
              virtual
              className="connection-tree"
            />
          )}
        </Spin>
      </div>

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
    </>
  );
}

export default ConnectionTree;
