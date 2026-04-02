import React, { useRef, useCallback, useMemo } from 'react';
import { Tree, Spin, Empty, Dropdown, Badge, message } from 'antd';
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
} from '@ant-design/icons';
import { theme } from 'antd';
import type { Connection, ConnectionGroup } from '../../stores/appStore';
import type { TableInfo } from '../../types/api';

type ConnectionTreeProps = {
  connections: Connection[];
  groups: ConnectionGroup[];
  selectedId: string | null;
  selectedTableId: string | null;
  onSelect: (id: string | null) => void;
  onTableSelect: (table: string | null) => void;
  onTableOpen: (tableName: string) => void;
  onExpand: (connectionId: string, expanded: boolean) => void;
  collapsed: boolean;
  searchText: string;
  expandedKeys: string[];
  onExpandKeys: (keys: string[]) => void;
  connectionTables: Record<string, TableInfo[]>;
  isLoading: boolean;
};

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
  connectionTables,
  isLoading,
}: ConnectionTreeProps) {
  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTableClick = useCallback((tableName: string) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      onTableOpen(tableName);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        onTableSelect(tableName);
      }, 250);
    }
  }, [onTableOpen, onTableSelect]);

  const getDbIcon = (dbType: string) => {
    const icons: Record<string, React.ReactNode> = {
      mysql: <DatabaseOutlined style={{ color: '#1890ff' }} />,
      postgresql: <DatabaseOutlined style={{ color: '#52c41a' }} />,
      sqlite: <DatabaseOutlined style={{ color: '#faad14' }} />,
      sqlserver: <DatabaseOutlined style={{ color: '#eb2f96' }} />,
      oracle: <DatabaseOutlined style={{ color: '#fa8c16' }} />,
      mariadb: <DatabaseOutlined style={{ color: '#13c2c2' }} />,
      dameng: <DatabaseOutlined style={{ color: '#722ed1' }} />,
    };
    return icons[dbType] || <DatabaseOutlined />;
  };

  const getConnectionMenu = useCallback((conn: Connection): MenuProps => ({
    items: conn.status === 'connected' ? [
      { key: 'disconnect', label: '断开连接', icon: <DisconnectOutlined /> },
      { key: 'refresh', label: '刷新', icon: <ReloadOutlined /> },
      { type: 'divider' },
      { key: 'edit', label: '编辑连接', icon: <EditOutlined /> },
      { key: 'copy', label: '复制连接配置', icon: <CopyOutlined /> },
      { type: 'divider' },
      { key: 'new-query', label: '新建查询', icon: <PlayCircleOutlined /> },
      { type: 'divider' },
      { key: 'move', label: '移动至分组', icon: <FolderOutlined /> },
      { type: 'divider' },
      { key: 'delete', label: '删除连接', icon: <DeleteOutlined />, danger: true },
    ] : [
      { key: 'connect', label: '连接', icon: <LinkOutlined /> },
      { key: 'edit', label: '编辑连接', icon: <EditOutlined /> },
      { key: 'copy', label: '复制连接配置', icon: <CopyOutlined /> },
      { type: 'divider' },
      { key: 'move', label: '移动至分组', icon: <FolderOutlined /> },
      { type: 'divider' },
      { key: 'delete', label: '删除连接', icon: <DeleteOutlined />, danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'connect') {
        message.info('连接功能待实现后端对接');
      } else if (key === 'disconnect') {
        message.info('断开连接功能待实现后端对接');
      } else if (key === 'refresh') {
        onExpand(conn.id, true);
      } else if (key === 'edit') {
        message.info('编辑连接功能待实现');
      } else if (key === 'delete') {
        message.info('删除连接功能待实现');
      } else if (key === 'new-query') {
        message.info('新建查询功能待实现');
      } else {
        message.info(`${key} 功能待实现`);
      }
    },
  }), [onExpand]);

  const getGroupMenu = useCallback((group: ConnectionGroup): MenuProps => ({
    items: [
      { key: 'new-connection', label: '新建连接', icon: <PlusOutlined /> },
      { key: 'new-group', label: '新建分组', icon: <FolderOutlined /> },
      { type: 'divider' },
      { key: 'rename', label: '重命名', icon: <EditOutlined /> },
      { type: 'divider' },
      { key: 'export', label: '导出分组' },
      { type: 'divider' },
      { key: 'delete', label: '删除分组', icon: <DeleteOutlined />, danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'new-connection') {
        message.info('新建连接功能待实现');
      } else if (key === 'new-group') {
        message.info('新建分组功能待实现');
      } else {
        message.info(`${key} 功能待实现`);
      }
    },
  }), []);

  if (collapsed) {
    return (
      <div style={{ padding: '8px 12px' }}>
        {isLoading ? (
          <Spin size="small" />
        ) : connections.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          connections.map(conn => (
            <Dropdown key={conn.id} menu={getConnectionMenu(conn)} trigger={['contextMenu']}>
              <div
                onClick={() => onSelect(conn.id)}
                style={{ padding: '8px', marginBottom: 4, borderRadius: 6, cursor: 'pointer', background: selectedId === conn.id ? (isDarkMode ? 'rgba(24, 144, 255, 0.2)' : 'rgba(24, 144, 255, 0.1)') : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {getDbIcon(conn.db_type)}
              </div>
            </Dropdown>
          ))
        )}
      </div>
    );
  }

  const buildTreeData = () => {
    const groupedConnections: Record<string, Connection[]> = {};

    connections.forEach(conn => {
      const groupId = conn.group_id || 'default';
      if (!groupedConnections[groupId]) {
        groupedConnections[groupId] = [];
      }
      groupedConnections[groupId].push(conn);
    });

    return groups.map(group => ({
      key: `group-${group.id}`,
      title: (
        <Dropdown menu={getGroupMenu(group)} trigger={['contextMenu']}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
            <span>
              <span style={{ marginRight: 8 }}>{group.icon}</span>
              {group.name}
            </span>
            <Badge count={groupedConnections[group.id]?.length || 0} style={{ backgroundColor: group.color }} />
          </div>
        </Dropdown>
      ),
      children: (groupedConnections[group.id] || [])
        .filter(conn =>
          searchText === '' ||
          conn.name.toLowerCase().includes(searchText.toLowerCase()) ||
          conn.database?.toLowerCase().includes(searchText.toLowerCase())
        )
        .map(conn => {
          const tables = connectionTables[conn.id] || [];
          const tableItems = tables.filter(t => t.table_type === 'BASE TABLE');
          const viewItems = tables.filter(t => t.table_type === 'VIEW');
          return {
            key: conn.id,
            title: (
              <Dropdown menu={getConnectionMenu(conn)} trigger={['contextMenu']}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                  <span>
                {getDbIcon(conn.db_type)}
                    <span style={{ marginLeft: 8 }}>{conn.name}</span>
                  </span>
                  {conn.status === 'connected' && <Badge status="success" style={{ marginLeft: 8 }} />}
                </div>
              </Dropdown>
            ),
            children: [
              {
                key: `tables-${conn.id}`,
                title: (
                  <span>
                    <TableOutlined style={{ marginRight: 4, color: '#52c41a' }} />
                    表 ({tableItems.length})
                  </span>
                ),
                children: tableItems.map(table => ({
                  key: `table-${conn.id}-${table.table_name}`,
                  title: (
                    <span
                      style={{
                        cursor: 'pointer',
                        background: selectedTableId === table.table_name
                          ? (isDarkMode ? 'rgba(24, 144, 255, 0.2)' : 'rgba(24, 144, 255, 0.1)')
                          : 'transparent',
                        padding: '2px 4px',
                        borderRadius: 4,
                      }}
                      onClick={() => handleTableClick(table.table_name)}
                    >
                      <TableOutlined style={{ marginRight: 4, color: '#52c41a' }} />
                      {table.table_name}
                    </span>
                  ),
                })),
              },
              {
                key: `views-${conn.id}`,
                title: (
                  <span>
                    <EyeOutlined style={{ marginRight: 4, color: '#1890ff' }} />
                    视图 ({viewItems.length})
                  </span>
                ),
                children: viewItems.map(view => ({
                  key: `view-${conn.id}-${view.table_name}`,
                  title: (
                    <span>
                      <EyeOutlined style={{ marginRight: 4, color: '#1890ff' }} />
                      {view.table_name}
                    </span>
                  ),
                })),
              },
            ].filter(Boolean),
          };
        }),
    }));
  };

  return (
    <Spin spinning={isLoading} size="small">
      {connections.length === 0 && !isLoading ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无连接" style={{ padding: '20px 0' }} />
      ) : (
        <Tree
          showLine
          selectedKeys={selectedId ? [selectedId] : []}
          expandedKeys={expandedKeys}
          onExpand={(keys, { node, expanded }) => {
            onExpandKeys(keys as string[]);
            if (node.key && typeof node.key === 'string' && !node.key.startsWith('group-') && !node.key.startsWith('tables-') && !node.key.startsWith('views-')) {
              onExpand(node.key as string, expanded);
            }
          }}
          onSelect={(keys, info) => {
            const key = keys[0] as string;
            if (key && key.startsWith('table-')) {
              const parts = key.split('-');
              const tableName = parts.slice(2).join('-');
              onTableSelect(tableName);
            } else if (key && !key.startsWith('group-') && !key.startsWith('tables-') && !key.startsWith('views-')) {
              onSelect(key);
            }
          }}
          treeData={buildTreeData() as any}
          style={{ background: 'transparent', padding: '0 12px', fontSize: 13 }}
        />
      )}
    </Spin>
  );
}

export default ConnectionTree;
