import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tag, Spin, Empty, Button, Space, Tooltip, Modal, App } from 'antd';
import { GlobalInput } from './GlobalInput';
import {
  TableOutlined,
  EyeOutlined,
  SearchOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  FolderOpenOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  ImportOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../stores/appStore';
import { useDatabase } from '../hooks/useApi';
import { useThemeColors } from '../hooks/useThemeColors';

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
  onTableDesign?: (tableName: string, database?: string) => void;
  onTableNew?: () => void;
  onTableDelete?: (tableName: string, database?: string) => void;
  onImport?: () => void;
  onExport?: () => void;
}

// Navicat-style grid card component
const TableGridCard = React.memo(function TableGridCard({
  table,
  selected,
  onClick,
}: {
  table: TableData;
  selected: boolean;
  onClick: () => void;
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
        userSelect: 'none',
        background: selected ? 'var(--row-selected-bg)' : 'transparent',
        transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'var(--background-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {table.table_type === 'VIEW' ? (
        <EyeOutlined style={{ fontSize: 14, color: 'var(--db-color-sqlserver)', flexShrink: 0 }} />
      ) : (
        <TableOutlined style={{ fontSize: 14, color: 'var(--color-success)', flexShrink: 0 }} />
      )}
      <span
        title={table.table_name}
        style={{
          fontSize: 12,
          margin: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {table.table_name}
      </span>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.table === nextProps.table &&
    prevProps.selected === nextProps.selected &&
    prevProps.onClick === nextProps.onClick
  );
});

// List view row component
const TableRow = React.memo(function TableRow({
  table,
  selected,
  onClick,
}: {
  table: TableData;
  selected: boolean;
  onClick: () => void;
}) {
  const rowCount = table.row_count != null ? table.row_count.toLocaleString() : '-';
  const createTime = table.create_time ? new Date(table.create_time).toLocaleDateString() : '-';
  const updateTime = table.update_time ? new Date(table.update_time).toLocaleDateString() : '-';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '400px 200px 80px 80px 70px 130px 130px',
        padding: '4px 12px',
        alignItems: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--row-selected-bg)' : 'transparent',
        transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'var(--background-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <TableOutlined style={{ color: 'var(--color-success)', flexShrink: 0, fontSize: 12 }} />
        <span title={table.table_name} style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'none', WebkitUserSelect: 'none' }}>
          {table.table_name}
        </span>
      </div>
      <div style={{ minWidth: 0, paddingRight: 8, overflow: 'hidden' }}>
        <span title={table.comment} style={{ fontSize: 11, color: table.comment ? 'var(--text-tertiary)' : 'var(--text-disabled)', userSelect: 'none', WebkitUserSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {table.comment || '-'}
        </span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', userSelect: 'none', WebkitUserSelect: 'none' }}>{rowCount}</span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', userSelect: 'none', WebkitUserSelect: 'none' }}>{table.data_size || '-'}</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', userSelect: 'none', WebkitUserSelect: 'none' }}>{table.engine || '-'}</span>
      </div>
      <div>
        <span title={table.create_time} style={{ fontSize: 10, color: 'var(--text-tertiary)', userSelect: 'none', WebkitUserSelect: 'none' }}>{createTime}</span>
      </div>
      <div>
        <span title={table.update_time} style={{ fontSize: 10, color: 'var(--text-tertiary)', userSelect: 'none', WebkitUserSelect: 'none' }}>{updateTime}</span>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.table === nextProps.table &&
    prevProps.selected === nextProps.selected &&
    prevProps.onClick === nextProps.onClick
  );
});

