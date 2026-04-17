import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tag, Typography, Spin, Empty, Button, Space, message, Input, Tooltip } from 'antd';
import {
  TableOutlined,
  EyeOutlined,
  SearchOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { theme } from 'antd';
import { useAppStore } from '../stores/appStore';
import { useDatabase } from '../hooks/useApi';

const { Text } = Typography;

// View mode storage key
const VIEW_MODE_STORAGE_KEY = 'tablelist-viewmode';

// Helper to get saved view mode
function getInitialViewMode(): 'list' | 'grid' {
  try {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (saved === 'list' || saved === 'grid') {
      return saved;
    }
  } catch {
    // Ignore localStorage errors
  }
  return 'list'; // Default to list view
}

export interface TableData {
  table_name: string;
  table_type: string;
  row_count?: number;
  comment?: string;
  engine?: string;
  data_size?: string;
  index_size?: string;
  create_time?: string;
  update_time?: string;
  collation?: string;
}

export interface TableListProps {
  connectionId: string;
  database?: string;
  objectType?: 'table' | 'view' | 'all';
  onTableSelect?: (tableName: string, database?: string) => void;
  onTableOpen?: (tableName: string, database?: string) => void;
}

// Navicat-style grid card component
const TableGridCard = React.memo(function TableGridCard({
  table,
  onClick,
  isDarkMode,
}: {
  table: TableData;
  onClick: () => void;
  isDarkMode: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 6px',
        cursor: 'pointer',
        borderRadius: 3,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isDarkMode ? '#1a1a1a' : '#f5f5f5';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {table.table_type === 'VIEW' ? (
        <EyeOutlined style={{ fontSize: 14, color: '#722ed1', flexShrink: 0 }} />
      ) : (
        <TableOutlined style={{ fontSize: 14, color: '#52c41a', flexShrink: 0 }} />
      )}
      <Tooltip title={table.table_name}>
        <Text
          ellipsis
          style={{
            fontSize: 12,
            margin: 0,
          }}
        >
          {table.table_name}
        </Text>
      </Tooltip>
    </div>
  );
});

// List view row component
const TableRow = React.memo(function TableRow({
  table,
  selected,
  onClick,
  isDarkMode,
}: {
  table: TableData;
  selected: boolean;
  onClick: () => void;
  isDarkMode: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr 80px 80px 70px 130px 130px',
        padding: '4px 12px',
        alignItems: 'center',
        cursor: 'pointer',
        borderBottom: `1px solid ${isDarkMode ? '#303030' : '#f0f0f0'}`,
        background: selected
          ? isDarkMode
            ? 'rgba(24,144,255,0.2)'
            : 'rgba(24,144,255,0.1)'
          : 'transparent',
        transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = isDarkMode ? '#1f1f1f' : '#f5f5f5';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <TableOutlined style={{ color: '#52c41a', flexShrink: 0, fontSize: 12 }} />
        <Text ellipsis style={{ fontSize: 12 }}>
          {table.table_name}
        </Text>
      </div>
      <div style={{ minWidth: 0, paddingRight: 8 }}>
        <Tooltip title={table.comment}>
          <span style={{ fontSize: 11, color: table.comment ? '#999' : '#ccc' }}>
            {table.comment || '-'}
          </span>
        </Tooltip>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: '#999' }}>
          {table.row_count != null ? table.row_count.toLocaleString() : '-'}
        </span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: '#999' }}>{table.data_size || '-'}</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 10, color: '#666' }}>{table.engine || '-'}</span>
      </div>
      <div>
        <Tooltip title={table.create_time}>
          <span style={{ fontSize: 10, color: '#999' }}>
            {table.create_time ? new Date(table.create_time).toLocaleDateString() : '-'}
          </span>
        </Tooltip>
      </div>
      <div>
        <Tooltip title={table.update_time}>
          <span style={{ fontSize: 10, color: '#999' }}>
            {table.update_time ? new Date(table.update_time).toLocaleDateString() : '-'}
          </span>
        </Tooltip>
      </div>
    </div>
  );
});

// List header component
function ListHeader({ isDarkMode }: { isDarkMode: boolean }) {
  const headerBg = isDarkMode ? '#1a1a1a' : '#fafafa';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr 80px 80px 70px 130px 130px',
        padding: '6px 12px',
        background: headerBg,
        borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
        fontWeight: 500,
        fontSize: 11,
        color: isDarkMode ? '#999' : '#666',
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}
    >
      <span>表名</span>
      <span>注释</span>
      <span style={{ textAlign: 'right' }}>行数</span>
      <span style={{ textAlign: 'right' }}>数据大小</span>
      <span style={{ textAlign: 'center' }}>引擎</span>
      <span>创建时间</span>
      <span>更新时间</span>
    </div>
  );
}

