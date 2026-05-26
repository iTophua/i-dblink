/**
 * DataTable — 表数据浏览组件（Glide Data Grid 版）
 *
 * 完整功能：拖拽选择、内联编辑、范围编辑、右键菜单、筛选、
 * 列拖动、列可见性、导出、快速筛选、ENUM/Date 编辑器。
 */
import { useEffect, useState, useMemo, useRef, useCallback, memo } from 'react';
import {
  Modal, Spin, Empty, Button, Space, message, Tag, Select,
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
import { useContextMenu } from './ContextMenu';
import { DataTableContextMenu } from './DataTable/DataTableContextMenu';
import { CellPreviewDialog } from './DataTable/CellPreviewDialog';
import { SqlInput } from './SqlInput';

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
  const [goToRowValue, setGoToRowValue] = useState('');
  const [whereClause, setWhereClause] = useState('');
  const [orderByClause, setOrderByClause] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [showColVisibility, setShowColVisibility] = useState(false);
  const [currentSql, setCurrentSql] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const { menuState, menuTarget, openMenu, closeMenu } = useContextMenu();
  const [cellPreview, setCellPreview] = useState<{ open: boolean; value: unknown; columnName: string; rowIndex?: number; colIndex?: number }>({ open: false, value: null, columnName: '' });


  // ── Range Edit ──
  // ── Filter Panel ──
  interface FilterCondition {
    id: string;
    field: string;
    operator: string;
    value: string;
    logic: 'AND' | 'OR';
    level?: number;
    isGroupStart?: boolean;
    isGroupEnd?: boolean;
  }
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([
    { id: 'filter-1', field: '', operator: 'contains', value: '', logic: 'AND' },
  ]);
  const buildWhereClause = useCallback((conditions: FilterCondition[], dbType?: DatabaseType): string => {
    const parts: string[] = [];
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      if (cond.isGroupStart) {
        parts.push('(');
        continue;
      }
      if (cond.isGroupEnd) {
        parts.push(')');
        continue;
      }
      if (!cond.field) continue;

      const col = escapeSqlIdentifier(cond.field, dbType);
      let clause = '';

      switch (cond.operator) {
        case 'contains':
          clause = `${col} LIKE '%${cond.value}%'`;
          break;
        case 'notContains':
          clause = `${col} NOT LIKE '%${cond.value}%'`;
          break;
        case 'equals':
          clause = `${col} = ${escapeSqlValue(cond.value, dbType)}`;
          break;
        case 'notEquals':
          clause = `${col} != ${escapeSqlValue(cond.value, dbType)}`;
          break;
        case 'startsWith':
          clause = `${col} LIKE '${cond.value}%'`;
          break;
        case 'endsWith':
          clause = `${col} LIKE '%${cond.value}'`;
          break;
        case 'greaterThan':
          clause = `${col} > ${escapeSqlValue(cond.value, dbType)}`;
          break;
        case 'lessThan':
          clause = `${col} < ${escapeSqlValue(cond.value, dbType)}`;
          break;
        case 'greaterOrEqual':
          clause = `${col} >= ${escapeSqlValue(cond.value, dbType)}`;
          break;
        case 'lessOrEqual':
          clause = `${col} <= ${escapeSqlValue(cond.value, dbType)}`;
          break;
        case 'isNull':
          clause = `${col} IS NULL`;
          break;
        case 'isNotNull':
          clause = `${col} IS NOT NULL`;
          break;
        case 'in':
          clause = `${col} IN (${cond.value.split(',').map((v) => escapeSqlValue(v.trim(), dbType)).join(', ')})`;
          break;
        case 'notIn':
          clause = `${col} NOT IN (${cond.value.split(',').map((v) => escapeSqlValue(v.trim(), dbType)).join(', ')})`;
          break;
        default:
          clause = `${col} = ${escapeSqlValue(cond.value, dbType)}`;
      }

      if (i > 0 && !cond.isGroupStart) {
        const prevCond = conditions[i - 1];
        if (!prevCond.isGroupStart) {
          clause = `${cond.logic} ${clause}`;
        }
      }
      parts.push(clause);
    }
    return parts.join(' ');
  }, []);
  const loadDataRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const clearFilter = useCallback(() => {
    setFilterConditions([{ id: `filter-${Date.now()}`, field: '', operator: 'contains', value: '', logic: 'AND' }]);
    setWhereClause('');
    setCurrentPage(1);
    loadDataRef.current?.();
  }, []);
  const applyFilter = useCallback(() => {
    const sql = buildWhereClause(filterConditions, dbType);
    setWhereClause(sql);
    setCurrentPage(1);
    loadDataRef.current?.();
  }, [filterConditions, dbType, buildWhereClause]);
  const updateFilterCondition = useCallback((id: string, updates: Partial<FilterCondition>) => {
    setFilterConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);
  const removeFilterCondition = useCallback((id: string) => {
    setFilterConditions((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const newConditions = [...prev];
      newConditions.splice(idx, 1);
      // If removing a group start, also remove its corresponding end
      if (prev[idx]?.isGroupStart) {
        const endIdx = newConditions.findIndex((c) => c.isGroupEnd && (c.level ?? 0) === (prev[idx].level ?? 0));
        if (endIdx >= 0) newConditions.splice(endIdx, 1);
      }
      // If removing a group end, also remove its corresponding start
      if (prev[idx]?.isGroupEnd) {
        const startIdx = newConditions.findIndex((c) => c.isGroupStart && (c.level ?? 0) === (prev[idx].level ?? 0));
        if (startIdx >= 0) newConditions.splice(startIdx, 1);
      }
      return newConditions;
    });
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

  // Assign loadData to ref for use in callbacks declared before it
  loadDataRef.current = loadData;

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

  // ── 获取可见列名列表（与 GlideDataTable 同步，过滤隐藏列）──
  const getVisibleColumns = useCallback(() => {
    let cols = queryColumns;
    if (columnOrder) { const s = new Set(columnOrder); cols = [...columnOrder.filter((n) => queryColumns.includes(n)), ...queryColumns.filter((n) => !s.has(n))]; }
    if (hiddenColumns.size > 0) cols = cols.filter((n) => !hiddenColumns.has(n));
    return cols;
  }, [queryColumns, columnOrder, hiddenColumns]);

  // ── Edit (inline) ──
  const handleCellEdited = useCallback((col: number, row: number, newValue: string) => {
    const visibleCols = getVisibleColumns();
    const colId = visibleCols[col];
    if (!colId) return;

    // 通过 glide rows（与 GlideDataGrid 行索引对齐）获取行 ID，
    // 再用 __row_id__ 在 rowData 中精确匹配，避免索引偏移问题。
    const glideRow = filteredRows[row];
    if (!glideRow) return;
    const targetRowId = glideRow.__row_id__ as string | undefined;
    if (!targetRowId) return;

    // 新增行：直接更新本地状态，不弹窗确认
    if (glideRow.__status__ === 'new') {
      setRowData((prev) => prev.map((r) => {
        if (r.__row_id__ !== targetRowId) return r;
        return { ...r, [colId]: newValue === 'NULL' ? null : newValue };
      }));
      return;
    }

    const targetRow = rowData.find((r) => r.__row_id__ === targetRowId);
    if (!targetRow) return;

    // 已有行：需要主键才能更新
    const pkCol = columns.find((c) => c.column_key === 'PRI');
    if (!pkCol) { message.warning(t('common.tableHasNoPrimaryKeyCannotUpdate')); return; }
    const origVal = targetRow.__original_data__?.[colId];
    const normalizedOrig = origVal == null ? 'NULL' : String(origVal);
    const normalizedNew = newValue == null || newValue === '' || newValue === 'NULL' ? 'NULL' : String(newValue);
    if (normalizedOrig === normalizedNew) return;
    const pkValue = targetRow[pkCol.column_name];
    const vs = newValue === '' || newValue === 'NULL' ? 'NULL' : escapeSqlValue(newValue, dbType);
    const sql = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${escapeSqlIdentifier(colId, dbType)} = ${vs} WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(pkValue, dbType)}`;
    Modal.confirm({
      title: t('common.dataGrid.updateConfirm'),
      content: <pre style={{ fontSize: 11, maxHeight: 160, overflow: 'auto', margin: 0, padding: 8, background: 'var(--bg-code, #f5f5f5)', borderRadius: 4, wordBreak: 'break-all' }}>{sql}</pre>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      zIndex: 2000,
      transitionName: '',
      maskTransitionName: '',
      centered: true,
      onOk: async () => {
        setCurrentSql(sql);
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
      },
    });
  }, [columns, getVisibleColumns, filteredRows, rowData, tableName, dbType, connectionId, database, executeQuery, t]);

  // ── Edit (range) ──
  const handleCellsEdited = useCallback((edits: Array<{ col: number; row: number; value: string }>) => {
    const visibleCols = getVisibleColumns();
    const newRowEdits: Array<{ rowId: string; colId: string; value: string }> = [];
    const existingEdits: Array<{ rowId: string; colId: string; value: string; sql: string }> = [];

    for (const edit of edits) {
      const colId = visibleCols[edit.col];
      if (!colId) continue;

      // 通过 glide rows 获取行 ID，精确匹配，避免索引偏移
      const glideRow = filteredRows[edit.row];
      if (!glideRow) continue;
      const targetRowId = glideRow.__row_id__ as string | undefined;
      if (!targetRowId) continue;

      if (glideRow.__status__ === 'new') {
        newRowEdits.push({ rowId: targetRowId, colId, value: edit.value });
        continue;
      }

      const targetRow = rowData.find((r) => r.__row_id__ === targetRowId);
      if (!targetRow) continue;

      const origVal = targetRow.__original_data__?.[colId];
      const normalizedOrig = origVal == null ? 'NULL' : String(origVal);
      const normalizedNew = edit.value == null || edit.value === '' || edit.value === 'NULL' ? 'NULL' : String(edit.value);
      if (normalizedOrig === normalizedNew) continue;
      const pkCol = columns.find((c) => c.column_key === 'PRI');
      if (!pkCol) continue;
      const vs = edit.value === '' || edit.value === 'NULL' ? 'NULL' : escapeSqlValue(edit.value, dbType);
      const sql = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${escapeSqlIdentifier(colId, dbType)} = ${vs} WHERE ${escapeSqlIdentifier(pkCol.column_name, dbType)} = ${escapeSqlValue(targetRow[pkCol.column_name], dbType)}`;
      existingEdits.push({ rowId: targetRowId, colId, value: edit.value, sql });
    }

    // 批量更新新增行本地状态
    if (newRowEdits.length > 0) {
      setRowData((prev) => prev.map((r) => {
        const editsForRow = newRowEdits.filter((e) => e.rowId === r.__row_id__);
        if (editsForRow.length === 0) return r;
        const updated = { ...r };
        editsForRow.forEach((e) => { updated[e.colId] = e.value === 'NULL' ? null : e.value; });
        return updated;
      }));
    }

    // 已有行批量更新
    if (existingEdits.length === 0) return;
    Modal.confirm({
      title: t('common.dataGrid.updateConfirm'),
      content: t('common.dataGrid.updateConfirmContent', { count: existingEdits.length }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      zIndex: 2000,
      transitionName: '',
      maskTransitionName: '',
      centered: true,
      onOk: async () => {
        for (const edit of existingEdits) {
          setCurrentSql(edit.sql);
          try {
            const res = await executeQuery(connectionId, edit.sql, database || '');
            if (res.error) { message.error(`${t('common.dataGrid.updateFailed')}: ${res.error}`); return; }
            setRowData((prev) => prev.map((r) => {
              if (r.__row_id__ !== edit.rowId) return r;
              return { ...r, [edit.colId]: edit.value === 'NULL' ? null : edit.value, __status__: undefined };
            }));
          } catch (err) { message.error(`${t('common.dataGrid.updateFailed')}: ${err instanceof Error ? err.message : String(err)}`); return; }
        }
        message.success(t('common.dataGrid.updateSuccess'));
      },
    });
  }, [columns, getVisibleColumns, filteredRows, rowData, tableName, dbType, connectionId, database, executeQuery, t]);

  // ── Add Row ──
  const [scrollToRowIndex, setScrollToRowIndex] = useState<number | undefined>(undefined);
  const handleAddRow = useCallback(() => {
    const nr: RowData = { __row_id__: `new-${Date.now()}`, __status__: 'new', __original_data__: {} };
    columns.forEach((col) => { nr[col.column_name] = null; });
    setRowData((prev) => {
      const next = [...prev, nr];
      // 新增行在末尾，下一帧滚动到它
      setScrollToRowIndex(next.length - 1);
      return next;
    });
  }, [columns]);

  // ── Save New Rows ──
  const newRows = useMemo(() => rowData.filter((r) => r.__status__ === 'new'), [rowData]);
  const handleSaveNewRows = useCallback(() => {
    if (newRows.length === 0) return;
    const visibleCols = getVisibleColumns();
    const sqls = newRows.map((row) => {
      const cols = visibleCols.filter((c) => row[c] !== null && row[c] !== undefined);
      if (cols.length === 0) return null;
      const colNames = cols.map((c) => escapeSqlIdentifier(c, dbType)).join(', ');
      const values = cols.map((c) => escapeSqlValue(row[c], dbType)).join(', ');
      return `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${colNames}) VALUES (${values});`;
    }).filter(Boolean) as string[];

    if (sqls.length === 0) { message.warning(t('common.noDataToInsert')); return; }

    Modal.confirm({
      title: t('common.dataGrid.insertConfirm', { count: sqls.length }),
      content: (
        <pre style={{ fontSize: 11, maxHeight: 200, overflow: 'auto', margin: 0, padding: 8, background: 'var(--bg-code, #f5f5f5)', borderRadius: 4, wordBreak: 'break-all' }}>
          {sqls.join('\n')}
        </pre>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      zIndex: 2000,
      transitionName: '',
      maskTransitionName: '',
      centered: true,
      onOk: async () => {
        try {
          setLoading(true);
          let success = 0;
          let errMsg = '';
          for (const sql of sqls) {
            setCurrentSql(sql);
            const res = await executeQuery(connectionId, sql, database || '');
            if (res.error) { errMsg = res.error; break; }
            success++;
          }
          if (errMsg) {
            message.error(`${t('common.dataGrid.insertFailed')}: ${errMsg}`);
          } else {
            message.success(`${t('common.dataGrid.insertSuccess')} ${success} ${t('common.rows')}`);
            loadData();
            loadCount();
          }
        } catch (err) {
          message.error(`${t('common.dataGrid.insertFailed')}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setLoading(false);
        }
      },
    });
  }, [newRows, getVisibleColumns, tableName, dbType, connectionId, database, executeQuery, loadData, loadCount, t]);

  // ── Cancel New Rows ──
  const handleCancelNewRows = useCallback(() => {
    setRowData((prev) => prev.filter((r) => r.__status__ !== 'new'));
    message.info(t('common.newRowsCancelled'));
  }, [t]);

  // ── Delete ──
  const handleDeleteRows = useCallback(() => {
    if (selectedRows.length === 0) { message.warning(t('common.pleaseSelectRowsToDelete')); return; }
    const pkCol = columns.find((c) => c.column_key === 'PRI');
    if (!pkCol && selectedRows.some((r) => r.__status__ !== 'new')) { message.warning(t('common.tableHasNoPrimaryKeyCannotDelete')); return; }
    Modal.confirm({
      title: selectedRows.length > 1
        ? t('common.confirmDeleteSelectedRows', { count: selectedRows.length })
        : t('common.confirmDeleteSelectedRow'),
      content: t('common.dataGrid.deleteConfirm'),
      okType: 'danger',
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      zIndex: 2000,
      transitionName: '',
      maskTransitionName: '',
      centered: true,
      onOk: async () => {
        try {
          setLoading(true);
          let success = 0, errMsg = '';
          for (const row of selectedRows) {
            if (row.__status__ === 'new') { setRowData((prev) => prev.filter((r) => r.__row_id__ !== row.__row_id__)); success++; continue; }
            const sql = `DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(pkCol!.column_name, dbType)} = ${escapeSqlValue(row[pkCol!.column_name], dbType)}`;
            setCurrentSql(sql);
            const res = await executeQuery(connectionId, sql, database || '');
            if (res.error) { errMsg = res.error; break; }
            success++;
          }
          if (errMsg) message.error(`${t('common.dataGrid.deleteFailed')}: ${errMsg}`);
          else { message.success(`${t('common.dataGrid.deleteSuccess')} ${success} ${t('common.rows')}`); setSelectedRows([]); loadData(); loadCount(); }
        } catch (err) { message.error(`${t('common.dataGrid.deleteFailed')}: ${err instanceof Error ? err.message : String(err)}`); }
        finally { setLoading(false); }
      },
    });
  }, [selectedRows, columns, tableName, dbType, connectionId, database, executeQuery, loadData, loadCount, t]);

  // ── Selection ──
  const handleSelectionChange = useCallback((rows: GlideRow[], _selection: any) => {
    setSelectedRows(rows as unknown as RowData[]);
  }, []);

  // ── Context Menu ──
  const handleCellContextMenu = useCallback((col: number, row: number, bounds: { x: number; y: number }) => {
    if (row >= 0 && filteredRows[row]) {
      const clickedRow = filteredRows[row];
      const isInSelection = selectedRows.some((r) => r.__row_id__ === clickedRow.__row_id__);
      if (!isInSelection) {
        setSelectedRows([clickedRow]);
      }
    }
    const colId = getVisibleColumns()[col];
    openMenu(bounds.x, bounds.y, {
      row,
      col,
      cellValue: row >= 0 && colId ? filteredRows[row]?.[colId] : undefined,
      colName: colId,
      rowData: row >= 0 ? filteredRows[row] : undefined,
    });
  }, [filteredRows, selectedRows, getVisibleColumns, openMenu]);

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
    // queryColumns 可能为空（查询无数据时），用 columns 元数据兜底
    let cols = queryColumns.length > 0 ? queryColumns : columns.map((c) => c.column_name);
    if (columnOrder) { const s = new Set(columnOrder); cols = [...columnOrder.filter((n) => cols.includes(n)), ...cols.filter((n) => !s.has(n))]; }
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

  const handleGoToRow = useCallback(() => {
    const rowNum = parseInt(goToRowValue);
    if (isNaN(rowNum) || rowNum < 1 || rowNum > filteredRows.length) {
      message.warning(t('common.invalidRowNumber', { max: filteredRows.length }));
      return;
    }
    setScrollToRowIndex(rowNum - 1);
  }, [goToRowValue, filteredRows.length, t]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--background-card)' }}>
      {/* ═══ Toolbar ═══ */}
      <div style={{ padding: '1px 4px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--background-toolbar)', flexShrink: 0, minHeight: 22 }}>
        <Space size={2} split={<Divider type="vertical" style={{ height: 14, margin: '0 4px', background: 'var(--border-color)' }} />}>
          <Button icon={<PlusOutlined />} onClick={handleAddRow} type="primary" size="small" style={{ height: 20, padding: '0 6px', fontSize: 11 }}>{t('common.addRowLabel')}</Button>
          {newRows.length > 0 && (
            <>
              <Button type="primary" size="small" onClick={handleSaveNewRows} style={{ height: 20, padding: '0 6px', fontSize: 11 }}>
                {t('common.save')} ({newRows.length})
              </Button>
              <Button size="small" onClick={handleCancelNewRows} style={{ height: 20, padding: '0 6px', fontSize: 11 }}>
                {t('common.cancel')}
              </Button>
            </>
          )}
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
          <SqlInput value={whereClause} onChange={(val) => setWhereClause(val)} placeholder={t('common.dataGrid.filterPlaceholder')} size="small" style={{ flex: 1, height: 20, fontSize: 11 }}
            columns={columns.map((c) => ({ column_name: c.column_name, data_type: c.data_type }))}
            dbType={dbType}
            onPressEnter={() => { setCurrentPage(1); loadData(); }} />
          <Divider type="vertical" style={{ height: 14, margin: 0, background: 'var(--border-color)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{t('common.dataGrid.orderBy')}</span>
          <SqlInput value={orderByClause} onChange={(val) => setOrderByClause(val)} placeholder={t('common.dataGrid.orderBy') + ' ASC/DESC ...'} size="small" style={{ flex: 1, height: 20, fontSize: 11 }}
            columns={columns.map((c) => ({ column_name: c.column_name, data_type: c.data_type }))}
            dbType={dbType}
            onPressEnter={() => { setCurrentPage(1); loadData(); }} />
          <Button size="small" type="primary" onClick={() => { setCurrentPage(1); loadData(); }} style={{ fontSize: 10, height: 20 }}>{t('common.applyFilter')}</Button>
          <Button size="small" onClick={() => { setWhereClause(''); setOrderByClause(''); setCurrentPage(1); loadData(); }} style={{ fontSize: 10, height: 20 }}>{t('common.clearFilter')}</Button>
          <Divider type="vertical" style={{ height: 14, margin: '0 4px', background: 'var(--border-color)' }} />
          <Input size="small" placeholder={t('common.goToRow')} value={goToRowValue} onChange={(e) => setGoToRowValue(e.target.value)} onPressEnter={handleGoToRow} style={{ width: 56, fontSize: 11, textAlign: 'center', padding: '0 2px', height: 20 }} />
        </div>
      )}
      {/* ═══ Filter Panel（展开）═══ */}
      {showFilterPanel && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--background-toolbar)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{t('common.dataGrid.filterConditions')}</span>
            <div style={{ flex: 1 }} />
            <Button
              size="small"
              onClick={() => {
                const sql = buildWhereClause(filterConditions, dbType);
                Modal.info({
                  title: t('common.importExport.sqlPreview'),
                  transitionName: '',
                  maskTransitionName: '',
                  content: sql ? (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>WHERE {sql}</pre>
                  ) : (
                    t('common.noFilterConditions')
                  ),
                });
              }}
              style={{ fontSize: 11, height: 20 }}
            >
              {t('common.previewSql')}
            </Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {filterConditions.map((cond, idx) => {
              const prevCond = idx > 0 ? filterConditions[idx - 1] : null;
              const showLogic = idx > 0 && !cond.isGroupStart && !prevCond?.isGroupStart;
              return (
                <div
                  key={cond.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    paddingLeft: (cond.level ?? 0) * 16,
                  }}
                >
                  {cond.isGroupStart && (
                    <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--color-info)', marginRight: 4 }}>(</span>
                  )}
                  {showLogic && (
                    <Select
                      value={cond.logic}
                      onChange={(val) => updateFilterCondition(cond.id, { logic: val })}
                      size="small"
                      style={{ width: 64, fontSize: 11 }}
                      options={[
                        { label: 'AND', value: 'AND' },
                        { label: 'OR', value: 'OR' },
                      ]}
                    />
                  )}
                  {!showLogic && !cond.isGroupStart && !cond.isGroupEnd && <span style={{ width: 64 }} />}
                  {!cond.isGroupStart && !cond.isGroupEnd && (
                    <>
                      <Select
                        placeholder={t('common.fieldPlaceholder')}
                        value={cond.field || undefined}
                        onChange={(val) => updateFilterCondition(cond.id, { field: val })}
                        size="small"
                        style={{ minWidth: 140, fontSize: 11 }}
                        showSearch
                        filterOption={(input, option) =>
                          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={columns.map((col) => ({
                          label: col.column_name,
                          value: col.column_name,
                        }))}
                      />
                      <Select
                        value={cond.operator}
                        onChange={(val) => updateFilterCondition(cond.id, { operator: val })}
                        size="small"
                        style={{ width: 88, fontSize: 11 }}
                        options={[
                          { label: t('common.contains'), value: 'contains' },
                          { label: t('common.notContains'), value: 'notContains' },
                          { label: t('common.equals'), value: 'equals' },
                          { label: t('common.notEquals'), value: 'notEquals' },
                          { label: t('common.startsWith'), value: 'startsWith' },
                          { label: t('common.endsWith'), value: 'endsWith' },
                          { label: t('common.greaterThan'), value: 'greaterThan' },
                          { label: t('common.lessThan'), value: 'lessThan' },
                          { label: t('common.greaterOrEqual'), value: 'greaterOrEqual' },
                          { label: t('common.lessOrEqual'), value: 'lessOrEqual' },
                          { label: t('common.isNull'), value: 'isNull' },
                          { label: t('common.isNotNull'), value: 'isNotNull' },
                          { label: t('common.in'), value: 'in' },
                          { label: t('common.notIn'), value: 'notIn' },
                        ]}
                      />
                      {!['isNull', 'isNotNull'].includes(cond.operator) && (
                        <Input
                          placeholder={t('common.valuePlaceholder')}
                          value={cond.value}
                          onChange={(e) => updateFilterCondition(cond.id, { value: e.target.value })}
                          size="small"
                          style={{ flex: 1, fontSize: 11, height: 20, minWidth: 60 }}
                        />
                      )}
                      {['isNull', 'isNotNull'].includes(cond.operator) && (
                        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </>
                  )}
                  {cond.isGroupEnd && (
                    <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--color-info)', marginLeft: 4 }}>)</span>
                  )}
                  {!cond.isGroupEnd && (
                    <>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => {
                          const newConditions = [...filterConditions];
                          const insertIndex = idx + 1;
                          newConditions.splice(insertIndex, 0, {
                            id: `filter-${Date.now()}`,
                            field: '',
                            operator: 'contains',
                            value: '',
                            logic: 'AND',
                            level: cond.level ?? 0,
                          });
                          setFilterConditions(newConditions);
                        }}
                        style={{ fontSize: 10, padding: '0 2px', height: 16, color: 'var(--color-primary)' }}
                      >
                        +{t('common.addSibling')}
                      </Button>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => {
                          const newConditions = [...filterConditions];
                          const insertIndex = idx + 1;
                          const currentLevel = (cond.level ?? 0) + 1;
                          const ts = Date.now();
                          newConditions.splice(insertIndex, 0,
                            { id: `filter-${ts}-start`, field: '', operator: '', value: '', logic: 'AND', isGroupStart: true, level: cond.level ?? 0 },
                            { id: `filter-${ts}-a`, field: '', operator: 'contains', value: '', logic: 'AND', level: currentLevel },
                            { id: `filter-${ts}-b`, field: '', operator: 'contains', value: '', logic: 'AND', level: currentLevel },
                            { id: `filter-${ts}-end`, field: '', operator: '', value: '', logic: 'AND', isGroupEnd: true, level: cond.level ?? 0 }
                          );
                          setFilterConditions(newConditions);
                        }}
                        style={{ fontSize: 10, padding: '0 2px', height: 16, color: 'var(--color-info)' }}
                      >
                        +{t('common.addBracket')}
                      </Button>
                    </>
                  )}
                  <Button
                    type="text"
                    danger
                    size="small"
                    onClick={() => removeFilterCondition(cond.id)}
                    style={{ height: 20, padding: '0 4px', fontSize: 11 }}
                    icon={<DeleteOutlined />}
                    disabled={filterConditions.length === 1}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Button size="small" onClick={clearFilter} style={{ fontSize: 11, height: 20 }}>{t('common.clearLabel')}</Button>
            <Button type="primary" size="small" onClick={applyFilter} style={{ fontSize: 11, height: 20 }}>{t('common.applyLabel')}</Button>
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
        {hasLoaded && glideCols.length > 0 ? (
          <GlideDataTable columns={glideCols} rows={glideRows} hiddenColumns={hiddenColumns}
            rowStatus={tableRowStatus} isCellModified={tableCellModified}
            scrollToRowIndex={scrollToRowIndex}
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
            onCellContextMenu={handleCellContextMenu}
            headerHeight={36} rowHeight={24} editable={true}
          />
        ) : hasLoaded ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description={t('common.noTableStructure')} />
          </div>
        ) : null}
      </div>

      {/* ═══ Context Menu ═══ */}
      <DataTableContextMenu
        menuState={menuState}
        menuTarget={menuTarget}
        selectedRows={selectedRows}
        context={{
          dbType,
          tableName,
          columns,
          queryColumns: getVisibleColumns(),
          hiddenColumns,
          isEditable: true,
          onCopyToClipboard: (text) => navigator.clipboard.writeText(text),
          onSetWhereClause: (where) => { setWhereClause(where); setCurrentPage(1); loadData(); },
          onCellEdited: handleCellEdited,
          onPreviewCell: (value, colName, rowIndex, colIndex) => setCellPreview({ open: true, value, columnName: colName, rowIndex, colIndex }),
        }}
        onClose={closeMenu}
      />

      <CellPreviewDialog
        key={`${cellPreview.columnName}-${String(cellPreview.value ?? '').slice(0, 30)}`}
        open={cellPreview.open}
        onClose={() => setCellPreview({ open: false, value: null, columnName: '' })}
        value={cellPreview.value}
        columnName={cellPreview.columnName}
        onSave={(newVal) => {
          if (cellPreview.colIndex != null && cellPreview.rowIndex != null) {
            handleCellEdited(cellPreview.colIndex, cellPreview.rowIndex, newVal);
          }
        }}
      />

      {/* ═══ Status Bar ═══ */}
      <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--background-toolbar)', padding: '1px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, minHeight: 22 }}>
        <Space size={2}>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }}>{t('common.refreshLabel')}</Button>
          <Button icon={<ImportOutlined />} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }}>{t('common.import')}</Button>
        </Space>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          <code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontFamily: 'monospace', padding: '2px 6px', background: 'var(--background-toolbar)', borderRadius: 3, border: '1px solid var(--border-color)', maxWidth: 'none' }}>{currentSql}</code>
          <Tooltip title={t('common.copySql')}>
            <Button icon={<CopyOutlined />} type="text" onClick={copySql} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }} />
          </Tooltip>
        </div>
        <Space size={2} style={{ flexShrink: 0 }}>
          <Button size="small" disabled={currentPage === 1} onClick={() => setCurrentPage(1)} style={{ height: 20, padding: '0 8px', fontSize: 11, lineHeight: '18px' }} title={t('common.firstPage')}>«</Button>
          <Button size="small" disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)} style={{ height: 20, padding: '0 8px', fontSize: 11, lineHeight: '18px' }}>‹</Button>
          <Input size="small" value={pageInput} onChange={(e) => setPageInput(e.target.value)} onBlur={() => { const v = parseInt(pageInput); if (!isNaN(v) && v > 0 && v <= Math.ceil(totalCount / pageSize)) setCurrentPage(v); else setPageInput(String(currentPage)); }} onPressEnter={() => { const v = parseInt(pageInput); if (!isNaN(v) && v > 0 && v <= Math.ceil(totalCount / pageSize)) setCurrentPage(v); else setPageInput(String(currentPage)); }} style={{ width: 32, fontSize: 11, textAlign: 'center', padding: '0 2px', height: 20 }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', userSelect: 'none' }}>/ {Math.ceil(totalCount / pageSize) || 1}</span>
          <Button size="small" disabled={currentPage * pageSize >= totalCount} onClick={() => setCurrentPage(currentPage + 1)} style={{ height: 20, padding: '0 8px', fontSize: 11, lineHeight: '18px' }}>›</Button>
          <Button size="small" disabled={currentPage * pageSize >= totalCount} onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize))} style={{ height: 20, padding: '0 8px', fontSize: 11, lineHeight: '18px' }} title={t('common.lastPage')}>»</Button>
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

export default DataTable;