// List header component
function ListHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '400px 200px 80px 80px 70px 130px 130px',
        padding: '6px 12px',
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--border)',
        fontWeight: 500,
        fontSize: 11,
        color: 'var(--text-tertiary)',
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
  onTableDesign,
  onTableNew,
  onTableDelete,
  onImport,
  onExport,
}: TableListProps) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(getInitialViewMode);
  const [localLoading, setLocalLoading] = useState(false);
  const tc = useThemeColors();
  const { message } = App.useApp();

  const tableDataCache = useAppStore((state) => state.tableDataCache);
  const { getTables } = useDatabase();

  const cacheKey = `${connectionId}::${database || ''}`;
  const cacheData = tableDataCache[cacheKey];

  const tables = cacheData?.tables || [];
  const loading = localLoading || cacheData?.loading || false;

  const prevCacheKeyRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
    }
  }, [viewMode]);

  useEffect(() => {
    // 未选择数据库时不自动加载
    if (!database) return;

    const currentCacheKey = `${connectionId}::${database || ''}`;
    // 只在 connectionId/database 真正变化时（或组件重新挂载时）自动加载，
    // 避免 clearTableData 清除缓存后触发重复请求和重复 toast
    if (currentCacheKey !== prevCacheKeyRef.current) {
      prevCacheKeyRef.current = currentCacheKey;
      if (!cacheData?.loaded && !cacheData?.loading && !cacheData?.loadFailed) {
        setLocalLoading(true);
        getTables(connectionId, database).finally(() => {
          setLocalLoading(false);
        });
      }
    }
  }, [connectionId, database]);

  const handleTableClick = useCallback(
    (tableName: string) => {
      setSelectedRow(tableName);
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        onTableOpen?.(tableName, database);
      } else {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          onTableSelect?.(tableName, database);
        }, 250);
      }
    },
    [database, onTableSelect, onTableOpen]
  );

  const handleTableClickRef = useRef(handleTableClick);
  handleTableClickRef.current = handleTableClick;

  const refreshTables = async () => {
    try {
      setLocalLoading(true);
      await getTables(connectionId, database, true, undefined);
    } catch (error: any) {
      console.error('Failed to refresh tables:', error);
      message.error(`刷新表列表失败：${error}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setLocalLoading(true);
        await getTables(connectionId, database, true, value || undefined);
      } catch (error: any) {
        console.error('Search failed:', error);
      } finally {
        setLocalLoading(false);
      }
    }, 300);
  };

  const { filteredTables, tableCount, viewCount } = useMemo(() => {
    let tableCount = 0;
    let viewCount = 0;
    const filtered = tables.filter((t) => {
      if (t.table_type === 'BASE TABLE') {
        tableCount++;
        return objectType === 'table' || objectType === 'all';
      } else if (t.table_type === 'VIEW') {
        viewCount++;
        return objectType === 'view' || objectType === 'all';
      }
      return objectType === 'all';
    });
    return { filteredTables: filtered, tableCount, viewCount };
  }, [tables, objectType]);

  const tableRowItems = useMemo(
    () =>
      filteredTables.map((table) => (
        <TableRow
          key={table.table_name}
          table={table}
          selected={selectedRow === table.table_name}
          onClick={() => handleTableClickRef.current(table.table_name)}
        />
      )),
    [filteredTables, selectedRow]
  );

  const tableGridItems = useMemo(
    () =>
      filteredTables.map((table) => (
        <TableGridCard
          key={table.table_name}
          table={table}
          selected={selectedRow === table.table_name}
          onClick={() => handleTableClickRef.current(table.table_name)}
        />
      )),
    [filteredTables, selectedRow]
  );

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--background-card)',
        overflow: 'hidden',
        minHeight: 0,
        height: '100%',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          padding: '8px 12px',
          background: 'var(--background-toolbar)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Space size="small">
          <Tooltip title="打开表" open={!selectedRow ? false : undefined}><span><Button icon={<FolderOpenOutlined />} size="small" disabled={!selectedRow} title={selectedRow ? '' : '请先选择一个表'} onClick={() => selectedRow && onTableOpen?.(selectedRow, database)} /></span></Tooltip>
          <Tooltip title="设计表" open={!selectedRow ? false : undefined}><span><Button icon={<EditOutlined />} size="small" disabled={!selectedRow} title={selectedRow ? '' : '请先选择一个表'} onClick={() => selectedRow && onTableDesign?.(selectedRow, database)} /></span></Tooltip>
          <Tooltip title="新增表"><span><Button icon={<PlusOutlined />} size="small" onClick={onTableNew} /></span></Tooltip>
          <Tooltip title="删除表" open={!selectedRow ? false : undefined}><span><Button icon={<DeleteOutlined />} size="small" disabled={!selectedRow} title={selectedRow ? '' : '请先选择一个表'} onClick={() => { if (selectedRow) { Modal.confirm({ title: '确认删除', content: `确定要删除表 "${selectedRow}" 吗？`, okText: '删除', okType: 'danger', onOk: () => onTableDelete?.(selectedRow, database) }); }}} /></span></Tooltip>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <Tooltip title="导入向导"><span><Button icon={<ImportOutlined />} size="small" onClick={onImport} /></span></Tooltip>
          <Tooltip title="导出向导"><span><Button icon={<ExportOutlined />} size="small" onClick={onExport} /></span></Tooltip>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <Tooltip title="刷新"><span><Button icon={<ReloadOutlined />} size="small" onClick={refreshTables} loading={loading} /></span></Tooltip>
        </Space>

        <GlobalInput
          placeholder="搜索表名或注释..."
          prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
          value={searchText}
          onChange={(e) => { const val = e.target.value; setSearchText(val); handleSearch(val); }}
          allowClear
          size="small"
          style={{ width: 180, marginLeft: 'auto' }}
        />

        <Space size="small">
          {objectType === 'all' ? (<><Tag color="blue">表 {tableCount}</Tag><Tag color="purple">视图 {viewCount}</Tag></>) : objectType === 'table' ? (<Tag color="blue">表 {tableCount}</Tag>) : (<Tag color="purple">视图 {viewCount}</Tag>)}
          <Tooltip title={viewMode === 'list' ? '切换为网格视图' : '切换为列表视图'}><span><Button icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />} size="small" type="text" onClick={() => setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'))} /></span></Tooltip>
        </Space>
      </div>

      {/* Content area */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          contentVisibility: 'auto',
          contain: 'layout style paint',
        }}
      >
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
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>加载中...</div>
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
        ) : filteredTables.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description={searchText ? "未找到匹配的表" : "暂无表"} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : viewMode === 'list' ? (
          <div style={{ background: 'var(--background-card)' }}>
            <ListHeader />
            {tableRowItems}
          </div>
        ) : (
          <div style={{ padding: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2 }}>
              {tableGridItems}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const TableList = React.memo(TableListComponent);
