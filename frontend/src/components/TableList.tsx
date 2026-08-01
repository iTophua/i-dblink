import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tag, Spin, Empty, Button, Space, Tooltip, Modal, App, Dropdown } from 'antd';
import { GlobalInput } from './GlobalInput';
import { TableDetailSidebar } from './TableDetailSidebar';
import { useTranslation } from 'react-i18next';
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
  ClearOutlined,
  CopyOutlined,
  CodeOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../stores/appStore';
import { useDatabase } from '../hooks/useApi';

const VIEW_MODE_STORAGE_KEY = 'tablelist-viewmode';
const SHOW_DETAIL_STORAGE_KEY = 'tablelist-show-detail';
const DETAIL_WIDTH_STORAGE_KEY = 'tablelist-detail-width';

function getInitialViewMode(): 'list' | 'grid' {
  try {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (saved === 'list' || saved === 'grid') {
      return saved;
    }
  } catch {
    // Ignore localStorage errors
  }
  return 'list';
}

function getInitialShowDetail(): boolean {
  try {
    const saved = localStorage.getItem(SHOW_DETAIL_STORAGE_KEY);
    return saved === 'true';
  } catch {
    return false;
  }
}

function getInitialDetailWidth(): number {
  try {
    const saved = localStorage.getItem(DETAIL_WIDTH_STORAGE_KEY);
    const w = saved ? parseInt(saved, 10) : NaN;
    if (w >= 200 && w <= 600) return w;
  } catch {
    // ignore
  }
  return 320;
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

const nextCopyIdRef = { current: 0 };

interface ColumnDef {
  key: string;
  width: string;
  align?: 'left' | 'right' | 'center';
}

export interface TableListProps {
  connectionId: string;
  database?: string;
  schema?: string;
  objectType?: 'table' | 'view' | 'all';
  onTableSelect?: (tableName: string, database?: string) => void;
  onTableOpen?: (tableName: string, database?: string) => void;
  onTableDesign?: (tableName: string, database?: string) => void;
  onTableNew?: () => void;
  onTableDelete?: (tableName: string, database?: string) => void;
  onTableTruncate?: (tableName: string, database?: string) => void;
  onTableCopy?: (tableName: string, database?: string) => void;
  onTableDump?: (tableName: string, database?: string) => void;
  onImport?: (tableName: string, database?: string) => void;
  onExport?: (tableName: string, database?: string) => void;
}

// Navicat-style grid card component
const TableGridCard = React.memo(
  function TableGridCard({
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
        data-table-name={table.table_name}
        onClick={onClick}
        className={`hoverable${selected ? ' is-selected' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 6,
          userSelect: 'none',
          border: selected
            ? '1px solid var(--color-primary)'
            : '1px solid var(--border-color)',
          background: selected ? 'var(--row-selected-bg)' : 'var(--background-card)',
        }}
      >
        {table.table_type === 'VIEW' ? (
          <EyeOutlined
             style={{ fontSize: 16, color: 'var(--color-info)', flexShrink: 0 }}
          />
        ) : (
          <TableOutlined style={{ fontSize: 16, color: 'var(--color-primary)', flexShrink: 0 }} />
        )}
        <span
          title={table.table_name}
          style={{
            fontSize: 14,
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
  },
  (prevProps, nextProps) => {
    return prevProps.table === nextProps.table && prevProps.selected === nextProps.selected;
  }
);

// List view row component
const TableRow = React.memo(
  function TableRow({
    table,
    selected,
    onClick,
    columns,
  }: {
    table: TableData;
    selected: boolean;
    onClick: () => void;
    columns: ColumnDef[];
  }) {
    const cellRenderers: Record<string, (t: TableData) => React.ReactNode> = {
      table_name: (t) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {t.table_type === 'VIEW' ? (
            <EyeOutlined style={{ fontSize: 16, color: 'var(--color-info)', flexShrink: 0 }} />
          ) : (
            <TableOutlined style={{ color: 'var(--color-primary)', flexShrink: 0, fontSize: 16 }} />
          )}
          <span
            title={t.table_name}
            style={{
              fontSize: 14,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            {t.table_name}
          </span>
        </div>
      ),
      comment: (t) => (
        <div style={{ minWidth: 0, paddingRight: 8, overflow: 'hidden' }}>
          <span
            title={t.comment}
            style={{
              fontSize: 12,
              color: t.comment ? 'var(--text-tertiary)' : 'var(--text-disabled)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {t.comment || '-'}
          </span>
        </div>
      ),
      row_count: (t) => {
        const count = t.row_count != null ? t.row_count.toLocaleString() : '-';
        return (
          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-tertiary)',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              {count}
            </span>
          </div>
        );
      },
      data_size: (t) => (
        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            {t.data_size || '-'}
          </span>
        </div>
      ),
      engine: (t) => (
        <div style={{ textAlign: 'center' }}>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            {t.engine || '-'}
          </span>
        </div>
      ),
      create_time: (t) => {
        const d = t.create_time ? new Date(t.create_time) : null;
        const s = d && !isNaN(d.getTime()) ? d.toLocaleDateString() : '-';
        return (
          <div>
            <span
              title={t.create_time || ''}
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              {s}
            </span>
          </div>
        );
      },
      update_time: (t) => {
        const d = t.update_time ? new Date(t.update_time) : null;
        const s = d && !isNaN(d.getTime()) ? d.toLocaleDateString() : '-';
        return (
          <div>
            <span
              title={t.update_time || ''}
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              {s}
            </span>
          </div>
        );
      },
    };

    return (
      <div
        data-table-name={table.table_name}
        onClick={onClick}
        className={`hoverable${selected ? ' is-selected' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: columns.map((c) => c.width).join(' '),
          padding: '6px 12px',
          alignItems: 'center',
          userSelect: 'none',
          borderBottom: '1px solid var(--border)',
          background: selected ? 'var(--row-selected-bg)' : 'transparent',
        }}
      >
        {columns.map((col) => {
          const renderer = cellRenderers[col.key];
          return renderer ? (
            <React.Fragment key={col.key}>{renderer(table)}</React.Fragment>
          ) : null;
        })}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.table === nextProps.table &&
      prevProps.selected === nextProps.selected &&
      prevProps.columns === nextProps.columns
    );
  }
);

type SortKey = keyof TableData;
interface SortState {
  key: SortKey | null;
  order: 'asc' | 'desc';
}

function formatSortValue(table: TableData, key: SortKey): string | number {
  const val = table[key];
  if (val === undefined || val === null) return '';
  if (key === 'row_count') return typeof val === 'number' ? val : 0;
  if (key === 'data_size' || key === 'index_size') {
    const str = String(val);
    const match = str.match(/^([\d.]+)\s*(KB|MB|GB|TB|B)?/i);
    if (!match) return str;
    const num = parseFloat(match[1]);
    const unit = (match[2] || 'B').toUpperCase();
    const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
    return num * (mult[unit as keyof typeof mult] || 1);
  }
  return String(val);
}

// List header component
function ListHeader({
  sort,
  onSort,
  columns,
}: {
  sort: SortState;
  onSort: (key: SortKey) => void;
  columns: ColumnDef[];
}) {
  const { t } = useTranslation();
  const labelMap: Record<string, string> = {
    table_name: t('common.tableName'),
    comment: t('common.comment'),
    row_count: t('common.tableList.rowCount'),
    data_size: t('common.dataSize'),
    engine: t('common.engine'),
    create_time: t('common.createTime'),
    update_time: t('common.updateTime'),
  };
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns.map((c) => c.width).join(' '),
        padding: '6px 12px',
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--border)',
        fontWeight: 500,
        fontSize: 13,
        color: 'var(--text-tertiary)',
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}
    >
      {columns.map((col) => {
        const isActive = sort.key === col.key;
        return (
          <span
            key={col.key}
            style={{
              textAlign: col.align || 'left',
              cursor: 'pointer',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                col.align === 'right'
                  ? 'flex-end'
                  : col.align === 'center'
                    ? 'center'
                    : 'flex-start',
              gap: 2,
            }}
            onClick={() => onSort(col.key as SortKey)}
          >
            {labelMap[col.key]}
            {isActive && (
              <span style={{ fontSize: 10, color: 'var(--color-primary)' }}>
                {sort.order === 'asc' ? '▲' : '▼'}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function TableListComponent({
  connectionId,
  database,
  schema,
  objectType = 'all',
  onTableSelect,
  onTableOpen,
  onTableDesign,
  onTableNew,
  onTableDelete,
  onTableTruncate,
  onTableCopy,
  onTableDump,
  onImport,
  onExport,
}: TableListProps) {
  const { t } = useTranslation();
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(getInitialViewMode);
  const [localLoading, setLocalLoading] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: null, order: 'asc' });
  const [showDetail, setShowDetail] = useState(getInitialShowDetail);
  const [detailWidth, setDetailWidth] = useState(getInitialDetailWidth);
  const dbType = useAppStore(
    (state) => state.connections.find((c) => c.id === connectionId)?.db_type,
  );

  const columns = useMemo<ColumnDef[]>(() => {
    const isMySQL = dbType === 'mysql' || dbType === 'mariadb';
    const hasComment =
      !dbType ||
      isMySQL ||
      ['postgresql', 'kingbase', 'highgo', 'vastbase', 'sqlserver', 'oracle'].includes(
        dbType || '',
      );
    const showDetail = !dbType || isMySQL;

    const cols: ColumnDef[] = [{ key: 'table_name', width: 'minmax(160px, 1.5fr)' }];
    if (hasComment) {
      cols.push({ key: 'comment', width: 'minmax(120px, 1fr)' });
    }
    if (showDetail) {
      cols.push(
        { key: 'row_count', width: '80px', align: 'right' },
        { key: 'data_size', width: '80px', align: 'right' },
        { key: 'engine', width: '72px', align: 'center' },
        { key: 'create_time', width: '120px' },
        { key: 'update_time', width: '120px' },
      );
    }
    return cols;
  }, [dbType]);

  const { message } = App.useApp();

  const tableDataCache = useAppStore((state) => state.tableDataCache);
  const { getTables } = useDatabase();

  const cacheKey = `${connectionId}::${database || ''}`;
  const cacheData = tableDataCache[cacheKey];

  const tables = cacheData?.tables || [];
  const loading = localLoading || cacheData?.loading || false;

  const prevCacheKeyRef = useRef<string | null>(null);
  const prevDatabaseRef = useRef<string | undefined>(undefined);
  const isMountedRef = useRef(true);
  const autoLoadTriggeredRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // Ignore localStorage errors
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_DETAIL_STORAGE_KEY, String(showDetail));
    } catch {
      // ignore
    }
  }, [showDetail]);

  useEffect(() => {
    try {
      localStorage.setItem(DETAIL_WIDTH_STORAGE_KEY, String(detailWidth));
    } catch {
      // ignore
    }
  }, [detailWidth]);

  useEffect(() => {
    // 未选择数据库时不自动加载
    if (!database) return;
    if (autoLoadTriggeredRef.current) return;
    autoLoadTriggeredRef.current = true;

    const currentCacheKey = `${connectionId}::${database || ''}`;
    // 只在 connectionId/database 真正变化时（或组件重新挂载时）自动加载，
    // 避免 clearTableData 清除缓存后触发重复请求和重复 toast
    if (currentCacheKey !== prevCacheKeyRef.current) {
      prevCacheKeyRef.current = currentCacheKey;
      prevDatabaseRef.current = database;
      if (!cacheData?.loaded && !cacheData?.loading && !cacheData?.loadFailed) {
        setLocalLoading(true);
        getTables(connectionId, database).finally(() => {
          if (isMountedRef.current) {
            setLocalLoading(false);
          }
        });
      }
    }
  }, [connectionId, database]);

  const handleTableClick = useCallback(
    (tableName: string) => {
      if (!isMountedRef.current) return;
      setSelectedRow(tableName);
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        onTableOpen?.(tableName, database);
      } else {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          if (isMountedRef.current) {
            onTableSelect?.(tableName, database);
          }
        }, 250);
      }
    },
    [database, onTableSelect, onTableOpen]
  );

  const handleTableClickRef = useRef(handleTableClick);
  handleTableClickRef.current = handleTableClick; // eslint-disable-line react-hooks/refs

  const refreshTablesRef = useCallback(async () => {
    if (!database) return;
    try {
      setLocalLoading(true);
      await getTables(connectionId, database, true, undefined);
    } catch (error: unknown) {
      if (isMountedRef.current) {
        console.error('Failed to refresh tables:', error);
        message.error(`${t('common.failedToRefreshTableList')}: ${error}`);
      }
    } finally {
      if (isMountedRef.current) {
        setLocalLoading(false);
      }
    }
  }, [connectionId, database, message, t]);

  const [contextTarget, setContextTarget] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-table-name]');
      const tableName = el?.getAttribute('data-table-name') ?? selectedRow ?? null;
      if (el) {
        setSelectedRow(tableName);
      }
      setContextTarget(tableName);
      setContextOpen(true);
    },
    [selectedRow],
  );

  const contextMenu = useMemo(() => {
    const table = contextTarget;
    return {
      items: [
        {
          key: 'open',
          icon: <FolderOpenOutlined />,
          label: t('common.tableList.contextMenu.openTable'),
          disabled: !table,
          onClick: () => table && onTableOpen?.(table, database),
        },
        {
          key: 'design',
          icon: <EditOutlined />,
          label: t('common.tableList.contextMenu.designTable'),
          disabled: !table,
          onClick: () => table && onTableDesign?.(table, database),
        },
        { type: 'divider' as const, key: 'd1' },
        {
          key: 'newTable',
          icon: <PlusOutlined />,
          label: t('common.tableList.contextMenu.newTable'),
          onClick: () => onTableNew?.(),
        },
        { type: 'divider' as const, key: 'd2' },
        {
          key: 'copyName',
          icon: <CopyOutlined />,
          label: t('common.tableList.contextMenu.copyTableName'),
          disabled: !table,
          onClick: () => {
            if (table) navigator.clipboard.writeText(table).catch(() => {});
          },
        },
        {
          key: 'copyStructure',
          icon: <CopyOutlined />,
          label: t('common.tableList.contextMenu.copyStructure'),
          disabled: !table,
          onClick: () => table && onTableCopy?.(table, database),
        },
        {
          key: 'copyStructureAndData',
          icon: <CopyOutlined />,
          label: t('common.tableList.contextMenu.copyStructureAndData'),
          disabled: !table,
          onClick: () => table && onTableCopy?.(table, database),
        },
        { type: 'divider' as const, key: 'd3' },
        {
          key: 'truncate',
          icon: <ClearOutlined />,
          danger: true,
          label: t('common.tableList.contextMenu.truncateTable'),
          disabled: !table,
          onClick: () => {
            if (!table) return;
            Modal.confirm({
              title: t('common.confirmTruncateTable'),
              content: t('common.confirmTruncateTableContent', { tableName: table }),
              okText: t('common.truncate'),
              okType: 'danger',
              onOk: () => onTableTruncate?.(table, database),
            });
          },
        },
        {
          key: 'drop',
          icon: <DeleteOutlined />,
          danger: true,
          label: t('common.tableList.contextMenu.dropTable'),
          disabled: !table,
          onClick: () => {
            if (!table) return;
            Modal.confirm({
              title: t('common.confirmDelete'),
              content: t('common.confirmDropTable', { tableName: table }),
              okText: t('common.delete'),
              okType: 'danger',
              onOk: () => onTableDelete?.(table, database),
            });
          },
        },
        { type: 'divider' as const, key: 'd4' },
        {
          key: 'dump',
          icon: <CodeOutlined />,
          label: t('common.tableList.contextMenu.dumpSql'),
          disabled: !table,
          onClick: () => table && onTableDump?.(table, database),
        },
        { type: 'divider' as const, key: 'd5' },
        {
          key: 'refresh',
          icon: <ReloadOutlined />,
          label: t('common.tableList.contextMenu.refresh'),
          onClick: () => refreshTablesRef(),
        },
      ],
    };
  }, [
    contextTarget,
    t,
    database,
    onTableOpen,
    onTableDesign,
    onTableNew,
    onTableCopy,
    onTableTruncate,
    onTableDelete,
    onTableDump,
    refreshTablesRef,
  ]);

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, order: prev.order === 'asc' ? 'desc' : 'asc' };
      }
      return { key, order: 'asc' };
    });
  }, []);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(async () => {
      if (!database) return;
      try {
        setLocalLoading(true);
        await getTables(connectionId, database, true, value || undefined);
    } catch (error: unknown) {
        if (isMountedRef.current) {
          console.error('Search failed:', error);
        }
      } finally {
        if (isMountedRef.current) {
          setLocalLoading(false);
        }
      }
    }, 300);
  };

  const selectedTable = useMemo(
    () => tables.find((t) => t.table_name === selectedRow),
    [tables, selectedRow],
  );

  const { filteredTables, tableCount, viewCount } = useMemo(() => {
    let tableCount = 0;
    let viewCount = 0;
    const filtered = tables.filter((t) => {
      if (schema && t.schema && t.schema !== schema) return false;
      if (t.table_type === 'BASE TABLE') {
        tableCount++;
        return objectType === 'table' || objectType === 'all';
      } else if (t.table_type === 'VIEW') {
        viewCount++;
        return objectType === 'view' || objectType === 'all';
      }
      return objectType === 'all';
    });
    if (sort.key) {
      filtered.sort((a, b) => {
        const av = formatSortValue(a, sort.key as SortKey);
        const bv = formatSortValue(b, sort.key as SortKey);
        if (av === '' && bv !== '') return sort.order === 'asc' ? 1 : -1;
        if (bv === '' && av !== '') return sort.order === 'asc' ? -1 : 1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sort.order === 'asc' ? av - bv : bv - av;
        }
        return sort.order === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }
    return { filteredTables: filtered, tableCount, viewCount };
  }, [tables, objectType, schema, sort]);

  const tableRowItems = useMemo(
    () =>
      filteredTables.map((table) => (
        <TableRow
          key={table.schema ? `${table.schema}.${table.table_name}` : table.table_name}
          table={table}
          selected={selectedRow === table.table_name}
          onClick={() => handleTableClickRef.current(table.table_name)}
          columns={columns}
        />
      )),
    [filteredTables, selectedRow, columns]
  );

  const tableGridItems = useMemo(
    () =>
      filteredTables.map((table) => (
        <TableGridCard
          key={table.schema ? `${table.schema}.${table.table_name}` : table.table_name}
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
          background: 'var(--background-card)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Space size="small">
          <Tooltip
            title={t('common.globalSearch.openTable')}
            open={!selectedRow ? false : undefined}
          >
            <span>
              <Button
                icon={<FolderOpenOutlined />}
                size="small"
                disabled={!selectedRow}
                title={selectedRow ? '' : t('common.pleaseSelectATable')}
                onClick={() => selectedRow && onTableOpen?.(selectedRow, database)}
              />
            </span>
          </Tooltip>
          <Tooltip title={t('common.designTable')} open={!selectedRow ? false : undefined}>
            <span>
              <Button
                icon={<EditOutlined />}
                size="small"
                disabled={!selectedRow}
                title={selectedRow ? '' : t('common.pleaseSelectATable')}
                onClick={() => selectedRow && onTableDesign?.(selectedRow, database)}
              />
            </span>
          </Tooltip>
          <Tooltip title={t('common.createNewTable')}>
            <span>
              <Button icon={<PlusOutlined />} size="small" onClick={onTableNew} />
            </span>
          </Tooltip>
          <Tooltip title={t('common.truncateTable')} open={!selectedRow ? false : undefined}>
            <span>
              <Button
                icon={<ClearOutlined />}
                size="small"
                disabled={!selectedRow}
                title={selectedRow ? '' : t('common.pleaseSelectATable')}
                danger
                onClick={() => {
                  if (selectedRow) {
                    Modal.confirm({
                      title: t('common.confirmTruncateTable'),
                      content: t('common.confirmTruncateTableContent', { tableName: selectedRow }),
                      okText: t('common.truncate'),
                      okType: 'danger',
                      onOk: () => onTableTruncate?.(selectedRow, database),
                    });
                  }
                }}
              />
            </span>
          </Tooltip>
          <Tooltip title={t('common.copyTable.title')} open={!selectedRow ? false : undefined}>
            <span>
              <Button
                icon={<CopyOutlined />}
                size="small"
                disabled={!selectedRow}
                title={selectedRow ? '' : t('common.pleaseSelectATable')}
                onClick={() => {
                  if (selectedRow) {
                    const newName = `${selectedRow}_copy`;
                    const inputId = `copy-table-name-${++nextCopyIdRef.current}`;
                    Modal.confirm({
                      title: t('common.copyTable.title'),
                      okText: t('common.copy'),
                      content: (
                        <div>
                          <p>{t('common.willCopyTable', { tableName: selectedRow })}</p>
                          <input
                            id={inputId}
                            autoFocus
                            defaultValue={newName}
                            style={{
                              width: '100%',
                              padding: 4,
                              border: '1px solid var(--border)',
                              borderRadius: 4,
                              background: 'var(--background)',
                              color: 'var(--text)',
                            }}
                          />
                        </div>
                      ),
                      getContainer: false,
                      onOk: () => {
                        onTableCopy?.(selectedRow, database);
                      },
                    });
                  }
                }}
              />
            </span>
          </Tooltip>
          <Tooltip title={t('common.dumpSql')} open={!selectedRow ? false : undefined}>
            <span>
              <Button
                icon={<CodeOutlined />}
                size="small"
                disabled={!selectedRow}
                title={selectedRow ? '' : t('common.pleaseSelectATable')}
                onClick={() => selectedRow && onTableDump?.(selectedRow, database)}
              />
            </span>
          </Tooltip>
          <Tooltip title={t('common.dropTable')} open={!selectedRow ? false : undefined}>
            <span>
              <Button
                icon={<DeleteOutlined />}
                size="small"
                disabled={!selectedRow}
                title={selectedRow ? '' : t('common.pleaseSelectATable')}
                danger
                onClick={() => {
                  if (selectedRow) {
                    Modal.confirm({
                      title: t('common.confirmDelete'),
                      content: t('common.confirmDropTable', { tableName: selectedRow }),
                      okText: t('common.delete'),
                      okType: 'danger',
                      onOk: () => onTableDelete?.(selectedRow, database),
                    });
                  }
                }}
              />
            </span>
          </Tooltip>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <Tooltip title={t('common.importWizard')}>
            <span>
              <Button
                icon={<ImportOutlined />}
                size="small"
                onClick={() => onImport?.(selectedRow || '', database)}
              />
            </span>
          </Tooltip>
          <Tooltip title={t('common.exportWizard')}>
            <span>
              <Button
                icon={<ExportOutlined />}
                size="small"
                onClick={() => onExport?.(selectedRow || '', database)}
              />
            </span>
          </Tooltip>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <Tooltip title={t('common.refresh')}>
            <span>
              <Button
                icon={<ReloadOutlined />}
                size="small"
                onClick={refreshTablesRef}
                loading={loading}
              />
            </span>
          </Tooltip>
        </Space>

        <GlobalInput
          placeholder={t('common.searchTableOrComment')}
          prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
          value={searchText}
          onChange={(e) => {
            const val = e.target.value;
            setSearchText(val);
            handleSearch(val);
          }}
          allowClear
          size="small"
          style={{ width: 180, marginLeft: 'auto' }}
        />

        <Space size="small">
          {objectType === 'all' ? (
            <>
              <Tag style={{ margin: 0, padding: '0 7px', display: 'inline-flex', alignItems: 'center', background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>
                {t('common.dumpDialog.tables')} {tableCount}
              </Tag>
              <Tag style={{ margin: 0, padding: '0 7px', display: 'inline-flex', alignItems: 'center', background: 'var(--color-info-alpha-15)', color: 'var(--color-info)', border: '1px solid var(--color-info-alpha-30)' }}>
                {t('common.databaseProperties.views')} {viewCount}
              </Tag>
            </>
          ) : objectType === 'table' ? (
            <Tag style={{ margin: 0, padding: '0 7px', display: 'inline-flex', alignItems: 'center', background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>
              {t('common.dumpDialog.tables')} {tableCount}
            </Tag>
          ) : (
            <Tag style={{ margin: 0, padding: '0 7px', display: 'inline-flex', alignItems: 'center', background: 'var(--color-info-alpha-15)', color: 'var(--color-info)', border: '1px solid var(--color-info-alpha-30)' }}>
              {t('common.databaseProperties.views')} {viewCount}
            </Tag>
          )}
          <Tooltip
            title={
              viewMode === 'list' ? t('common.switchToGridView') : t('common.switchToListView')
            }
          >
            <span>
              <Button
                icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                size="small"
                type="text"
                onClick={() => setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'))}
              />
            </span>
          </Tooltip>
          <Tooltip title={showDetail ? t('common.hideDetail') : t('common.showDetail')}>
            <span>
              <Button
                icon={<InfoCircleOutlined />}
                size="small"
                type={showDetail ? 'primary' : 'text'}
                onClick={() => setShowDetail((prev) => !prev)}
              />
            </span>
          </Tooltip>
        </Space>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Dropdown
          menu={contextMenu}
          trigger={['contextMenu']}
          open={contextOpen}
          onOpenChange={setContextOpen}
        >
          <div
            onContextMenu={handleContextMenu}
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
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>
                {t('common.erDiagram.loading')}
              </div>
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
                <Empty
                  description={searchText ? t('common.noMatchingTables') : t('common.noTables')}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ) : (
                <Empty description={t('common.noTables')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div style={{ background: 'var(--background-card)' }}>
              <ListHeader sort={sort} onSort={handleSort} columns={columns} />
              {tableRowItems}
            </div>
          ) : (
            <div style={{ padding: 8 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 8,
                }}
              >
                {tableGridItems}
              </div>
            </div>
          )}
          </div>
        </Dropdown>
        {showDetail && (
          <TableDetailSidebar
            connectionId={connectionId}
            database={database}
            tableName={selectedRow}
            tableType={selectedTable?.table_type}
            tableComment={selectedTable?.comment}
            width={detailWidth}
            onWidthChange={setDetailWidth}
          />
        )}
      </div>
    </div>
  );
}

export const TableList = React.memo(TableListComponent);
