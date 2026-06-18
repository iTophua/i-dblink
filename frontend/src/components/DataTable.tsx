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
  FilterOutlined, CopyOutlined,
  EyeInvisibleOutlined, SearchOutlined,
  ReloadOutlined, SaveOutlined, UndoOutlined,
  CloseOutlined, CodeOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../hooks/useApi';
import { useThemeColors } from '../hooks/useThemeColors';
import { useAppStore } from '../stores/appStore';
import type { ColumnInfo, DatabaseType } from '../types/api';
import { type RowData, buildQuery, buildCountQuery, DEFAULT_MARKER } from './DataTable/utils';
import { useEditHistory } from '../hooks/useEditHistory';
import { getDialect } from '../utils/sqlDialects';
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

interface PendingSqlItem {
  id: string;
  sql: string;
  type: 'update' | 'insert' | 'delete';
  source: string;
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

  const { record: recordEdit, undo: handleUndo, clear: clearEditHistory, removeByRowId: removeEditHistoryByRowId, hasHistory: hasEditHistory } = useEditHistory({
    onRestore: useCallback((cells: Array<{ rowId: string; colId: string; value: unknown }>) => {
      // 撤销时区分三种情况：
      // 1. colId === '__row__'    → 被删除的新增行重新插回 rowData
      // 2. colId === '__status__' → 恢复删除标记前的 status（已有行被标记删除时用）
      // 3. 普通 colId              → 把单元格值写回（普通编辑撤销）
      const rowRestores = new Map<string, RowData>();
      const statusRestores = new Map<string, string | undefined>();
      const cellRestores = new Map<string, Map<string, unknown>>();
      for (const c of cells) {
        if (c.colId === '__row__') {
          rowRestores.set(c.rowId, c.value as RowData);
        } else if (c.colId === '__status__') {
          statusRestores.set(c.rowId, c.value as string | undefined);
        } else {
          if (!cellRestores.has(c.rowId)) cellRestores.set(c.rowId, new Map());
          cellRestores.get(c.rowId)!.set(c.colId, c.value);
        }
      }
      setRowData((rows) => {
        let result = rows.map((r) => {
          if (!r.__row_id__) return r;
          if (statusRestores.has(r.__row_id__)) {
            return { ...r, __status__: statusRestores.get(r.__row_id__) as RowData['__status__'] };
          }
          const restores = cellRestores.get(r.__row_id__);
          if (!restores) return r;
          const updated = { ...r };
          for (const [col, oldVal] of restores) {
            updated[col] = oldVal;
          }
          // 判断该行所有被恢复的 cell 是否都等于原始值；若是且当前是 modified 则复位 status
          let allOriginal = true;
          for (const [col, oldVal] of restores) {
            const orig = updated.__original_data__?.[col];
            const cur = oldVal;
            const isSame = (orig == null && cur == null) || (orig != null && String(orig) === String(cur ?? ''));
            if (!isSame) { allOriginal = false; break; }
          }
          if (allOriginal && updated.__status__ === 'modified') updated.__status__ = undefined;
          return updated;
        });
        // 把被删除的新增行重新插回（保留原本的行数据）
        for (const [rowId, row] of rowRestores) {
          if (!result.find((r) => r.__row_id__ === rowId)) {
            result = [...result, row];
          }
        }
        return result;
      });
    }, []),
  });

  // rowDataRef 同步保存 rowData 最新值，供 applyEdit/applyBatchEdit 在
  // setRowData 之前同步读取旧值（避免在 setState updater 内做 side effect）。
  const rowDataRef = useRef(rowData);
  rowDataRef.current = rowData;

  // ── SQL Panel visibility ──
  const [showSqlPanel, setShowSqlPanel] = useState(false);
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
    const dialect = getDialect(dbType);
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

      const col = dialect.escapeIdentifier(cond.field);
      const val = cond.value;
      const escVal = () => dialect.escapeValue(val);
      const likeVal = (pattern: string, negate = false) => {
        const { condition, value: escaped } = dialect.buildLikeCondition(cond.field, pattern, negate);
        return condition.replace('?', dialect.escapeValue(escaped));
      };
      let clause = '';

