/**
 * DataTable — 表数据浏览组件（Glide Data Grid 版）
 *
 * 完整功能：拖拽选择、内联编辑、范围编辑、右键菜单、筛选、
 * 列拖动、列可见性、导出、快速筛选、ENUM/Date 编辑器。
 */
import { useEffect, useState, useMemo, useRef, useCallback, memo } from 'react';
import {
  Spin, Empty, Button, Space, message, Tag, Select,
  Tooltip, Input, Divider, DatePicker, Checkbox, Popover, Dropdown, AutoComplete,
} from 'antd';
import {
  DownloadOutlined, PlusOutlined, DeleteOutlined,
  ImportOutlined, FilterOutlined, CopyOutlined,
  EyeInvisibleOutlined, SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../hooks/useApi';
import { useThemeColors } from '../hooks/useThemeColors';
import { useAppStore } from '../stores/appStore';
import type { ColumnInfo, DatabaseType } from '../types/api';
import { type RowData, buildQuery, buildCountQuery } from './DataTable/utils';
import { escapeSqlIdentifier, escapeSqlValue } from '../utils/sqlUtils';
import { exportToExcel } from '../utils/exportUtils';
import { GlideDataTable, type GlideRow, type GlideColumn } from './DataTable/GlideDataTable';
import { rowsToGlideRows, tableRowStatus, tableCellModified } from './DataTable/adapters/tableAdapter';

interface DataTableProps {
  connectionId: string;
  onDirtyChange?: (isDirty: boolean) => void;
  tableName: string;
  database?: string;
  pageSize?: number;
}

export const DataTable = memo(function DataTable({
  connectionId, tableName, database, pageSize: propPageSize,
  onDirtyChange: _onDirtyChange,
}: DataTableProps) {
  const { t } = useTranslation();
  const dbType = useAppStore((s) => s.connections.find((c) => c.id === connectionId)?.db_type);
  const tc = useThemeColors();
  const { getColumns, executeQuery } = useDatabase();

  // ── State ──
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [queryColumns, setQueryColumns] = useState<string[]>([]);
  const [rowData, setRowData] = useState<RowData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRows, setSelectedRows] = useState<RowData[]>([]);
  const defaultPageSize = 1000;
  const [pageSize, setPageSizeState] = useState(propPageSize ?? defaultPageSize);
  const [currentPage, setCurrentPage] = useState(1);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [columnOrder, setColumnOrder] = useState<string[] | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [quickFilter, setQuickFilter] = useState('');
  const [pageInput, setPageInput] = useState('1');
  const [whereClause, setWhereClause] = useState('');
  const [orderByClause, setOrderByClause] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [showColVisibility, setShowColVisibility] = useState(false);
  const [currentSql, setCurrentSql] = useState('');
  const [lastDmlSql, setLastDmlSql] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [contextMenu, setCtx] = useState<{ v: boolean; x: number; y: number; rowIdx: number; colIdx: number }>({ v: false, x: 0, y: 0, rowIdx: -1, colIdx: -1 });

  // ── Range Edit ──
  // ── Filter Panel ──
  interface FilterRow { id: string; column: string; op: string; value: string; logic: 'AND' | 'OR'; }
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const addFilterRow = useCallback(() => {
    setFilterRows((prev) => [...prev, { id: `f-${Date.now()}`, column: '', op: '=', value: '', logic: prev.length > 0 ? 'AND' : '' as any }]);
  }, []);
  const buildWhereFromFilters = useCallback((rows: FilterRow[], dbType?: DatabaseType): string => {
    const parts = rows.filter((r) => r.column && r.op && r.value !== undefined);
    if (parts.length === 0) return '';
    return parts.map((r, i) => {
      const col = escapeSqlIdentifier(r.column, dbType);
      const val = r.op === 'LIKE' ? `'%${r.value}%'` : escapeSqlValue(r.value, dbType);
      return `${i > 0 ? ` ${r.logic} ` : ''}${col} ${r.op} ${val}`;
    }).join('');
  }, []);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // ── Refs ──
  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  // ── Data Loading ──
  const loadData = useCallback(async () => {
    if (!connectionId || !tableName || loadingRef.current) return;
    const requestId = ++reqIdRef.current;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    try {
      loadingRef.current = true; setLoading(true);
      const query = buildQuery(currentPage, pageSize, tableName, database, dbType, undefined, whereClause, orderByClause, undefined, undefined);
      setCurrentSql(query);
      const [colResult, dataResult] = await Promise.all([
        getColumns(connectionId, tableName, database),
        executeQuery(connectionId, query, database || ''),
      ]);
      if (abortRef.current.signal.aborted || requestId !== reqIdRef.current) return;
      if (dataResult.error) {
        message.error(`${t('common.failedToLoadData')}: ${dataResult.error}`);
        setColumns([]); setRowData([]);
      } else {
        const rows = dataResult.rows || [];
        const cols = colResult || [];
        let idCounter = 0;
        const data: RowData[] = rows.map((row) => {
          const r: RowData = { __row_id__: `row-${++idCounter}` };
          const orig: Record<string, unknown> = {};
          for (let i = 0; i < dataResult.columns.length; i++) {
            const colName = dataResult.columns[i];
            r[colName] = row[i];
            orig[colName] = row[i];
          }
          r.__original_data__ = orig;
          return r;
        });
        setColumns(cols);
        setQueryColumns(dataResult.columns);
        setRowData(data);
        setHasLoaded(true);
      }
    } catch (err: unknown) {
      if (requestId !== reqIdRef.current) return;
      message.error(`${t('common.failedToLoadData')}: ${err instanceof Error ? err.message : String(err)}`);
      setColumns([]); setRowData([]); setHasLoaded(true);
    } finally {
      if (requestId === reqIdRef.current) { setLoading(false); loadingRef.current = false; abortRef.current = null; }
    }
  }, [connectionId, tableName, database, currentPage, pageSize, dbType, whereClause, orderByClause, getColumns, executeQuery, t]);

  const loadCount = useCallback(async () => {
    if (!connectionId || !tableName) return;
    const q = buildCountQuery(tableName, database, dbType, '');
    const r = await executeQuery(connectionId, q, database || '');
    if (!r.error && r.rows.length > 0) setTotalCount(Number(r.rows[0][0]));
  }, [connectionId, tableName, database, dbType, executeQuery]);

  useEffect(() => { setHasLoaded(false); loadData(); loadCount(); }, [connectionId, tableName, database]);
  useEffect(() => { if (hasLoaded && currentPage > 0) loadData(); }, [hasLoaded, currentPage, pageSize]);
  useEffect(() => { setPageInput(String(currentPage)); }, [currentPage]);

  // ── Quick Filter ──
  const filteredRows = useMemo(() => {
    if (!quickFilter) return rowData;
    const q = quickFilter.toLowerCase();
    return rowData.filter((r) => {
      for (const col of columns) { if (String(r[col.column_name] ?? '').toLowerCase().includes(q)) return true; }
      return false;
    });
  }, [rowData, quickFilter, columns]);

  // ── Edit (inline) ──
  const handleCellEdited = useCallback(async (col: number, row: number, newValue: string) => {
    const glideCols = (() => {
      let cols = queryColumns;
      if (columnOrder) { const s = new Set(columnOrder); cols = [...columnOrder.filter((n) => queryColumns.includes(n)), ...queryColumns.filter((n) => !s.has(n))]; }
      return cols;
    })();
    const colId = glideCols[col];
    if (!colId) return;
    const pkCol = columns.find((c) => c.column_key === 'PRI');
    if (!pkCol) { message.warning(t('common.tableHasNoPrimaryKeyCannotUpdate')); return; }
    const targetRow = rowData[row];
    if (!targetRow) return;
    const origVal = targetRow.__original_data__?.[colId];
    const normalizedOrig = origVal == null ? 'NULL' : String(origVal);
    if (normalizedOrig === (newValue === '' || newValue === 'NULL' ? 'NULL' : newValue)) return;
    const pkValue = targetRow[pkCol.column_name];
    const vs = newValue === '' || newValue === 'NULL' ? 'NULL' : escapeSqlValue(newValue, dbType);
    const sql = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${escapeSqlIdentifier(colId, dbType)} = ${vs} WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(pkValue, dbType)}`;
    setLastDmlSql(sql);
    try {
      const res = await executeQuery(connectionId, sql, database || '');
      if (res.error) { message.error(`${t('common.dataGrid.updateFailed')}: ${res.error}`); }
      else {
        setRowData((prev) => prev.map((r) => {
          if (r.__row_id__ !== targetRow.__row_id__) return r;
          return { ...r, [colId]: newValue === 'NULL' ? null : newValue, __status__: undefined };
        }));
        message.success(t('common.dataGrid.updateSuccess'));
      }
    } catch (err) { message.error(`${t('common.dataGrid.updateFailed')}: ${err instanceof Error ? err.message : String(err)}`); }
  }, [columns, columnOrder, queryColumns, rowData, tableName, dbType, connectionId, database, executeQuery, t]);

  // ── Edit (range) ──
  const handleCellsEdited = useCallback(async (edits: Array<{ col: number; row: number; value: string }>) => {
    for (const edit of edits) {
      const colId = (() => {
        let cols = queryColumns;
        if (columnOrder) { const s = new Set(columnOrder); cols = [...columnOrder.filter((n) => queryColumns.includes(n)), ...queryColumns.filter((n) => !s.has(n))]; }
        return cols;
      })()[edit.col];
      if (!colId) continue;
      const pkCol = columns.find((c) => c.column_key === 'PRI');
      if (!pkCol) { message.warning(t('common.tableHasNoPrimaryKeyCannotUpdate')); return; }
      const targetRow = rowData[edit.row];
      if (!targetRow) continue;
      const origVal = targetRow.__original_data__?.[colId];
      const normalizedOrig = origVal == null ? 'NULL' : String(origVal);
      if (normalizedOrig === (edit.value === '' || edit.value === 'NULL' ? 'NULL' : edit.value)) continue;
      const vs = edit.value === '' || edit.value === 'NULL' ? 'NULL' : escapeSqlValue(edit.value, dbType);
      const sql = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${escapeSqlIdentifier(colId, dbType)} = ${vs} WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(targetRow[pkCol.column_name], dbType)}`;
      setLastDmlSql(sql);
      try {
        const res = await executeQuery(connectionId, sql, database || '');
        if (res.error) { message.error(`${t('common.dataGrid.updateFailed')}: ${res.error}`); return; }
        setRowData((prev) => prev.map((r) => {
          if (r.__row_id__ !== targetRow.__row_id__) return r;
          return { ...r, [colId]: edit.value === 'NULL' ? null : edit.value, __status__: undefined };
        }));
      } catch (err) { message.error(`${t('common.dataGrid.updateFailed')}: ${err instanceof Error ? err.message : String(err)}`); return; }
    }
    message.success(t('common.dataGrid.updateSuccess'));
  }, [columns, columnOrder, queryColumns, rowData, tableName, dbType, connectionId, database, executeQuery, t]);

  // ── Add Row ──
  const handleAddRow = useCallback(() => {
    const nr: RowData = { __row_id__: `new-${Date.now()}`, __status__: 'new', __original_data__: {} };
    columns.forEach((col) => { nr[col.column_name] = null; });
    setRowData((prev) => [...prev, nr]);
  }, [columns]);

  // ── Delete ──
  const handleDeleteRows = useCallback(async () => {
    if (selectedRows.length === 0) { message.warning(t('common.pleaseSelectRowsToDelete')); return; }
    const pkCol = columns.find((c) => c.column_key === 'PRI');
    if (!pkCol && selectedRows.some((r) => r.__status__ !== 'new')) { message.warning(t('common.tableHasNoPrimaryKeyCannotDelete')); return; }
    try {
      setLoading(true);
      let success = 0, errMsg = '';
      for (const row of selectedRows) {
        if (row.__status__ === 'new') { setRowData((prev) => prev.filter((r) => r.__row_id__ !== row.__row_id__)); success++; continue; }
        const sql = `DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(pkCol!.column_name, dbType)} = ${escapeSqlValue(row[pkCol!.column_name], dbType)}`;
        setLastDmlSql(sql);
        const res = await executeQuery(connectionId, sql, database || '');
        if (res.error) { errMsg = res.error; break; }
        success++;
      }
      if (errMsg) message.error(`${t('common.dataGrid.deleteFailed')}: ${errMsg}`);
      else { message.success(`${t('common.dataGrid.deleteSuccess')} ${success} ${t('common.rows')}`); setSelectedRows([]); loadData(); loadCount(); }
    } catch (err) { message.error(`${t('common.dataGrid.deleteFailed')}: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setLoading(false); }
  }, [selectedRows, columns, tableName, dbType, connectionId, database, executeQuery, loadData, loadCount, t]);

  // ── Selection ──
  const handleSelectionChange = useCallback((rows: GlideRow[], _selection: any) => {
    setSelectedRows(rows as unknown as RowData[]);
  }, []);

  // ── Context Menu ──
  const closeCtx = useCallback(() => setCtx((p) => ({ ...p, v: false })), []);
  const ctxCopyInsert = useCallback(() => {
    if (!tableName || selectedRows.length === 0) return;
    const cols = queryColumns.filter((c) => !hiddenColumns.has(c));
    const vals = selectedRows.map((r) => `(${cols.map((c) => escapeSqlValue(r[c], dbType)).join(', ')})`);
    const sql = `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${cols.map((c) => escapeSqlIdentifier(c, dbType)).join(', ')})\nVALUES\n${vals.join(',\n')};`;
    navigator.clipboard.writeText(sql);
    message.success(t('common.copyTable.copied'));
    closeCtx();
  }, [tableName, selectedRows, queryColumns, hiddenColumns, dbType, t, closeCtx]);

  const ctxCopyUpdate = useCallback(() => {
    if (!tableName || selectedRows.length === 0) return;
    const pkCol = columns.find((c) => c.column_key === 'PRI');
    if (!pkCol) { message.warning(t('common.tableHasNoPrimaryKeyCannotUpdate')); return; }
    const sqls = selectedRows.map((r) => {
      const setters = queryColumns.filter((c) => c !== pkCol.column_name && !hiddenColumns.has(c)).map((c) => `${escapeSqlIdentifier(c, dbType)} = ${escapeSqlValue(r[c], dbType)}`).join(', ');
      return `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${setters} WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(r[pkCol.column_name], dbType)}`;
    });
    navigator.clipboard.writeText(sqls.join('\n'));
    message.success(`${t('common.copyTable.copied')} ${selectedRows.length} ${t('common.rows')}`);
    closeCtx();
  }, [tableName, selectedRows, columns, queryColumns, hiddenColumns, dbType, t, closeCtx]);

  // ── Export ──
  const exportColNames = useMemo(() => columns.filter((c) => !hiddenColumns.has(c.column_name)).map((c) => c.column_name), [columns, hiddenColumns]);
  const handleExportCsv = useCallback(() => {
    if (rowData.length === 0) { message.warning(t('common.noDataToExport')); return; }
    const esc = (v: string) => { if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`; return v; };
    const header = exportColNames.join(',');
    const body = rowData.map((r) => exportColNames.map((n) => esc(r[n] == null ? '' : String(r[n]))).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${tableName}.csv`; a.click();
    message.success(t('common.importExport.exportSuccess'));
  }, [rowData, exportColNames, tableName, message, t]);

  const handleExportExcel = useCallback(() => {
    if (rowData.length === 0) { message.warning(t('common.noDataToExport')); return; }
    const data = rowData.map((r) => { const o: Record<string, any> = {}; exportColNames.forEach((n) => { o[n] = r[n]; }); return o; });
    const cols = exportColNames.map((n) => ({ field: n, headerName: n }));
    exportToExcel(data, cols, { filename: `${tableName}.xlsx`, sheetName: tableName });
    message.success(t('common.importExport.exportSuccess'));
  }, [rowData, exportColNames, tableName, message, t]);

  // ── Glide Data ──
  const glideCols = useMemo(() => {
    const typeMap = new Map(columns.map((c) => [c.column_name, c.data_type]));
    const pkSet = new Set(columns.filter((c) => c.column_key === 'PRI').map((c) => c.column_name));
    let cols = queryColumns;
    if (columnOrder) { const s = new Set(columnOrder); cols = [...columnOrder.filter((n) => queryColumns.includes(n)), ...queryColumns.filter((n) => !s.has(n))]; }
    return cols.map((name) => ({
      id: name,
      title: `${name}|${typeMap.get(name) || ''}|${pkSet.has(name) ? '1' : '0'}`,
      width: colWidths[name] || undefined,
    }));
  }, [queryColumns, columnOrder, colWidths, columns]);

  const glideRows = useMemo(() => rowsToGlideRows(filteredRows, columns), [filteredRows, columns]);

  // ── Column Resize ──
  const onColumnResized = useCallback((col: any, newWidth: number, colIndex: number) => {
    const colId = glideCols[colIndex]?.id;
    if (colId) {
      setColWidths((prev) => ({ ...prev, [colId]: newWidth }));
    }
  }, [glideCols]);

  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalCount);

  const copySql = useCallback(() => {
    navigator.clipboard.writeText(currentSql);
    message.success(t('common.sqlCopied'));
  }, [currentSql, t]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--background-card)' }}>
      {/* ═══ Toolbar ═══ */}
      <div style={{ padding: '1px 4px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--background-toolbar)', flexShrink: 0, minHeight: 22 }}>
        <Space size={2} split={<Divider type="vertical" style={{ height: 14, margin: '0 4px', background: 'var(--border-color)' }} />}>
          <Button icon={<PlusOutlined />} onClick={handleAddRow} type="primary" size="small" style={{ height: 20, padding: '0 6px', fontSize: 11 }}>{t('common.addRowLabel')}</Button>
          <Button icon={<DeleteOutlined />} onClick={handleDeleteRows} disabled={selectedRows.length === 0} danger size="small" style={{ height: 20, padding: '0 6px', fontSize: 11 }}>{t('common.delete')}</Button>
          <Tooltip title={t('common.refreshLabel')}><Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }} /></Tooltip>
          <Tooltip title={t('common.dataGrid.filter')}><Button icon={<FilterOutlined />} onClick={() => setShowFilterPanel(!showFilterPanel)} type={showFilterPanel || whereClause ? 'primary' : 'default'} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }} /></Tooltip>
          <Popover content={
            <Space direction="vertical" size={2} style={{ maxHeight: 200, overflow: 'auto' }}>
              {columns.map((col) => (
                <label key={col.column_name} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!hiddenColumns.has(col.column_name)} onChange={() => setHiddenColumns((prev) => { const n = new Set(prev); if (n.has(col.column_name)) n.delete(col.column_name); else n.add(col.column_name); return new Set(n); })} />{col.column_name}
                </label>
              ))}
            </Space>
          } trigger="click" open={showColVisibility} onOpenChange={setShowColVisibility}>
            <Tooltip title={t('common.columnVisibility')}><Button icon={<EyeInvisibleOutlined />} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }} /></Tooltip>
          </Popover>
          <Dropdown menu={{ items: [
            { key: 'csv', label: t('common.exportCsv'), onClick: handleExportCsv },
            { key: 'xlsx', label: t('common.exportExcel'), onClick: handleExportExcel },
          ]}}>
            <Button icon={<DownloadOutlined />} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }}>{t('common.export')}</Button>
          </Dropdown>
        </Space>
        <Space size={2}>
          <Input prefix={<SearchOutlined style={{ fontSize: 10, color: 'var(--text-tertiary)' }} />} value={quickFilter} onChange={(e) => setQuickFilter(e.target.value)} placeholder={t('common.search')} size="small" style={{ width: 160, height: 18, fontSize: 10 }} />
          <Tag color="blue" style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}>{tableName}</Tag>
          <Tag color="green" style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}>{totalCount.toLocaleString()} {t('common.rows')}</Tag>
          {selectedRows.length > 0 && <Tag color="orange" style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16 }}>{selectedRows.length} {t('common.rows')}</Tag>}
        </Space>
      </div>

      {/* ═══ Filter Bar ═══ */}
      {!showFilterPanel && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid var(--border-color)', flexShrink: 0, display: 'flex', gap: 12, alignItems: 'center', background: 'var(--background-toolbar)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{t('common.dataGrid.filter')}</span>
          <Input value={whereClause} onChange={(e) => setWhereClause(e.target.value)} placeholder={t('common.dataGrid.filterPlaceholder')} size="small" style={{ flex: 1, height: 20, fontSize: 11 }}
            onPressEnter={() => { setCurrentPage(1); loadData(); }} />
          <Divider type="vertical" style={{ height: 14, margin: 0, background: 'var(--border-color)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{t('common.dataGrid.orderBy')}</span>
          <Input value={orderByClause} onChange={(e) => setOrderByClause(e.target.value)} placeholder={t('common.dataGrid.orderBy') + ' ASC/DESC ...'} size="small" style={{ flex: 1, height: 20, fontSize: 11 }}
            onPressEnter={() => { setCurrentPage(1); loadData(); }} />
        </div>
      )}
      {/* ═══ Filter Panel（展开）═══ */}
      {showFilterPanel && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--background-toolbar)', flexShrink: 0 }}>
          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{t('common.filterConditions')}</span>
            <div style={{ flex: 1 }} />
            <Button size="small" onClick={() => { setWhereClause(buildWhereFromFilters(filterRows, dbType)); }} style={{ fontSize: 10, height: 18 }}>{t('common.previewSql')}</Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
            {filterRows.map((row, idx) => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {idx > 0 && (
                  <Select value={row.logic} onChange={(v) => setFilterRows((prev) => prev.map((r) => r.id === row.id ? { ...r, logic: v } : r))} size="small" style={{ width: 56, fontSize: 10 }} options={[{ label: 'AND', value: 'AND' }, { label: 'OR', value: 'OR' }]} />
                )}
                {idx === 0 && <div style={{ width: 56 }} />}
                <Select value={row.column} onChange={(v) => setFilterRows((prev) => prev.map((r) => r.id === row.id ? { ...r, column: v } : r))} size="small" style={{ minWidth: 120, fontSize: 10 }}
                  options={queryColumns.map((c) => ({ label: c, value: c }))} placeholder={t('common.column')} />
                <Select value={row.op} onChange={(v) => setFilterRows((prev) => prev.map((r) => r.id === row.id ? { ...r, op: v } : r))} size="small" style={{ width: 76, fontSize: 10 }}
                  options={[{ label: '=', value: '=' }, { label: '!=', value: '!=' }, { label: '>', value: '>' }, { label: '<', value: '<' }, { label: '>=', value: '>=' }, { label: '<=', value: '<=' }, { label: 'LIKE', value: 'LIKE' }]} />
                <Input value={row.value} onChange={(e) => setFilterRows((prev) => prev.map((r) => r.id === row.id ? { ...r, value: e.target.value } : r))} size="small" style={{ flex: 1, height: 20, fontSize: 10 }} placeholder={t('common.valuePlaceholder')} />
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setFilterRows((prev) => prev.filter((r) => r.id !== row.id))} style={{ height: 20, width: 20, padding: 0 }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <Button size="small" icon={<PlusOutlined />} onClick={addFilterRow} style={{ fontSize: 10, height: 20 }}>{t('common.addCondition', 'Add condition')}</Button>
            <Button size="small" onClick={() => { setFilterRows([]); setWhereClause(''); }} style={{ fontSize: 10, height: 20 }}>{t('common.clearFilter')}</Button>
            <div style={{ flex: 1 }} />
            <Button size="small" type="primary" onClick={() => {
              const w = buildWhereFromFilters(filterRows, dbType);
              setWhereClause(w);
              setCurrentPage(1);
              loadData();
              setShowFilterPanel(false);
            }} style={{ fontSize: 10, height: 20 }}>{t('common.applyFilter')}</Button>
          </div>
        </div>
      )}

      {/* ═══ Grid ═══ */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && !hasLoaded && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tc.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)', zIndex: 10 }}>
            <Spin size="large" />
          </div>
        )}
        {!loading && (filteredRows.length === 0 || !hasLoaded) && hasLoaded ? (
          <Empty description={t('common.noData')} style={{ marginTop: '20%' }} />
        ) : glideCols.length > 0 ? (
          <GlideDataTable columns={glideCols} rows={glideRows} hiddenColumns={hiddenColumns}
            rowStatus={tableRowStatus} isCellModified={tableCellModified}
            onSelectionChange={handleSelectionChange}
            onColumnMoved={(start, end) => {
              setColumnOrder((prev) => {
                const cur = prev ? [...prev] : [...queryColumns];
                const [m] = cur.splice(start, 1); cur.splice(end, 0, m); return cur;
              });
            }}
            onColumnResized={onColumnResized}
            onCellEdited={handleCellEdited}
            onCellsEdited={handleCellsEdited}
            onCellContextMenu={(col, row, bounds) => setCtx({ v: true, x: bounds.x, y: bounds.y, rowIdx: row, colIdx: col })}
            headerHeight={36} rowHeight={24} editable={true}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {hasLoaded ? <Empty description={t('common.noTableStructure')} /> : <Spin size="large" />}
          </div>
        )}
      </div>

      {/* ═══ Context Menu ═══ */}
      {contextMenu.v && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={closeCtx} />
          <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 2000, background: 'var(--background-card)', border: '1px solid var(--border)', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: '4px 0', minWidth: 180 }} onClick={closeCtx}>
            <MenuItem icon={<CopyOutlined />} label={t('common.dataGrid.copyAsInsert')} onClick={ctxCopyInsert} />
            <MenuItem icon={<CopyOutlined />} label={t('common.dataGrid.copyAsUpdate')} onClick={ctxCopyUpdate} />
            <Divider style={{ margin: '4px 0' }} />
            <MenuItem icon={<DeleteOutlined />} label={t('common.dataGrid.deleteRow')} onClick={() => handleDeleteRows()} danger />
          </div>
        </>
      )}

      {/* ═══ Status Bar ═══ */}
      <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--background-toolbar)', padding: '1px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, minHeight: 22 }}>
        <Space size={2}>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }}>{t('common.refreshLabel')}</Button>
          <Button icon={<ImportOutlined />} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }}>{t('common.import')}</Button>
        </Space>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          <code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: lastDmlSql ? 'var(--color-primary)' : 'var(--text-secondary)', fontFamily: 'monospace', padding: '2px 6px', background: 'var(--background-toolbar)', borderRadius: 3, border: '1px solid var(--border-color)', maxWidth: 700 }}>{currentSql}</code>
          <Tooltip title={t('common.copySql')}>
            <Button icon={<CopyOutlined />} type="text" onClick={copySql} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }} />
          </Tooltip>
        </div>
        <Space size={2} style={{ flexShrink: 0 }}>
          <Button size="small" disabled={currentPage === 1} onClick={() => setCurrentPage(1)} style={{ height: 20, padding: '0 8px', fontSize: 11, lineHeight: '18px' }} title="第一页">«</Button>
          <Button size="small" disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)} style={{ height: 20, padding: '0 8px', fontSize: 11, lineHeight: '18px' }}>‹</Button>
          <Input size="small" value={pageInput} onChange={(e) => setPageInput(e.target.value)} onBlur={() => { const v = parseInt(pageInput); if (!isNaN(v) && v > 0 && v <= Math.ceil(totalCount / pageSize)) setCurrentPage(v); else setPageInput(String(currentPage)); }} onPressEnter={() => { const v = parseInt(pageInput); if (!isNaN(v) && v > 0 && v <= Math.ceil(totalCount / pageSize)) setCurrentPage(v); else setPageInput(String(currentPage)); }} style={{ width: 32, fontSize: 11, textAlign: 'center', padding: '0 2px', height: 20 }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', userSelect: 'none' }}>/ {Math.ceil(totalCount / pageSize) || 1}</span>
          <Button size="small" disabled={currentPage * pageSize >= totalCount} onClick={() => setCurrentPage(currentPage + 1)} style={{ height: 20, padding: '0 8px', fontSize: 11, lineHeight: '18px' }}>›</Button>
          <Button size="small" disabled={currentPage * pageSize >= totalCount} onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize))} style={{ height: 20, padding: '0 8px', fontSize: 11, lineHeight: '18px' }} title="最后一页">»</Button>
          <AutoComplete value={String(pageSize)} onChange={(val) => { const n = parseInt(val); if (n > 0) { setPageSizeState(n); setCurrentPage(1); } }}
            size="small" style={{ width: 56, fontSize: 11 }} options={[{ value: '50' }, { value: '100' }, { value: '500' }, { value: '1000' }]}
            popupClassName="page-size-dropdown"
          />
          <style>{`.page-size-dropdown .ant-select-item-option { font-size: 11px !important; } .page-size-dropdown { min-width: 64px !important; }`}</style>
        </Space>
      </div>
    </div>
  );
});

/** 右键菜单项子组件 */
function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: danger ? 'var(--color-error)' : 'var(--text-primary)' }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      {icon}{label}
    </div>
  );
}

export default DataTable;
