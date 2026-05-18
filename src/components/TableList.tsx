import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tag, Spin, Empty, Button, Space, Tooltip, Modal, App } from 'antd';
import { GlobalInput } from './GlobalInput';
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

const nextCopyIdRef = { current: 0 };

interface ColumnDef {
  key: string;
  width: string;
  align?: 'left' | 'right' | 'center';
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
  onTableTruncate?: (tableName: string, database?: string) => void;
  onTableCopy?: (tableName: string, database?: string) => void;
  onTableDump?: (tableName: string, database?: string) => void;
  onImport?: () => void;
  onExport?: () => void;
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
          <EyeOutlined
            style={{ fontSize: 14, color: 'var(--db-color-sqlserver)', flexShrink: 0 }}
          />
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
            <EyeOutlined style={{ fontSize: 12, color: 'var(--db-color-sqlserver)', flexShrink: 0 }} />
          ) : (
            <TableOutlined style={{ color: 'var(--color-success)', flexShrink: 0, fontSize: 12 }} />
          )}
          <span
            title={t.table_name}
            style={{
              fontSize: 12,
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
              fontSize: 11,
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
                fontSize: 11,
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
              fontSize: 11,
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
              fontSize: 10,
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
                fontSize: 10,
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
                fontSize: 10,
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
        onClick={onClick}
        style={{
          display: 'grid',
          gridTemplateColumns: columns.map((c) => c.width).join(' '),
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
        fontSize: 11,
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
  const tc = useThemeColors();
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
    } catch {}
  }, [viewMode]);

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
  handleTableClickRef.current = handleTableClick;

  const refreshTablesRef = useCallback(async () => {
    if (!database) return;
    try {
      setLocalLoading(true);
      await getTables(connectionId, database, true, undefined);
    } catch (error: any) {
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
      } catch (error: any) {
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
  }, [tables, objectType, sort]);

  const tableRowItems = useMemo(
    () =>
      filteredTables.map((table) => (
        <TableRow
          key={table.table_name}
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
              <Button icon={<ImportOutlined />} size="small" onClick={onImport} />
            </span>
          </Tooltip>
          <Tooltip title={t('common.exportWizard')}>
            <span>
              <Button icon={<ExportOutlined />} size="small" onClick={onExport} />
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
              <Tag color="blue">
                {t('common.dumpDialog.tables')} {tableCount}
              </Tag>
              <Tag color="purple">
                {t('common.databaseProperties.views')} {viewCount}
              </Tag>
            </>
          ) : objectType === 'table' ? (
            <Tag color="blue">
              {t('common.dumpDialog.tables')} {tableCount}
            </Tag>
          ) : (
            <Tag color="purple">
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
          <div style={{ padding: 4 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 2,
              }}
            >
              {tableGridItems}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const TableList = React.memo(TableListComponent);