      switch (cond.operator) {
        case 'contains':
          clause = likeVal(`%${val}%`);
          break;
        case 'notContains':
          clause = likeVal(`%${val}%`, true);
          break;
        case 'equals':
          clause = `${col} = ${escVal()}`;
          break;
        case 'notEquals':
          clause = `${col} != ${escVal()}`;
          break;
        case 'startsWith':
          clause = likeVal(`${val}%`);
          break;
        case 'endsWith':
          clause = likeVal(`%${val}`);
          break;
        case 'greaterThan':
          clause = `${col} > ${escVal()}`;
          break;
        case 'lessThan':
          clause = `${col} < ${escVal()}`;
          break;
        case 'greaterOrEqual':
          clause = `${col} >= ${escVal()}`;
          break;
        case 'lessOrEqual':
          clause = `${col} <= ${escVal()}`;
          break;
        case 'isNull':
          clause = `${col} IS NULL`;
          break;
        case 'isNotNull':
          clause = `${col} IS NOT NULL`;
          break;
        case 'in':
          clause = `${col} IN (${val.split(',').map((v) => dialect.escapeValue(v.trim())).join(', ')})`;
          break;
        case 'notIn':
          clause = `${col} NOT IN (${val.split(',').map((v) => dialect.escapeValue(v.trim())).join(', ')})`;
          break;
        default:
          clause = `${col} = ${escVal()}`;
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

  // ── Core edit: apply + record history (single cell, creates its own history entry) ──
  // 必须在 setRowData 之前用 rowDataRef 同步读取旧值，避免在 setState updater 内做 side effect。
  const applyEdit = useCallback((rowId: string, colId: string, newValue: unknown) => {
    const prev = rowDataRef.current;
    const target = prev.find((r) => r.__row_id__ === rowId);
    if (!target) return;
    if (target.__status__ === 'deleted') return;
    const capturedOld = target[colId];
    setRowData((rows) => rows.map((r) => {
      if (r.__row_id__ !== rowId) return r;
      return { ...r, [colId]: newValue, __status__: r.__status__ === 'new' ? 'new' : 'modified' };
    }));
    recordEdit([{ rowId, colId, oldValue: capturedOld, newValue }]);
  }, [recordEdit]);

  // ── Batch edit: apply multiple cells as one atomic history entry ──
  // 同样用 rowDataRef 同步读取旧值；不在 setState updater 内 push cells 数组。
  // 用 Map 索引避免 O(n×m) 的嵌套查找（paste/范围填充可能传入大量 edits）。
  const applyBatchEdit = useCallback((edits: ReadonlyArray<{ rowId: string; colId: string; value: unknown }>) => {
    if (edits.length === 0) return;
    const prev = rowDataRef.current;
    const prevByRowId = new Map<string, RowData>();
    for (const r of prev) {
      const rid = r.__row_id__;
      if (rid) prevByRowId.set(rid, r);
    }
    const editsByRow = new Map<string, Array<{ colId: string; oldValue: unknown; newValue: unknown }>>();
    for (const e of edits) {
      const target = prevByRowId.get(e.rowId);
      if (!target) continue;
      if (target.__status__ === 'deleted') continue;
      const oldValue = target[e.colId];
      if (!editsByRow.has(e.rowId)) editsByRow.set(e.rowId, []);
      editsByRow.get(e.rowId)!.push({ colId: e.colId, oldValue, newValue: e.value });
    }
    if (editsByRow.size === 0) return;
    setRowData((rows) => rows.map((r) => {
      const rid = r.__row_id__;
      if (!rid) return r;
      const rowEdits = editsByRow.get(rid);
      if (!rowEdits || rowEdits.length === 0) return r;
      if (r.__status__ === 'deleted') return r;
      const updated = { ...r };
      for (const e of rowEdits) {
        updated[e.colId] = e.newValue;
      }
      updated.__status__ = r.__status__ === 'new' ? 'new' : 'modified';
      return updated;
    }));
    const historyCells: Array<{ rowId: string; colId: string; oldValue: unknown; newValue: unknown }> = [];
    for (const [rowId, rowEdits] of editsByRow) {
      for (const e of rowEdits) {
        historyCells.push({ rowId, colId: e.colId, oldValue: e.oldValue, newValue: e.newValue });
      }
    }
    if (historyCells.length > 0) recordEdit(historyCells);
  }, [recordEdit]);

  // ── Edit (inline) ──
  const handleCellEdited = useCallback((col: number, row: number, newValue: string) => {
    const visibleCols = getVisibleColumns();
    const colId = visibleCols[col];
    if (!colId) return;

    const glideRow = filteredRows[row];
    if (!glideRow) return;
    const targetRowId = glideRow.__row_id__ as string | undefined;
    if (!targetRowId) return;

    let resolvedValue: unknown;
    if (newValue === 'NULL') resolvedValue = null;
    else if (newValue === 'DEFAULT') resolvedValue = DEFAULT_MARKER;
    else resolvedValue = newValue;
    applyEdit(targetRowId, colId, resolvedValue);
  }, [getVisibleColumns, filteredRows, applyEdit]);

  // ── Edit (range) ──
  const handleCellsEdited = useCallback((edits: Array<{ col: number; row: number; value: string }>) => {
    const batch: Array<{ rowId: string; colId: string; value: unknown }> = [];
    for (const edit of edits) {
      const colId = getVisibleColumns()[edit.col];
      if (!colId) continue;
      const glideRow = filteredRows[edit.row];
      if (!glideRow) continue;
      const targetRowId = glideRow.__row_id__ as string | undefined;
      if (!targetRowId) continue;
      let resolved: unknown;
      if (edit.value === 'NULL') resolved = null;
      else if (edit.value === 'DEFAULT') resolved = DEFAULT_MARKER;
      else resolved = edit.value;
      batch.push({ rowId: targetRowId, colId, value: resolved });
    }
    if (batch.length > 0) applyBatchEdit(batch);
  }, [getVisibleColumns, filteredRows, applyBatchEdit]);

  // ── Paste (Ctrl+V) ──
  const handlePaste = useCallback((target: readonly [number, number], values: readonly (readonly string[])[]): boolean => {
    const visibleCols = getVisibleColumns();
    const batch: Array<{ rowId: string; colId: string; value: unknown }> = [];
    for (let r = 0; r < values.length; r++) {
      const rowIndex = target[1] + r;
      const glideRow = filteredRows[rowIndex];
      if (!glideRow) continue;
      const targetRowId = glideRow.__row_id__ as string | undefined;
      if (!targetRowId) continue;
      for (let c = 0; c < values[r].length; c++) {
        const colIndex = target[0] + c;
        const colId = visibleCols[colIndex];
        if (!colId) continue;
        let resolved: unknown;
        if (values[r][c] === 'NULL') resolved = null;
        else if (values[r][c] === 'DEFAULT') resolved = DEFAULT_MARKER;
        else resolved = values[r][c];
        batch.push({ rowId: targetRowId, colId, value: resolved });
      }
    }
    if (batch.length > 0) applyBatchEdit(batch);
    return true;
  }, [getVisibleColumns, filteredRows, applyBatchEdit]);

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

  // ── New rows ──
  const newRows = useMemo(() => rowData.filter((r) => r.__status__ === 'new'), [rowData]);
  const modifiedRows = useMemo(() => rowData.filter((r) => r.__status__ === 'modified'), [rowData]);
  const deletedRows = useMemo(() => rowData.filter((r) => r.__status__ === 'deleted'), [rowData]);
  const hasChanges = newRows.length > 0 || modifiedRows.length > 0 || deletedRows.length > 0;

  useEffect(() => {
    if (hasChanges) setShowSqlPanel(true);
  }, [hasChanges]);

  // ── Delete ──
  // 标记已有行为 'deleted' 或移除新增行，同时记录撤销历史：
  // - 新增行：记录 '__row__' → 完整行数据，撤销时重新插回
  // - 已有行：记录 '__status__' → 原 status，撤销时恢复
  const handleDeleteRows = useCallback(() => {
    if (selectedRows.length === 0) { message.warning(t('common.pleaseSelectRowsToDelete')); return; }
    const selIds = new Set(selectedRows.map((r) => r.__row_id__));
    const prev = rowDataRef.current;
    const historyCells: Array<{ rowId: string; colId: string; oldValue: unknown; newValue: unknown }> = [];
    for (const r of prev) {
      const rid = r.__row_id__;
      if (!rid || !selIds.has(rid)) continue;
      if (r.__status__ === 'new') {
        historyCells.push({ rowId: rid, colId: '__row__', oldValue: { ...r }, newValue: null });
      } else {
        historyCells.push({ rowId: rid, colId: '__status__', oldValue: r.__status__, newValue: 'deleted' });
      }
    }
    setRowData((rows) => {
      return rows
        .map((r) => {
          if (!selIds.has(r.__row_id__)) return r;
          if (r.__status__ === 'new') return r;
          return { ...r, __status__: 'deleted' as const };
        })
        .filter((r) => !(selIds.has(r.__row_id__) && r.__status__ === 'new'));
    });
    if (historyCells.length > 0) recordEdit(historyCells);
    setSelectedRows([]);
  }, [selectedRows, t, recordEdit]);

  // ── Generate pending SQL from rowData state ──
  const pendingSqls = useMemo(() => {
    const items: PendingSqlItem[] = [];
    const pkCol = columns.find((c) => c.column_key === 'PRI');
    const dialect = getDialect(dbType);
    const tableRef = dialect.buildTableRef(tableName, database);
    const visibleCols = queryColumns;

    for (const row of newRows) {
      const cols = visibleCols.filter((c) => row[c] !== null && row[c] !== undefined);
      if (cols.length === 0) continue;
      const vals = [cols.map((c) => row[c])];
      const sqls = dialect.buildInsert(tableRef, cols, vals);
      if (sqls.length > 0) items.push({ id: `ins-${row.__row_id__}`, sql: sqls[0] + ';', type: 'insert', source: row.__row_id__ || '' });
    }

    for (const row of modifiedRows) {
      if (!pkCol) continue;
      const setters: Record<string, unknown> = {};
      for (const c of visibleCols) {
        const orig = row.__original_data__?.[c];
        const cur = row[c];
        const isSame = (orig == null && cur == null) || (orig != null && String(orig) === String(cur ?? ''));
        if (!isSame) setters[c] = cur;
      }
      if (Object.keys(setters).length === 0) continue;
      const where = `${dialect.escapeIdentifier(pkCol.column_name)} = ${dialect.escapeValue(row[pkCol.column_name])}`;
      items.push({ id: `upd-${row.__row_id__}`, sql: dialect.buildUpdate(tableRef, setters, where) + ';', type: 'update', source: row.__row_id__ || '' });
    }

    for (const row of deletedRows) {
      if (!pkCol) continue;
      const where = `${dialect.escapeIdentifier(pkCol.column_name)} = ${dialect.escapeValue(row[pkCol.column_name])}`;
      items.push({ id: `del-${row.__row_id__}`, sql: dialect.buildDelete(tableRef, where) + ';', type: 'delete', source: row.__row_id__ || '' });
    }

    return items;
  }, [newRows, modifiedRows, deletedRows, columns, queryColumns, tableName, dbType, database]);

  // 无主键时 modified/deleted 行无法生成 SQL，单独提示避免用户困惑
  const noPkWarning = useMemo(() => {
    const hasPk = columns.some((c) => c.column_key === 'PRI');
    return !hasPk && (modifiedRows.length > 0 || deletedRows.length > 0);
  }, [columns, modifiedRows, deletedRows]);

  // ── Remove single pending SQL (revert that row's changes) ──
  // 只移除该行相关的历史条目（保留其他行的撤销栈），不调用 clearEditHistory。
  const handleRemovePendingSql = useCallback((sqlId: string) => {
    const item = pendingSqls.find((s) => s.id === sqlId);
    if (!item) return;
    if (item.type === 'insert') {
      setRowData((prev) => prev.filter((r) => r.__row_id__ !== item.source));
      removeEditHistoryByRowId(item.source);
    } else if (item.type === 'update') {
      setRowData((prev) => prev.map((r) => {
        if (r.__row_id__ !== item.source) return r;
        const restored = { ...r, ...r.__original_data__, __status__: undefined };
        return restored;
      }));
      removeEditHistoryByRowId(item.source);
    } else if (item.type === 'delete') {
      setRowData((prev) => prev.map((r) => {
        if (r.__row_id__ !== item.source) return r;
        return { ...r, __status__: undefined };
      }));
      removeEditHistoryByRowId(item.source);
    }
  }, [pendingSqls, removeEditHistoryByRowId]);

  // ── Commit all ──
  // 按顺序执行 pending SQL。成功/失败都 await loadData 把数据库真实状态同步回 UI，
  // 避免中途失败时 pendingSqls 残留导致用户重试时重复提交已落库的 SQL。
  // 含 DELETE 时弹二次确认（防止误按 Cmd+S 删数据）。
  const committingRef = useRef(false);
  const handleCommit = useCallback(async () => {
    if (committingRef.current) return;  // 防止 Cmd+S 或快速点击重复触发
    if (pendingSqls.length === 0) return;
    if (!columns.find((c) => c.column_key === 'PRI') && (modifiedRows.length > 0 || deletedRows.length > 0)) {
      message.warning(t('common.dataGrid.noPrimaryKeyWarning'));
      return;
    }

    // 含 DELETE 类操作时要求二次确认
    const hasDestructive = pendingSqls.some((p) => p.type === 'delete');
    if (hasDestructive) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: t('common.confirmSubmit'),
          content: t('common.dataGrid.deleteConfirm'),
          okText: t('common.confirm'),
          cancelText: t('common.cancel'),
          okType: 'danger',
          zIndex: 2000,
          transitionName: '',
          maskTransitionName: '',
          centered: true,
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }

    committingRef.current = true;
    setLoading(true);
    let errMsg = '';
    const succeededSources = new Set<string>();
    try {
      for (const item of pendingSqls) {
        setCurrentSql(item.sql);
        const res = await executeQuery(connectionId, item.sql, database || '');
        if (res.error) {
          errMsg = `${item.sql}\n→ ${res.error}`;
          break;
        }
        if (item.source) succeededSources.add(item.source);
      }

      if (errMsg) {
        message.error(`${t('common.dataGrid.updateFailed')}: ${errMsg}`);
      } else {
        message.success(`${t('common.dataGrid.updateSuccess')} ${pendingSqls.length} ${t('common.rows')}`);
      }

      // 已落库的行不可再撤销
      for (const id of succeededSources) removeEditHistoryByRowId(id);
      if (errMsg) {
        // 部分成功：保留剩余 pending 的撤销历史；clearEditHistory 只在全部成功时调用
      } else {
        clearEditHistory();
      }

      // 无论成功失败都 await loadData：成功则刷新，失败则把已落库的变更同步回来，
      // 避免 pendingSqls 残留导致重试时重复执行。
      await loadData();
      await loadCount();
    } catch (err) {
      message.error(`${t('common.dataGrid.updateFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      committingRef.current = false;
      setLoading(false);
    }
  }, [pendingSqls, modifiedRows, deletedRows, columns, connectionId, database, executeQuery, loadData, loadCount, t, clearEditHistory, removeEditHistoryByRowId]);

  // ── Cmd+S / Ctrl+S commit ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (pendingSqls.length > 0) handleCommit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCommit, pendingSqls]);

  // ── Undo all ──
  const handleUndoAll = useCallback(() => {
    Modal.confirm({
      title: t('common.undoModifications'),
      content: t('common.dataGrid.undoAllConfirm'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      zIndex: 2000,
      transitionName: '',
      maskTransitionName: '',
      centered: true,
      onOk: () => {
        setRowData((prev) => prev
          .filter((r) => r.__status__ !== 'new')
          .map((r): RowData => {
            if (r.__status__ === 'modified') return { ...r, ...r.__original_data__, __status__: undefined };
            if (r.__status__ === 'deleted') return { ...r, __status__: undefined };
            return r;
          }));
        clearEditHistory();
        message.info(t('common.allChangesRevoked'));
      },
    });
  }, [t]);

  // ── Selection ──
  const handleSelectionChange = useCallback((rows: GlideRow[], _selection: any) => {
    setSelectedRows(rows as unknown as RowData[]);
    if (menuState.visible) closeMenu();
  }, [menuState.visible, closeMenu]);

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

  // ── Header Context Menu (hide column) ──
  const handleHeaderContextMenu = useCallback((colIndex: number, bounds: { x: number; y: number }) => {
    const colId = getVisibleColumns()[colIndex];
    if (!colId) return;
    openMenu(bounds.x, bounds.y, {
      col: colIndex,
      row: -1,
      colName: colId,
    });
  }, [getVisibleColumns, openMenu]);

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
          <Button icon={<DeleteOutlined />} onClick={handleDeleteRows} disabled={selectedRows.length === 0} danger size="small" style={{ height: 20, padding: '0 6px', fontSize: 11 }}>{t('common.delete')}</Button>
          {hasChanges && (
            <>
              <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleCommit} loading={loading} style={{ height: 20, padding: '0 6px', fontSize: 11 }}>
                {t('common.submit')} ({pendingSqls.length})
              </Button>
              <Tooltip title={t('common.dataGrid.undoStep')}>
                <Button size="small" icon={<UndoOutlined />} onClick={handleUndo} disabled={!hasEditHistory} style={{ height: 20, padding: '0 6px', fontSize: 11 }}>
                  {t('common.undo')}
                </Button>
              </Tooltip>
              <Tooltip title={t('common.dataGrid.undoAllTip')}>
                <Button size="small" danger icon={<CloseOutlined />} onClick={handleUndoAll} style={{ height: 20, padding: '0 6px', fontSize: 11 }}>
                  {t('common.undoAll')}
                </Button>
              </Tooltip>
            </>
          )}
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
          <Tag style={{ margin: 0, lineHeight: '14px', fontSize: 10, height: 16, background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>{tableName}</Tag>
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
            onPaste={handlePaste}
            onHeaderContextMenu={handleHeaderContextMenu}
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
          database,
          columns,
          queryColumns: getVisibleColumns(),
          hiddenColumns,
          isEditable: true,
          onCopyToClipboard: (text) => navigator.clipboard.writeText(text),
          onSetWhereClause: (where) => { setWhereClause(where); setCurrentPage(1); loadData(); },
          onHideColumn: (colName) => setHiddenColumns((prev) => new Set([...prev, colName])),
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

      {/* ═══ SQL Preview Panel ═══ */}
      {hasChanges && showSqlPanel && (
        <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--background-card)', flexShrink: 0, maxHeight: 160, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-color)', background: 'var(--background-toolbar)' }}>
            <CodeOutlined style={{ fontSize: 11, color: 'var(--color-primary)' }} />
            <span style={{ fontSize: 11, fontWeight: 500 }}>{t('common.dataGrid.pendingSql')} ({pendingSqls.length})</span>
            <div style={{ flex: 1 }} />
            <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setShowSqlPanel(false)} style={{ height: 18, width: 18, fontSize: 10 }} />
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px' }}>
            {pendingSqls.map((item, idx) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 0', borderBottom: idx < pendingSqls.length - 1 ? '1px solid var(--border-color)' : undefined }}>
                <Tag color={item.type === 'insert' ? 'green' : item.type === 'delete' ? 'red' : 'blue'} style={{ margin: 0, fontSize: 9, lineHeight: '14px', height: 16, minWidth: 20, textAlign: 'center', flexShrink: 0 }}>
                  {item.type === 'insert' ? 'INS' : item.type === 'delete' ? 'DEL' : 'UPD'}
                </Tag>
                <code style={{ flex: 1, fontSize: 10, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>{item.sql}</code>
                <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={() => handleRemovePendingSql(item.id)} style={{ height: 16, width: 16, fontSize: 9, flexShrink: 0 }} />
              </div>
            ))}
            {pendingSqls.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: 8 }}>{t('common.dataGrid.noPendingSql')}</div>
            )}
            {noPkWarning && (
              <div style={{ fontSize: 11, color: 'var(--color-warning, #faad14)', textAlign: 'center', padding: '4px 8px', borderTop: '1px solid var(--border-color)' }}>
                {t('common.dataGrid.noPrimaryKeyWarning')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Status Bar ═══ */}
      <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--background-toolbar)', padding: '1px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, minHeight: 22 }}>
        <Space size={2}>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} size="small" style={{ height: 20, padding: '0 4px', fontSize: 11 }}>{t('common.refreshLabel')}</Button>
          {hasChanges && (
            <Tooltip title={t('common.dataGrid.pendingSql')}>
              <Button icon={<CodeOutlined />} size="small" type={showSqlPanel ? 'primary' : 'default'} onClick={() => setShowSqlPanel(!showSqlPanel)} style={{ height: 20, padding: '0 4px', fontSize: 11 }} />
            </Tooltip>
          )}
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
          <AutoComplete value={String(pageSize)} onChange={(val) => { const n = parseInt(val); if (n > 0 && n <= 10000) { setPageSizeState(n); setCurrentPage(1); } else if (n > 10000) { setPageSizeState(10000); setCurrentPage(1); } }}
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