function TableListComponent({
  connectionId,
  database,
  objectType = 'all',
  onTableSelect,
  onTableOpen,
}: TableListProps) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(getInitialViewMode);
  const [localLoading, setLocalLoading] = useState(false);

  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';

  const tableDataCache = useAppStore((state) => state.tableDataCache);
  const { getTables } = useDatabase();

  const cacheKey = `${connectionId}::${database || ''}`;
  const cacheData = tableDataCache[cacheKey];

  const tables = cacheData?.tables || [];
  const loading = localLoading || cacheData?.loading || false;

  // Save view mode to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // Ignore localStorage errors
    }
  }, [viewMode]);

  // Load tables only if not already loaded or loading
  useEffect(() => {
    if (!cacheData || (!cacheData.loaded && !cacheData.loading)) {
      setLocalLoading(true);
      getTables(connectionId, database).finally(() => {
        setLocalLoading(false);
      });
    }
  }, [connectionId, database, cacheData, getTables]);

  const handleTableClick = useCallback(
    (tableName: string) => {
      setSelectedRow(tableName);
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        // Double click
        onTableOpen?.(tableName, database);
      } else {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          // Single click
          onTableSelect?.(tableName, database);
        }, 250);
      }
    },
    [database, onTableSelect, onTableOpen]
  );

  const refreshTables = async () => {
    try {
      setLocalLoading(true);
      await getTables(connectionId, database, true);
    } catch (error: any) {
      console.error('Failed to refresh tables:', error);
      message.error(`刷新表列表失败：${error}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const filteredTables = useMemo(() => {
    let filtered = tables;
    if (objectType === 'table') {
      filtered = tables.filter((t) => t.table_type === 'BASE TABLE');
    } else if (objectType === 'view') {
      filtered = tables.filter((t) => t.table_type === 'VIEW');
    }
    if (!searchText) return filtered;
    return filtered.filter(
      (table) =>
        table.table_name.toLowerCase().includes(searchText.toLowerCase()) ||
        table.comment?.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [tables, searchText, objectType]);

  const tableCount = tables.filter((t) => t.table_type === 'BASE TABLE').length;
  const viewCount = tables.filter((t) => t.table_type === 'VIEW').length;

  const toolbarBg = isDarkMode ? '#141414' : '#fafafa';
  const borderColor = isDarkMode ? '#303030' : '#e8e8e8';

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: isDarkMode ? '#1f1f1f' : '#fff',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          flexShrink: 0,
          borderBottom: `1px solid ${borderColor}`,
          padding: '8px 12px',
          background: toolbarBg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space size="small">
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={refreshTables}
              loading={loading}
            >
              刷新
            </Button>
            <Input
              placeholder="搜索表名或注释..."
              prefix={<SearchOutlined style={{ color: '#999' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              size="small"
              style={{ width: 180 }}
            />
          </Space>

          <Space size="small">
            {objectType === 'all' ? (
              <>
                <Tag color="blue">表 {tableCount}</Tag>
                <Tag color="purple">视图 {viewCount}</Tag>
              </>
            ) : objectType === 'table' ? (
              <Tag color="blue">表 {tableCount}</Tag>
            ) : (
              <Tag color="purple">视图 {viewCount}</Tag>
            )}
            <Tooltip title={viewMode === 'list' ? '切换为网格视图' : '切换为列表视图'}>
              <Button
                icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                size="small"
                type="text"
                onClick={() => {
                  setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'));
                }}
              />
            </Tooltip>
          </Space>
        </div>
      </div>

      {/* Status bar */}
      {!loading && filteredTables.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            borderBottom: `1px solid ${borderColor}`,
            padding: '4px 16px',
            textAlign: 'right',
            fontSize: 11,
            color: '#999',
            background: isDarkMode ? '#141414' : '#fafafa',
          }}
        >
          {objectType === 'all'
            ? `共 ${tableCount} 个表, ${viewCount} 个视图`
            : objectType === 'table'
              ? `共 ${tableCount} 个表`
              : `共 ${viewCount} 个视图`}
          {searchText && `（过滤自 ${tables.length} 个）`}
        </div>
      )}

      {/* Content area */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {loading ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Spin size="large" />
            <div style={{ marginTop: 12, fontSize: 13, color: '#999' }}>加载中...</div>
          </div>
        ) : filteredTables.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {searchText ? (
              <Empty description="未找到匹配的表" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Empty description="暂无表" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div
            style={{
              height: '100%',
              overflowY: 'auto',
              background: isDarkMode ? '#1f1f1f' : '#fff',
            }}
          >
            <ListHeader isDarkMode={isDarkMode} />
            {filteredTables.map((table) => (
              <TableRow
                key={table.table_name}
                table={table}
                selected={selectedRow === table.table_name}
                onClick={() => handleTableClick(table.table_name)}
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              height: '100%',
              overflowY: 'auto',
              padding: 4,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 2,
              }}
            >
              {filteredTables.map((table) => (
                <TableGridCard
                  key={table.table_name}
                  table={table}
                  onClick={() => handleTableClick(table.table_name)}
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const TableList = React.memo(TableListComponent);
