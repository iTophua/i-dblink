/**
 * DataTable — 表数据浏览组件（Glide Data Grid 版）
 *
 * 完整功能：拖拽选择、内联编辑、范围编辑、右键菜单、筛选、
 * 列拖动、列可见性、导出、快速筛选、ENUM/Date 编辑器。
 */
import { useEffect, useState, useMemo, useRef, useCallback, memo } from 'react';
import {
  Button,
  Space,
  App,
  Tag,
  Select,
  Tooltip,
  Input,
  Checkbox,
  Popover,
  Dropdown,
  AutoComplete,
} from 'antd';
import {
  DownloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  FilterOutlined,
  CopyOutlined,
  EyeInvisibleOutlined,
  ReloadOutlined,
  SaveOutlined,
  UndoOutlined,
  CloseOutlined,
  CodeOutlined,
  TableOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../hooks/useApi';
import { useAppStore } from '../stores/appStore';
import type { ColumnInfo } from '../types/api';
import {
  type RowData,
  type FilterCondition,
  buildQuery,
  buildCountQuery,
  buildWhereClause,
  OPERATOR_OPTIONS,
  NO_VALUE_OPERATORS,
  RANGE_OPERATORS,
  DEFAULT_MARKER,
  isSameEditValue,
} from './DataTable/utils';
import { useEditHistory } from '../hooks/useEditHistory';
import { getDialect } from '../utils/sqlDialects';
import { exportToExcel } from '../utils/exportUtils';
import { GlideDataTable, type GlideRow } from './DataTable/GlideDataTable';
import {
  rowsToGlideRows,
  tableRowStatus,
  tableCellModified,
} from './DataTable/adapters/tableAdapter';
import { useContextMenu } from './ContextMenu';
import { DataTableContextMenu } from './DataTable/DataTableContextMenu';
import { CellPreviewDialog } from './DataTable/CellPreviewDialog';
import { SqlInput } from './SqlInput';
import { EnhancedEmptyState, TableDataSkeleton } from './LoadingStates';
import { appModal } from '../utils/appModal';
import { getErrorMessage } from '../utils/getErrorMessage';

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

interface SortCondition {
  id: string;
  field: string;
  direction: 'ASC' | 'DESC';
}

const SQL_KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'ORDER',
  'BY',
  'GROUP',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'AND',
  'OR',
  'NOT',
  'NULL',
  'IS',
  'IN',
  'LIKE',
  'ASC',
  'DESC',
  'AS',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'ON',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'DISTINCT',
]);

// 匹配顺序：字符串 > 标识符 > 数字 > 关键字。用 split 保留分隔出的 token。
const SQL_TOKEN_RE =
  /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`|\b\d+(?:\.\d+)?\b|\b(?:SELECT|FROM|WHERE|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|AND|OR|NOT|NULL|IS|IN|LIKE|ASC|DESC|AS|JOIN|LEFT|RIGHT|INNER|OUTER|ON|COUNT|SUM|AVG|MIN|MAX|DISTINCT)\b)/gi;

/** 按数据类型给出更合理的默认列宽（用户拖拽后的宽度优先） */
function defaultColumnWidth(dataType?: string): number {
  const t = (dataType || '').toLowerCase();
  if (/(date|time|timestamp|year)/.test(t)) return 168;
  if (/^(tinyint|smallint|mediumint|int|integer|bigint|serial)/.test(t)) return 150;
  if (/(decimal|numeric|number|float|double|real|money)/.test(t)) return 110;
  if (/(text|json|jsonb|blob|clob)/.test(t)) return 200;
  if (/(char|varchar|string|enum|set|uuid)/.test(t)) return 164;
  return 130;
}

/** SQL 着色文本：关键字/字符串/数字/标识符分别取主题色，深浅色自动适配 */
const SqlText = memo(function SqlText({ sql }: { sql: string }) {
  if (!sql) return null;
  const parts = sql.split(SQL_TOKEN_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        let cls = 'sql-token-plain';
        if (part.startsWith("'") || part.startsWith('"')) cls = 'sql-token-string';
        else if (part.startsWith('`')) cls = 'sql-token-ident';
        else if (/^\d/.test(part)) cls = 'sql-token-number';
        else if (SQL_KEYWORDS.has(part.toUpperCase())) cls = 'sql-token-keyword';
        return (
          <span key={i} className={cls}>
            {part}
          </span>
        );
      })}
    </>
  );
});

export const DataTable = memo(function DataTable({
  connectionId,
  tableName,
  database,
  pageSize: propPageSize,
  onDirtyChange,
}: DataTableProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const dbType = useAppStore((s) => s.connections.find((c) => c.id === connectionId)?.db_type);
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
  const [pageInput, setPageInput] = useState('1');
  const [goToRowValue, setGoToRowValue] = useState('');
  const [whereClause, setWhereClause] = useState('');
  const [orderByClause, setOrderByClause] = useState('');
  const [showColVisibility, setShowColVisibility] = useState(false);
  const [findVisible, setFindVisible] = useState(false);
  const [currentSql, setCurrentSql] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { menuState, menuTarget, openMenu, closeMenu } = useContextMenu();
  const [cellPreview, setCellPreview] = useState<{
    open: boolean;
    value: unknown;
    columnName: string;
    rowIndex?: number;
    colIndex?: number;
  }>({ open: false, value: null, columnName: '' });

  const {
    record: recordEdit,
    undo: handleUndo,
    clear: clearEditHistory,
    removeByRowId: removeEditHistoryByRowId,
    hasHistory: hasEditHistory,
  } = useEditHistory({
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
            const isSame =
              (orig == null && cur == null) || (orig != null && String(orig) === String(cur ?? ''));
            if (!isSame) {
              allOriginal = false;
              break;
            }
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
  // enabled !== false 的条件才参与 WHERE 拼接（面板勾选框控制，取消勾选保留配置）
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([
    { id: 'filter-1', field: '', operator: 'equals', value: '', logic: 'AND', enabled: true },
  ]);
  // 排序条件构建器（筛选面板右侧），生成 ORDER BY 子句
  const [sortConditions, setSortConditions] = useState<SortCondition[]>([]);
  const loadDataRef = useRef<
    ((opts?: { page?: number; where?: string; orderBy?: string }) => Promise<void>) | undefined
  >(undefined);
  const buildSortClause = useCallback(
    (sorts: SortCondition[]) => {
      const dialect = getDialect(dbType);
      return sorts
        .filter((s) => s.field)
        .map((s) => `${dialect.escapeIdentifier(s.field)} ${s.direction}`)
        .join(', ');
    },
    [dbType]
  );
  const resetFilters = useCallback(() => {
    setFilterConditions([
      {
        id: `filter-${Date.now()}`,
        field: '',
        operator: 'equals',
        value: '',
        logic: 'AND',
        enabled: true,
      },
    ]);
    setSortConditions([]);
    setWhereClause('');
    setOrderByClause('');
    setCurrentPage(1);
    loadDataRef.current?.({ where: '', orderBy: '', page: 1 });
  }, []);
  // 条件构建器与快捷输入互通：面板里配置了条件/排序就用生成的子句，
  // 没配置的那一半沿用顶部快捷输入（WHERE / ORDER BY 可来自任意一边）
  const panelWhere = buildWhereClause(filterConditions, dbType);
  const panelOrderBy = buildSortClause(sortConditions);
  const hasPanelConditions = filterConditions.some((c) => !!c.field);
  const hasPanelSorts = sortConditions.some((s) => !!s.field);
  const effectiveWhere = hasPanelConditions ? panelWhere : whereClause;
  const effectiveOrderBy = hasPanelSorts ? panelOrderBy : orderByClause;
  const applyFilter = useCallback(() => {
    setWhereClause(effectiveWhere);
    setOrderByClause(effectiveOrderBy);
    setCurrentPage(1);
    setShowFilterPanel(false);
    loadDataRef.current?.({ where: effectiveWhere, orderBy: effectiveOrderBy, page: 1 });
  }, [effectiveWhere, effectiveOrderBy]);
  const applyWhereInput = useCallback(() => {
    setCurrentPage(1);
    loadDataRef.current?.({ where: whereClause, orderBy: orderByClause, page: 1 });
  }, [whereClause, orderByClause]);
  // 筛选面板底部的实时 SQL（条件/排序变更即时反映，可直接复制）
  const liveFilterSql = useMemo(() => {
    const lines: string[] = [];
    if (effectiveWhere) lines.push(`WHERE ${effectiveWhere}`);
    if (effectiveOrderBy) lines.push(`ORDER BY ${effectiveOrderBy}`);
    return lines.join('\n');
  }, [effectiveWhere, effectiveOrderBy]);
  const copyFilterSql = useCallback(() => {
    if (!liveFilterSql) return;
    navigator.clipboard.writeText(liveFilterSql);
    message.success(t('common.sqlCopied'));
  }, [liveFilterSql, t]);
  const addSortCondition = useCallback(() => {
    setSortConditions((prev) => [
      ...prev,
      { id: `sort-${Date.now()}`, field: '', direction: 'ASC' },
    ]);
  }, []);
  const updateSortCondition = useCallback((id: string, updates: Partial<SortCondition>) => {
    setSortConditions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);
  const removeSortCondition = useCallback((id: string) => {
    setSortConditions((prev) => prev.filter((s) => s.id !== id));
  }, []);
  const moveSortCondition = useCallback((id: string, offset: number) => {
    setSortConditions((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const target = idx + offset;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);
  const updateFilterCondition = useCallback((id: string, updates: Partial<FilterCondition>) => {
    setFilterConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);
  // 在指定条件后插入「同级条件」或「条件组（括号）」
  const insertSiblingCondition = useCallback((idx: number, cond: FilterCondition) => {
    setFilterConditions((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, {
        id: `filter-${Date.now()}`,
        field: '',
        operator: 'equals',
        value: '',
        logic: 'AND',
        enabled: true,
        level: cond.level ?? 0,
      });
      return next;
    });
  }, []);
  const insertGroupCondition = useCallback((idx: number, cond: FilterCondition) => {
    setFilterConditions((prev) => {
      const next = [...prev];
      const currentLevel = (cond.level ?? 0) + 1;
      const ts = Date.now();
      next.splice(
        idx + 1,
        0,
        {
          id: `filter-${ts}-start`,
          field: '',
          operator: '',
          value: '',
          logic: 'AND',
          enabled: true,
          isGroupStart: true,
          level: cond.level ?? 0,
        },
        {
          id: `filter-${ts}-a`,
          field: '',
          operator: 'equals',
          value: '',
          logic: 'AND',
          enabled: true,
          level: currentLevel,
        },
        {
          id: `filter-${ts}-b`,
          field: '',
          operator: 'equals',
          value: '',
          logic: 'AND',
          enabled: true,
          level: currentLevel,
        },
        {
          id: `filter-${ts}-end`,
          field: '',
          operator: '',
          value: '',
          logic: 'AND',
          enabled: true,
          isGroupEnd: true,
          level: cond.level ?? 0,
        }
      );
      return next;
    });
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
        const endIdx = newConditions.findIndex(
          (c) => c.isGroupEnd && (c.level ?? 0) === (prev[idx].level ?? 0)
        );
        if (endIdx >= 0) newConditions.splice(endIdx, 1);
      }
      // If removing a group end, also remove its corresponding start
      if (prev[idx]?.isGroupEnd) {
        const startIdx = newConditions.findIndex(
          (c) => c.isGroupStart && (c.level ?? 0) === (prev[idx].level ?? 0)
        );
        if (startIdx >= 0) newConditions.splice(startIdx, 1);
      }
      return newConditions;
    });
  }, []);
  // ── Refs ──
  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Cmd+F 打开页内查找/替换条：焦点不在网格里（例如刚点过筛选输入框）时也能触发。
  // 用 offsetParent 判断当前 DataTable 是否可见，避免非激活 Tab 同时响应。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'f') return;
      if (!rootRef.current || rootRef.current.offsetParent === null) return;
      e.preventDefault();
      setFindVisible(true);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Data Loading ──
  // opts 允许调用方（applyFilter 等）在同一事件内显式传入新值，
  // 绕开 setState 后闭包仍捕获旧 whereClause/page 的时序问题
  const loadData = useCallback(
    async (opts?: { page?: number; where?: string; orderBy?: string }) => {
      if (!connectionId || !tableName) return;
      // 新请求抢占旧请求：翻页/筛选/刷新若被 loading 锁直接丢弃，会出现
      // 「页码变了但数据没变」或「筛选条件没生效」，这里先中断旧请求再发新请求
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      loadingRef.current = true;
      const requestId = ++reqIdRef.current;
      try {
        setLoading(true);
        // 新请求开始即清掉上一次的错误态，避免重试时旧错误一直压在网格上
        setLoadError(null);
        setFindVisible(false);
        const query = buildQuery(
          opts?.page ?? currentPage,
          pageSize,
          tableName,
          database,
          dbType,
          undefined,
          opts?.where ?? whereClause,
          opts?.orderBy ?? orderByClause,
          undefined,
          undefined
        );
        setCurrentSql(query);
        // useTransaction:false —— 表数据浏览读的是已提交数据，绝不能被
        // 别处（如查询 Tab 的手动事务）的活跃事务捕获后随其回滚
        const [colResult, dataResult] = await Promise.all([
          getColumns(connectionId, tableName, database),
          executeQuery(connectionId, query, database || '', undefined, { useTransaction: false }),
        ]);
        if (abortRef.current.signal.aborted || requestId !== reqIdRef.current) return;
        if (dataResult.error) {
          // 错误不再只弹 toast：网格区会显示内联错误态 + 重试，
          // 避免加载失败后只剩一片空白被误认为「没有数据」
          setLoadError(dataResult.error);
          setHasLoaded(true);
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
          setLoadError(null);
          setHasLoaded(true);
        }
      } catch (err: unknown) {
        if (requestId !== reqIdRef.current) return;
        setLoadError(getErrorMessage(err));
        setHasLoaded(true);
      } finally {
        if (requestId === reqIdRef.current) {
          setLoading(false);
          loadingRef.current = false;
          abortRef.current = null;
        }
      }
    },
    [
      connectionId,
      tableName,
      database,
      currentPage,
      pageSize,
      dbType,
      whereClause,
      orderByClause,
      getColumns,
      executeQuery,
    ]
  );

  // Assign loadData to ref for use in callbacks declared before it
  loadDataRef.current = loadData;

  const loadCount = useCallback(async () => {
    if (!connectionId || !tableName) return;
    const q = buildCountQuery(tableName, database, dbType, '');
    const r = await executeQuery(connectionId, q, database || '', undefined, {
      useTransaction: false,
    });
    if (!r.error && r.rows.length > 0) setTotalCount(Number(r.rows[0][0]));
  }, [connectionId, tableName, database, dbType, executeQuery]);

  // 切表/切库/翻页共用同一个加载入口：scope 变化时先把页码复位到 1，
  // 由下一次 effect 触发加载。此前两个 effect 会在切换表时先按旧页码查一次、
  // 加载完成后再查一次，既多一次查询也会让错误态瞬间被自动重试覆盖。
  const scopeRef = useRef('');
  useEffect(() => {
    const scope = `${connectionId}|${database ?? ''}|${tableName}`;
    const scopeChanged = scopeRef.current !== scope;
    scopeRef.current = scope;
    if (scopeChanged) {
      setHasLoaded(false);
      setLoadError(null);
      loadCount();
      if (currentPage !== 1) {
        setCurrentPage(1);
        return;
      }
    }
    loadData();
    // loadData/loadCount 由 connectionId/tableName/database 派生，放进依赖会每次渲染重查
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, tableName, database, currentPage, pageSize]);
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // ── 列布局持久化（列序 / 列宽 / 隐藏列）──
  // 以 连接 + 库 + 表 为键，切换 tab、重开表都能恢复用户调过的布局。
  const layoutStorageKey = useMemo(
    () => `idblink:table-layout:v1:${connectionId}:${database ?? ''}:${tableName}`,
    [connectionId, database, tableName]
  );

  useEffect(() => {
    setColumnOrder(null);
    setColWidths({});
    setHiddenColumns(new Set());
    try {
      const raw = localStorage.getItem(layoutStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(saved.columnOrder)) {
        setColumnOrder(saved.columnOrder.filter((n): n is string => typeof n === 'string'));
      }
      if (saved.colWidths && typeof saved.colWidths === 'object') {
        const widths: Record<string, number> = {};
        for (const [name, w] of Object.entries(saved.colWidths as Record<string, unknown>)) {
          if (typeof w === 'number' && Number.isFinite(w) && w > 0) widths[name] = w;
        }
        setColWidths(widths);
      }
      if (Array.isArray(saved.hiddenColumns)) {
        setHiddenColumns(
          new Set(saved.hiddenColumns.filter((n): n is string => typeof n === 'string'))
        );
      }
    } catch {
      // 布局数据损坏时按默认布局显示，不影响表格使用
    }
  }, [layoutStorageKey]);

  // 拖拽列宽会高频触发 onColumnResized，延迟落盘避免每个 mousemove 都写；
  // hasLoaded 守卫防止挂载初期用空布局覆盖已保存的配置。
  useEffect(() => {
    if (!hasLoaded) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          layoutStorageKey,
          JSON.stringify({ columnOrder, colWidths, hiddenColumns: [...hiddenColumns] })
        );
      } catch {
        // 存储不可用（隐私模式/配额满）时静默降级，不影响功能
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [layoutStorageKey, columnOrder, colWidths, hiddenColumns, hasLoaded]);

  // 页内查找统一走 Glide 的查找/替换条（Cmd+F），不再维护一份隐藏行的本地过滤，
  // 避免和查找条语义重叠（查找=高亮定位，过滤=服务端 WHERE）
  const filteredRows = rowData;

  // ── 获取可见列名列表（与 GlideDataTable 同步，过滤隐藏列）──
  const getVisibleColumns = useCallback(() => {
    let cols = queryColumns;
    if (columnOrder) {
      const s = new Set(columnOrder);
      cols = [
        ...columnOrder.filter((n) => queryColumns.includes(n)),
        ...queryColumns.filter((n) => !s.has(n)),
      ];
    }
    if (hiddenColumns.size > 0) cols = cols.filter((n) => !hiddenColumns.has(n));
    return cols;
  }, [queryColumns, columnOrder, hiddenColumns]);

  // ── Core edit: apply + record history (single cell, creates its own history entry) ──
  // 必须在 setRowData 之前用 rowDataRef 同步读取旧值，避免在 setState updater 内做 side effect。
  const applyEdit = useCallback(
    (rowId: string, colId: string, newValue: unknown) => {
      const prev = rowDataRef.current;
      const target = prev.find((r) => r.__row_id__ === rowId);
      if (!target) return;
      if (target.__status__ === 'deleted') return;
      const capturedOld = target[colId];
      // 值未真正变化则不入栈、不改 status（避免双击进入编辑模式未改动却标记为可撤销）。
      // 与撤销逻辑（见 onRestore 的 isSame）保持一致的规范化比较。
      if (isSameEditValue(capturedOld, newValue)) return;
      setRowData((rows) =>
        rows.map((r) => {
          if (r.__row_id__ !== rowId) return r;
          return {
            ...r,
            [colId]: newValue,
            __status__: r.__status__ === 'new' ? 'new' : 'modified',
          };
        })
      );
      recordEdit([{ rowId, colId, oldValue: capturedOld, newValue }]);
    },
    [recordEdit]
  );

  // ── Batch edit: apply multiple cells as one atomic history entry ──
  // 同样用 rowDataRef 同步读取旧值；不在 setState updater 内 push cells 数组。
  // 用 Map 索引避免 O(n×m) 的嵌套查找（paste/范围填充可能传入大量 edits）。
  const applyBatchEdit = useCallback(
    (edits: ReadonlyArray<{ rowId: string; colId: string; value: unknown }>) => {
      if (edits.length === 0) return;
      const prev = rowDataRef.current;
      const prevByRowId = new Map<string, RowData>();
      for (const r of prev) {
        const rid = r.__row_id__;
        if (rid) prevByRowId.set(rid, r);
      }
      const editsByRow = new Map<
        string,
        Array<{ colId: string; oldValue: unknown; newValue: unknown }>
      >();
      for (const e of edits) {
        const target = prevByRowId.get(e.rowId);
        if (!target) continue;
        if (target.__status__ === 'deleted') continue;
        const oldValue = target[e.colId];
        // 值未真正变化则跳过（批量编辑同样避免无改动入栈）
        if (isSameEditValue(oldValue, e.value)) continue;
        if (!editsByRow.has(e.rowId)) editsByRow.set(e.rowId, []);
        editsByRow.get(e.rowId)!.push({ colId: e.colId, oldValue, newValue: e.value });
      }
      if (editsByRow.size === 0) return;
      setRowData((rows) =>
        rows.map((r) => {
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
        })
      );
      const historyCells: Array<{
        rowId: string;
        colId: string;
        oldValue: unknown;
        newValue: unknown;
      }> = [];
      for (const [rowId, rowEdits] of editsByRow) {
        for (const e of rowEdits) {
          historyCells.push({ rowId, colId: e.colId, oldValue: e.oldValue, newValue: e.newValue });
        }
      }
      if (historyCells.length > 0) recordEdit(historyCells);
    },
    [recordEdit]
  );

  // ── Edit (inline) ──
  const handleCellEdited = useCallback(
    (col: number, row: number, newValue: string) => {
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
    },
    [getVisibleColumns, filteredRows, applyEdit]
  );

  // ── Edit (range) ──
  const handleCellsEdited = useCallback(
    (edits: Array<{ col: number; row: number; value: string }>) => {
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
    },
    [getVisibleColumns, filteredRows, applyBatchEdit]
  );

  // ── Paste (Ctrl+V) ──
  const handlePaste = useCallback(
    (target: readonly [number, number], values: readonly (readonly string[])[]): boolean => {
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
    },
    [getVisibleColumns, filteredRows, applyBatchEdit]
  );

  // ── Add Row ──
  const [scrollToRowIndex, setScrollToRowIndex] = useState<number | undefined>(undefined);
  const handleAddRow = useCallback(() => {
    const nr: RowData = {
      __row_id__: `new-${Date.now()}`,
      __status__: 'new',
      __original_data__: {},
    };
    columns.forEach((col) => {
      nr[col.column_name] = null;
    });
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

  // ── 脏状态上报 ──
  // TabPanel 依赖它显示 tab 未保存圆点、关闭 tab 时二次确认，并聚合到
  // data-dirty-change 供 MainLayout 做整窗关闭保护。回调身份变化不应误报，
  // 因此经 ref 调用；卸载时补一次 false，避免 tab 已关还留着脏标记。
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  useEffect(() => {
    onDirtyChangeRef.current?.(hasChanges);
  }, [hasChanges]);
  useEffect(() => () => onDirtyChangeRef.current?.(false), []);

  // ── Delete ──
  // 标记已有行为 'deleted' 或移除新增行，同时记录撤销历史：
  // - 新增行：记录 '__row__' → 完整行数据，撤销时重新插回
  // - 已有行：记录 '__status__' → 原 status，撤销时恢复
  const handleDeleteRows = useCallback(() => {
    if (selectedRows.length === 0) {
      message.warning(t('common.pleaseSelectRowsToDelete'));
      return;
    }
    const selIds = new Set(selectedRows.map((r) => r.__row_id__));
    const prev = rowDataRef.current;
    const historyCells: Array<{
      rowId: string;
      colId: string;
      oldValue: unknown;
      newValue: unknown;
    }> = [];
    for (const r of prev) {
      const rid = r.__row_id__;
      if (!rid || !selIds.has(rid)) continue;
      if (r.__status__ === 'new') {
        historyCells.push({ rowId: rid, colId: '__row__', oldValue: { ...r }, newValue: null });
      } else {
        historyCells.push({
          rowId: rid,
          colId: '__status__',
          oldValue: r.__status__,
          newValue: 'deleted',
        });
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
    // 全部主键列：行定位 WHERE 必须全列 AND——只取第一列时复合主键
    // 值组合重复的行会命中多行（UPDATE/DELETE 扩散，数据风险）
    const pkCols = columns.filter((c) => c.column_key === 'PRI');
    const dialect = getDialect(dbType);
    const tableRef = dialect.buildTableRef(tableName, database);
    const visibleCols = queryColumns;

    // BIGINT 等大整数以字符串形式到达（后端 convertValue 对超出 JS 安全整数
    // 范围的整数按字符串传，否则 JSON 数字被前端取整、雪花 ID 主键的 WHERE
    // 静默失配）。整数列的 WHERE 必须写裸数字：字符串字面量与数值列比较在
    // 部分数据库走浮点转换，19 位雪花 ID 会再次取整失配。
    const numericPkLiteral = (col: { data_type?: string }, value: unknown): string => {
      if (
        typeof value === 'string' &&
        /^-?\d+$/.test(value) &&
        /int|decimal|numeric|number|serial|identity/i.test(col.data_type || '')
      ) {
        return value;
      }
      return dialect.escapeValue(value);
    };

    // 行定位 WHERE：复合主键全列 AND；必须用修改前的主键值——主键列本身被改时，
    // 用当前（新）值会一行都匹配不到，UPDATE/DELETE 静默变成 0 行生效
    const rowWhere = (row: RowData): string | null => {
      const conds: string[] = [];
      for (const pk of pkCols) {
        const origPk = row.__original_data__?.[pk.column_name] ?? row[pk.column_name];
        conds.push(`${dialect.escapeIdentifier(pk.column_name)} = ${numericPkLiteral(pk, origPk)}`);
      }
      return conds.length ? conds.join(' AND ') : null;
    };

    for (const row of newRows) {
      const cols = visibleCols.filter((c) => row[c] !== null && row[c] !== undefined);
      if (cols.length === 0) continue;
      const vals = [cols.map((c) => row[c])];
      const sqls = dialect.buildInsert(tableRef, cols, vals);
      if (sqls.length > 0)
        items.push({
          id: `ins-${row.__row_id__}`,
          sql: sqls[0] + ';',
          type: 'insert',
          source: row.__row_id__ || '',
        });
    }

    for (const row of modifiedRows) {
      if (pkCols.length === 0) continue;
      const setters: Record<string, unknown> = {};
      for (const c of visibleCols) {
        const orig = row.__original_data__?.[c];
        const cur = row[c];
        const isSame =
          (orig == null && cur == null) || (orig != null && String(orig) === String(cur ?? ''));
        if (!isSame) setters[c] = cur;
      }
      if (Object.keys(setters).length === 0) continue;
      const where = rowWhere(row);
      if (!where) continue;
      items.push({
        id: `upd-${row.__row_id__}`,
        sql: dialect.buildUpdate(tableRef, setters, where) + ';',
        type: 'update',
        source: row.__row_id__ || '',
      });
    }

    for (const row of deletedRows) {
      if (pkCols.length === 0) continue;
      // 同 UPDATE：行上可能带着未提交的主键修改，删除必须按原始主键定位
      const where = rowWhere(row);
      if (!where) continue;
      items.push({
        id: `del-${row.__row_id__}`,
        sql: dialect.buildDelete(tableRef, where) + ';',
        type: 'delete',
        source: row.__row_id__ || '',
      });
    }

    return items;
  }, [newRows, modifiedRows, deletedRows, columns, queryColumns, tableName, dbType, database]);

  // 待提交 SQL 清空（撤销/提交完成）时自动收起抽屉，避免留下空面板
  useEffect(() => {
    if (pendingSqls.length === 0) setShowSqlPanel(false);
  }, [pendingSqls.length]);

  // 无主键时 modified/deleted 行无法生成 SQL，单独提示避免用户困惑
  const noPkWarning = useMemo(() => {
    const hasPk = columns.some((c) => c.column_key === 'PRI');
    return !hasPk && (modifiedRows.length > 0 || deletedRows.length > 0);
  }, [columns, modifiedRows, deletedRows]);

  // ── Remove single pending SQL (revert that row's changes) ──
  // 只移除该行相关的历史条目（保留其他行的撤销栈），不调用 clearEditHistory。
  const handleRemovePendingSql = useCallback(
    (sqlId: string) => {
      const item = pendingSqls.find((s) => s.id === sqlId);
      if (!item) return;
      if (item.type === 'insert') {
        setRowData((prev) => prev.filter((r) => r.__row_id__ !== item.source));
        removeEditHistoryByRowId(item.source);
      } else if (item.type === 'update') {
        setRowData((prev) =>
          prev.map((r) => {
            if (r.__row_id__ !== item.source) return r;
            const restored = { ...r, ...r.__original_data__, __status__: undefined };
            return restored;
          })
        );
        removeEditHistoryByRowId(item.source);
      } else if (item.type === 'delete') {
        setRowData((prev) =>
          prev.map((r) => {
            if (r.__row_id__ !== item.source) return r;
            return { ...r, __status__: undefined };
          })
        );
        removeEditHistoryByRowId(item.source);
      }
    },
    [pendingSqls, removeEditHistoryByRowId]
  );

  // ── Commit all ──
  // 按顺序执行 pending SQL。成功/失败都 await loadData 把数据库真实状态同步回 UI，
  // 避免中途失败时 pendingSqls 残留导致用户重试时重复提交已落库的 SQL。
  // 含 DELETE 时弹二次确认（防止误按 Cmd+S 删数据）。
  const committingRef = useRef(false);
  const handleCommit = useCallback(async () => {
    if (committingRef.current) return; // 防止 Cmd+S 或快速点击重复触发
    if (pendingSqls.length === 0) return;
    if (
      !columns.find((c) => c.column_key === 'PRI') &&
      (modifiedRows.length > 0 || deletedRows.length > 0)
    ) {
      message.warning(t('common.dataGrid.noPrimaryKeyWarning'));
      return;
    }

    // 含 DELETE 类操作时要求二次确认
    const hasDestructive = pendingSqls.some((p) => p.type === 'delete');
    if (hasDestructive) {
      const confirmed = await new Promise<boolean>((resolve) => {
        appModal.confirm({
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
        // useTransaction:false —— 表数据编辑提交走自动提交，不加入任何活跃事务
        const res = await executeQuery(connectionId, item.sql, database || '', undefined, {
          useTransaction: false,
        });
        if (res.error) {
          errMsg = `${item.sql}\n→ ${res.error}`;
          break;
        }
        if (item.source) succeededSources.add(item.source);
      }

      if (errMsg) {
        message.error(`${t('common.dataGrid.updateFailed')}: ${errMsg}`);
      } else {
        message.success(
          `${t('common.dataGrid.updateSuccess')} ${pendingSqls.length} ${t('common.rows')}`
        );
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
      message.error(`${t('common.dataGrid.updateFailed')}: ${getErrorMessage(err)}`);
    } finally {
      committingRef.current = false;
      setLoading(false);
    }
  }, [
    pendingSqls,
    modifiedRows,
    deletedRows,
    columns,
    connectionId,
    database,
    executeQuery,
    loadData,
    loadCount,
    t,
    clearEditHistory,
    removeEditHistoryByRowId,
  ]);

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
    appModal.confirm({
      title: t('common.undoModifications'),
      content: t('common.dataGrid.undoAllConfirm'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      zIndex: 2000,
      transitionName: '',
      maskTransitionName: '',
      centered: true,
      onOk: () => {
        setRowData((prev) =>
          prev
            .filter((r) => r.__status__ !== 'new')
            .map((r): RowData => {
              if (r.__status__ === 'modified')
                return { ...r, ...r.__original_data__, __status__: undefined };
              if (r.__status__ === 'deleted') return { ...r, __status__: undefined };
              return r;
            })
        );
        clearEditHistory();
        message.info(t('common.allChangesRevoked'));
      },
    });
  }, [t]);

  // ── Selection ──
  const handleSelectionChange = useCallback(
    (rows: GlideRow[], _selection: any) => {
      setSelectedRows(rows as unknown as RowData[]);
      if (menuState.visible) closeMenu();
    },
    [menuState.visible, closeMenu]
  );

  // ── Context Menu ──
  const handleCellContextMenu = useCallback(
    (col: number, row: number, bounds: { x: number; y: number }) => {
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
    },
    [filteredRows, selectedRows, getVisibleColumns, openMenu]
  );

  // ── Header Context Menu (hide column) ──
  const handleHeaderContextMenu = useCallback(
    (colIndex: number, bounds: { x: number; y: number }) => {
      const colId = getVisibleColumns()[colIndex];
      if (!colId) return;
      openMenu(bounds.x, bounds.y, {
        col: colIndex,
        row: -1,
        colName: colId,
      });
    },
    [getVisibleColumns, openMenu]
  );

  // ── Export ──
  const exportColNames = useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c.column_name)).map((c) => c.column_name),
    [columns, hiddenColumns]
  );
  const handleExportCsv = useCallback(() => {
    if (rowData.length === 0) {
      message.warning(t('common.noDataToExport'));
      return;
    }
    const esc = (v: string) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n'))
        return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const header = exportColNames.join(',');
    const body = rowData
      .map((r) => exportColNames.map((n) => esc(r[n] == null ? '' : String(r[n]))).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${tableName}.csv`;
    a.click();
    message.success(t('common.importExport.exportSuccess'));
  }, [rowData, exportColNames, tableName, message, t]);

  const handleExportExcel = useCallback(() => {
    if (rowData.length === 0) {
      message.warning(t('common.noDataToExport'));
      return;
    }
    const data = rowData.map((r) => {
      const o: Record<string, any> = {};
      exportColNames.forEach((n) => {
        o[n] = r[n];
      });
      return o;
    });
    const cols = exportColNames.map((n) => ({ field: n, headerName: n }));
    exportToExcel(data, cols, { filename: `${tableName}.xlsx`, sheetName: tableName });
    message.success(t('common.importExport.exportSuccess'));
  }, [rowData, exportColNames, tableName, message, t]);

  // ── Glide Data ──
  const glideCols = useMemo(() => {
    const typeMap = new Map(columns.map((c) => [c.column_name, c.data_type]));
    const commentMap = new Map(columns.map((c) => [c.column_name, c.comment || '']));
    const pkSet = new Set(columns.filter((c) => c.column_key === 'PRI').map((c) => c.column_name));
    // queryColumns 可能为空（查询无数据时），用 columns 元数据兜底
    let cols = queryColumns.length > 0 ? queryColumns : columns.map((c) => c.column_name);
    if (columnOrder) {
      const s = new Set(columnOrder);
      cols = [...columnOrder.filter((n) => cols.includes(n)), ...cols.filter((n) => !s.has(n))];
    }
    return cols.map((name) => ({
      id: name,
      // title 编码: name|type|isPK|comment（comment 供 hover tooltip 读取）
      title: `${name}|${typeMap.get(name) || ''}|${pkSet.has(name) ? '1' : '0'}|${commentMap.get(name) || ''}`,
      width: colWidths[name] || defaultColumnWidth(typeMap.get(name)),
    }));
  }, [queryColumns, columnOrder, colWidths, columns]);

  const glideRows = useMemo(() => rowsToGlideRows(filteredRows, columns), [filteredRows, columns]);

  // ── Column Resize ──
  // 用 col.id 而不是索引：GlideDataTable 会先过滤隐藏列，它回调里的可见索引
  // 与 glideCols 的原始索引并不同源，按索引写会把宽度落到错误的列上。
  const onColumnResized = useCallback((col: { id?: unknown }, newWidth: number) => {
    const colId = typeof col.id === 'string' ? col.id : null;
    if (colId) {
      setColWidths((prev) => ({ ...prev, [colId]: newWidth }));
    }
  }, []);

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

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const applyPageInput = useCallback(() => {
    const v = parseInt(pageInput);
    if (!isNaN(v) && v > 0 && v <= pageCount) setCurrentPage(v);
    else setPageInput(String(currentPage));
  }, [pageInput, pageCount, currentPage]);
  const applyPageSize = useCallback((val: string) => {
    const n = parseInt(val);
    if (!Number.isFinite(n) || n <= 0) return;
    setPageSizeState(Math.min(n, 10000));
    setCurrentPage(1);
  }, []);

  return (
    <div
      ref={rootRef}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--background-card)',
      }}
    >
      {/* ═══ Toolbar + Filter（同一容器两行）═══ */}
      <div className="data-toolbar data-toolbar-merged">
        {/* 第一行：行操作、提交撤销、搜索与工具 */}
        <div className="data-toolbar-row">
          <div className="data-toolbar-group">
            <Button
              icon={<PlusOutlined />}
              onClick={handleAddRow}
              type="primary"
              size="small"
              className="data-toolbar-btn"
            >
              {t('common.addRowLabel')}
            </Button>
            <Button
              icon={<DeleteOutlined />}
              onClick={handleDeleteRows}
              disabled={selectedRows.length === 0}
              danger
              size="small"
              className="data-toolbar-btn"
            >
              {t('common.delete')}
            </Button>
            {hasChanges && (
              <>
                <Button
                  type="primary"
                  size="small"
                  icon={<SaveOutlined />}
                  onClick={handleCommit}
                  loading={loading}
                  className="data-toolbar-btn"
                >
                  {t('common.submit')} ({pendingSqls.length})
                </Button>
                <Tooltip title={t('common.dataGrid.undoStep')}>
                  <Button
                    size="small"
                    icon={<UndoOutlined />}
                    onClick={handleUndo}
                    disabled={!hasEditHistory}
                    className="data-toolbar-btn"
                  />
                </Tooltip>
                <Tooltip title={t('common.dataGrid.undoAllTip')}>
                  <Button
                    size="small"
                    danger
                    icon={<CloseOutlined />}
                    onClick={handleUndoAll}
                    className="data-toolbar-btn"
                  />
                </Tooltip>
              </>
            )}
            <Tooltip title={t('common.refreshLabel')}>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => loadData()}
                loading={loading}
                size="small"
                className="data-toolbar-btn"
              />
            </Tooltip>
            <Popover
              content={
                <Space orientation="vertical" size={2} style={{ maxHeight: 200, overflow: 'auto' }}>
                  {columns.map((col) => (
                    <label
                      key={col.column_name}
                      style={{
                        fontSize: 11,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.has(col.column_name)}
                        onChange={() =>
                          setHiddenColumns((prev) => {
                            const n = new Set(prev);
                            if (n.has(col.column_name)) n.delete(col.column_name);
                            else n.add(col.column_name);
                            return new Set(n);
                          })
                        }
                      />
                      {col.column_name}
                    </label>
                  ))}
                </Space>
              }
              trigger="click"
              open={showColVisibility}
              onOpenChange={setShowColVisibility}
            >
              <Tooltip title={t('common.columnVisibility')}>
                <Button icon={<EyeInvisibleOutlined />} size="small" className="data-toolbar-btn" />
              </Tooltip>
            </Popover>
            <Dropdown
              menu={{
                items: [
                  { key: 'csv', label: t('common.exportCsv'), onClick: handleExportCsv },
                  { key: 'xlsx', label: t('common.exportExcel'), onClick: handleExportExcel },
                ],
              }}
            >
              <Tooltip title={t('common.export')}>
                <Button icon={<DownloadOutlined />} size="small" className="data-toolbar-btn" />
              </Tooltip>
            </Dropdown>
            <span className="data-toolbar-divider" />
            <Tooltip title={t('common.dataGrid.filterConditions')}>
              <Button
                icon={<FilterOutlined />}
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                type={showFilterPanel || whereClause || orderByClause ? 'primary' : 'default'}
                size="small"
                className="data-toolbar-btn"
              />
            </Tooltip>
          </div>

          {/* 条件输入与行操作同排；筛选面板展开时由面板接管，隐藏输入 */}
          {!showFilterPanel && (
            <>
              <span className="data-toolbar-divider" />
              <div className="data-toolbar-filter-inline">
                <SqlInput
                  className="data-sql-input"
                  value={whereClause}
                  onChange={(val) => setWhereClause(val)}
                  placeholder={t('common.dataGrid.filterPlaceholder')}
                  size="middle"
                  style={{ height: 26, fontSize: 12 }}
                  columns={columns.map((c) => ({
                    column_name: c.column_name,
                    data_type: c.data_type,
                  }))}
                  dbType={dbType}
                  onPressEnter={applyWhereInput}
                />
                <SqlInput
                  className="data-sql-input"
                  value={orderByClause}
                  onChange={(val) => setOrderByClause(val)}
                  placeholder={t('common.dataGrid.orderBy') + ' ASC/DESC ...'}
                  size="middle"
                  style={{ height: 26, fontSize: 12 }}
                  columns={columns.map((c) => ({
                    column_name: c.column_name,
                    data_type: c.data_type,
                  }))}
                  dbType={dbType}
                  onPressEnter={applyWhereInput}
                />
                <Button
                  size="small"
                  type="primary"
                  onClick={applyWhereInput}
                  className="data-toolbar-btn"
                >
                  {t('common.applyLabel')}
                </Button>
                {(whereClause || orderByClause) && (
                  <Button
                    size="small"
                    type="text"
                    onClick={resetFilters}
                    className="data-toolbar-btn data-toolbar-clear-btn"
                  >
                    {t('common.dataGrid.clearShort')}
                  </Button>
                )}
              </div>
            </>
          )}

          {selectedRows.length > 0 && (
            <>
              <span className="data-toolbar-divider" style={{ marginLeft: 'auto' }} />
              <Tag
                className="data-toolbar-tag"
                style={{
                  background: 'var(--color-warning-alpha-15)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--color-warning-alpha-30)',
                }}
              >
                {selectedRows.length} {t('common.rows')}
              </Tag>
            </>
          )}
        </div>
      </div>
      {/* ═══ Filter Panel（条件 + 排序）═══ */}
      {showFilterPanel && (
        <div className="data-filter-panel">
          <div className="data-filter-panel-inner">
            {/* 左：筛选条件 */}
            <div className="data-filter-section">
              <div className="data-filter-section-head">
                <FilterOutlined style={{ fontSize: 12, color: 'var(--color-primary)' }} />
                <span>{t('common.dataGrid.filterConditions')}</span>
              </div>
              <div className="data-filter-condition-list">
                {filterConditions.map((cond, idx) => {
                  const prevCond = idx > 0 ? filterConditions[idx - 1] : null;
                  const showLogic = idx > 0 && !cond.isGroupStart && !prevCond?.isGroupStart;
                  return (
                    <div
                      key={cond.id}
                      className="data-filter-condition-row"
                      style={{ paddingLeft: (cond.level ?? 0) * 16 }}
                    >
                      {cond.isGroupStart && (
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 'bold',
                            color: 'var(--color-info)',
                            marginRight: 4,
                          }}
                        >
                          (
                        </span>
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
                      {!showLogic && !cond.isGroupStart && !cond.isGroupEnd && (
                        <span style={{ width: 64 }} />
                      )}
                      {!cond.isGroupStart && !cond.isGroupEnd && (
                        <>
                          {/* 勾选框：停用条件而不删除，配置保留以便再次启用 */}
                          <Checkbox
                            checked={cond.enabled !== false}
                            onChange={(e) =>
                              updateFilterCondition(cond.id, { enabled: e.target.checked })
                            }
                            title={t('common.filterConditionEnable')}
                            style={{ flexShrink: 0 }}
                          />
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              flex: 1,
                              minWidth: 0,
                              opacity: cond.enabled === false ? 0.45 : 1,
                              transition: 'opacity 0.2s',
                            }}
                          >
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
                              style={{ width: 110, fontSize: 11 }}
                              options={OPERATOR_OPTIONS}
                            />
                            {RANGE_OPERATORS.includes(cond.operator) && (
                              <>
                                <Input
                                  placeholder={t('common.dataGrid.rangeMin')}
                                  value={cond.value}
                                  onChange={(e) =>
                                    updateFilterCondition(cond.id, { value: e.target.value })
                                  }
                                  size="small"
                                  style={{ flex: 1, fontSize: 11, minWidth: 60 }}
                                />
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                  ～
                                </span>
                                <Input
                                  placeholder={t('common.dataGrid.rangeMax')}
                                  value={cond.value2 ?? ''}
                                  onChange={(e) =>
                                    updateFilterCondition(cond.id, { value2: e.target.value })
                                  }
                                  size="small"
                                  style={{ flex: 1, fontSize: 11, minWidth: 60 }}
                                />
                              </>
                            )}
                            {!RANGE_OPERATORS.includes(cond.operator) &&
                              !NO_VALUE_OPERATORS.includes(cond.operator) && (
                                <Input
                                  placeholder={t('common.valuePlaceholder')}
                                  value={cond.value}
                                  onChange={(e) =>
                                    updateFilterCondition(cond.id, { value: e.target.value })
                                  }
                                  size="small"
                                  style={{ flex: 1, fontSize: 11, minWidth: 60 }}
                                />
                              )}
                            {NO_VALUE_OPERATORS.includes(cond.operator) && (
                              <span
                                style={{ flex: 1, fontSize: 11, color: 'var(--text-tertiary)' }}
                              >
                                —
                              </span>
                            )}
                          </div>
                        </>
                      )}
                      {cond.isGroupEnd && (
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 'bold',
                            color: 'var(--color-info)',
                            marginLeft: 4,
                          }}
                        >
                          )
                        </span>
                      )}
                      {!cond.isGroupEnd && (
                        <Dropdown
                          trigger={['click']}
                          menu={{
                            items: [
                              {
                                key: 'sibling',
                                label: t('common.addSibling'),
                                onClick: () => insertSiblingCondition(idx, cond),
                              },
                              {
                                key: 'group',
                                label: t('common.addBracket'),
                                onClick: () => insertGroupCondition(idx, cond),
                              },
                            ],
                          }}
                        >
                          <Tooltip title={t('common.dataGrid.addCondition')}>
                            <Button
                              type="text"
                              size="small"
                              icon={<PlusOutlined />}
                              className="data-filter-icon-btn"
                            />
                          </Tooltip>
                        </Dropdown>
                      )}
                      <Button
                        type="text"
                        danger
                        size="small"
                        onClick={() => removeFilterCondition(cond.id)}
                        className="data-filter-icon-btn"
                        icon={<DeleteOutlined />}
                        disabled={filterConditions.length === 1}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右：排序条件构建（生成 ORDER BY） */}
            <div className="data-filter-section">
              <div className="data-filter-section-head">
                <ArrowUpOutlined style={{ fontSize: 11, color: 'var(--color-primary)' }} />
                <span>{t('common.dataGrid.sortConditions')}</span>
                <div style={{ flex: 1 }} />
                <Button
                  type="link"
                  size="small"
                  className="data-filter-link-btn"
                  icon={<PlusOutlined />}
                  onClick={addSortCondition}
                >
                  {t('common.dataGrid.addSort')}
                </Button>
              </div>
              <div className="data-filter-sort-list">
                {sortConditions.length === 0 ? (
                  <div className="data-filter-sort-empty">{t('common.dataGrid.sortEmpty')}</div>
                ) : (
                  sortConditions.map((sort, idx) => (
                    <div key={sort.id} className="data-filter-sort-row">
                      <Select
                        placeholder={t('common.fieldPlaceholder')}
                        value={sort.field || undefined}
                        onChange={(val) => updateSortCondition(sort.id, { field: val })}
                        size="small"
                        style={{ flex: 1, minWidth: 0, fontSize: 11 }}
                        showSearch
                        popupMatchSelectWidth={false}
                        filterOption={(input, option) =>
                          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={columns.map((col) => ({
                          label: col.column_name,
                          value: col.column_name,
                        }))}
                      />
                      <Select
                        value={sort.direction}
                        onChange={(val) => updateSortCondition(sort.id, { direction: val })}
                        size="small"
                        style={{ width: 102, fontSize: 11 }}
                        options={[
                          { label: t('common.dataGrid.sortAsc'), value: 'ASC' },
                          { label: t('common.dataGrid.sortDesc'), value: 'DESC' },
                        ]}
                      />
                      <Tooltip title={t('common.dataGrid.sortMoveUp')}>
                        <Button
                          type="text"
                          size="small"
                          icon={<ArrowUpOutlined />}
                          disabled={idx === 0}
                          onClick={() => moveSortCondition(sort.id, -1)}
                          style={{ width: 20, height: 20, padding: 0, fontSize: 10 }}
                        />
                      </Tooltip>
                      <Tooltip title={t('common.dataGrid.sortMoveDown')}>
                        <Button
                          type="text"
                          size="small"
                          icon={<ArrowDownOutlined />}
                          disabled={idx === sortConditions.length - 1}
                          onClick={() => moveSortCondition(sort.id, 1)}
                          style={{ width: 20, height: 20, padding: 0, fontSize: 10 }}
                        />
                      </Tooltip>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => removeSortCondition(sort.id)}
                        style={{ width: 20, height: 20, padding: 0, fontSize: 11 }}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 实时 SQL：条件/排序变更即时生成，可一键复制 */}
          <div className="data-filter-sql-live">
            <CodeOutlined style={{ fontSize: 11, color: 'var(--color-primary)', flexShrink: 0 }} />
            <code className="data-filter-sql-live-text">
              {liveFilterSql ? (
                <SqlText sql={liveFilterSql} />
              ) : (
                <span className="is-empty">{t('common.noFilterConditions')}</span>
              )}
            </code>
            <Tooltip title={t('common.copySql')}>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                disabled={!liveFilterSql}
                onClick={copyFilterSql}
                className="data-filter-copy"
              />
            </Tooltip>
            <span className="data-toolbar-divider" />
            <Button size="small" className="data-toolbar-btn" onClick={resetFilters}>
              {t('common.clearLabel')}
            </Button>
            <Button type="primary" size="small" className="data-toolbar-btn" onClick={applyFilter}>
              {t('common.applyLabel')}
            </Button>
          </div>
        </div>
      )}

      {/* ═══ Grid ═══ */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && !hasLoaded && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
            <TableDataSkeleton />
          </div>
        )}
        {loadError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 20,
              background: 'var(--background-card)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <ExclamationCircleOutlined style={{ fontSize: 28, color: 'var(--color-error)' }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('common.failedToLoadData')}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-tertiary)',
                maxWidth: 'min(560px, 90%)',
                maxHeight: 120,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'var(--font-family-code)',
                lineHeight: 1.5,
              }}
            >
              {loadError}
            </div>
            <Button
              type="primary"
              size="small"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => {
                setLoadError(null);
                loadData();
                loadCount();
              }}
            >
              {t('common.dataGrid.retry')}
            </Button>
          </div>
        )}
        {hasLoaded && glideCols.length > 0 ? (
          <GlideDataTable
            columns={glideCols}
            rows={glideRows}
            hiddenColumns={hiddenColumns}
            rowStatus={tableRowStatus}
            isCellModified={tableCellModified}
            scrollToRowIndex={scrollToRowIndex}
            onSelectionChange={handleSelectionChange}
            onColumnOrderChange={(visibleOrder) => {
              setColumnOrder((prev) => {
                const full = prev ? [...prev] : [...queryColumns];
                // 可见列按新顺序回填原槽位，隐藏列保持不动
                const visibleSet = new Set(visibleOrder);
                let i = 0;
                const merged = full.map((id) => (visibleSet.has(id) ? visibleOrder[i++] : id));
                for (const id of visibleOrder) {
                  if (!merged.includes(id)) merged.push(id);
                }
                return merged;
              });
            }}
            onColumnResized={onColumnResized}
            onCellEdited={handleCellEdited}
            onCellsEdited={handleCellsEdited}
            onCellContextMenu={handleCellContextMenu}
            onPaste={handlePaste}
            onHeaderContextMenu={handleHeaderContextMenu}
            headerHeight={46}
            rowHeight={30}
            editable={true}
            enableFindReplace
            findReplaceVisible={findVisible}
            onFindReplaceVisibleChange={setFindVisible}
          />
        ) : hasLoaded ? (
          <EnhancedEmptyState
            icon={<TableOutlined style={{ fontSize: 36, color: 'var(--text-tertiary)' }} />}
            title={t('common.noTableStructure')}
          />
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
          onSetWhereClause: (where) => {
            setWhereClause(where);
            setCurrentPage(1);
            loadData({ where, page: 1 });
          },
          onHideColumn: (colName) => setHiddenColumns((prev) => new Set([...prev, colName])),
          onCellEdited: handleCellEdited,
          onPreviewCell: (value, colName, rowIndex, colIndex) =>
            setCellPreview({ open: true, value, columnName: colName, rowIndex, colIndex }),
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

      {/* ═══ 待提交 SQL 抽屉（底部滑出）═══ */}
      {hasChanges && (
        <div
          className={`pending-sql-drawer${showSqlPanel ? ' is-open' : ''}`}
          aria-hidden={!showSqlPanel}
          inert={!showSqlPanel}
        >
          <div className="pending-sql-drawer-head">
            <span className="pending-sql-drawer-title">
              <CodeOutlined style={{ fontSize: 12, color: 'var(--color-primary)' }} />
              {t('common.dataGrid.pendingSqlTitle')}
              <Tag
                className="data-toolbar-tag"
                style={{
                  background: 'var(--color-primary-alpha-15)',
                  color: 'var(--color-primary)',
                  border: '1px solid var(--color-primary-alpha-30)',
                }}
              >
                {pendingSqls.length}
              </Tag>
            </span>
            <div style={{ flex: 1 }} />
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              onClick={handleCommit}
              loading={loading}
              className="data-toolbar-btn"
            >
              {t('common.submit')}
            </Button>
            <Button
              size="small"
              icon={<UndoOutlined />}
              onClick={handleUndo}
              disabled={!hasEditHistory}
              className="data-toolbar-btn"
            >
              {t('common.undo')}
            </Button>
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              onClick={() => setShowSqlPanel(false)}
              className="pending-sql-collapse"
            >
              {t('common.collapse')}
            </Button>
          </div>
          <div className="pending-sql-drawer-body">
            {pendingSqls.map((item) => (
              <div key={item.id} className="pending-sql-row">
                <span className={`pending-sql-type is-${item.type}`}>
                  {item.type === 'insert' ? 'INS' : item.type === 'delete' ? 'DEL' : 'UPD'}
                </span>
                <span className="pending-sql-code">
                  <SqlText sql={item.sql} />
                </span>
                <Tooltip title={t('common.dataGrid.revertRow')}>
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<CloseOutlined />}
                    onClick={() => handleRemovePendingSql(item.id)}
                    style={{ height: 18, width: 18, padding: 0, flexShrink: 0 }}
                  />
                </Tooltip>
              </div>
            ))}
            {pendingSqls.length === 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  textAlign: 'center',
                  padding: 8,
                }}
              >
                {t('common.dataGrid.noPendingSql')}
              </div>
            )}
            {noPkWarning && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-warning, #F59E0B)',
                  textAlign: 'center',
                  padding: '4px 8px',
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                {t('common.dataGrid.noPrimaryKeyWarning')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Status Bar ═══ */}
      <div
        style={{
          borderTop: '1px solid var(--border-color)',
          background: 'var(--background-card)',
          padding: '1px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          minHeight: 24,
        }}
      >
        <Space size={2}>
          {!showSqlPanel && pendingSqls.length > 0 && (
            <Tooltip title={t('common.dataGrid.expandPendingSql')}>
              <Button
                icon={<ArrowUpOutlined />}
                size="small"
                onClick={() => setShowSqlPanel(true)}
                style={{ height: 20, padding: '0 6px', fontSize: 11 }}
              >
                {t('common.dataGrid.pendingSqlTitle')} ({pendingSqls.length})
              </Button>
            </Tooltip>
          )}
        </Space>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          <code
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 11,
              fontFamily: 'var(--font-family-code)',
              padding: '2px 6px',
              background: 'var(--background-card)',
              borderRadius: 3,
              border: '1px solid var(--border-color)',
              maxWidth: 'none',
            }}
          >
            <SqlText sql={currentSql} />
          </code>
          <Tooltip title={t('common.copySql')}>
            <Button
              icon={<CopyOutlined />}
              type="text"
              onClick={copySql}
              size="small"
              style={{ height: 20, padding: '0 4px', fontSize: 11 }}
            />
          </Tooltip>
        </div>
        <Space size={2} style={{ flexShrink: 0 }}>
          <Button
            size="small"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(currentPage - 1)}
            style={{ height: 20, padding: '0 6px', fontSize: 11, lineHeight: '18px' }}
          >
            ‹
          </Button>
          <Popover
            trigger="click"
            placement="topRight"
            content={
              <div className="pager-popover">
                <div className="pager-popover-row">
                  <span className="pager-popover-label">{t('common.dataGrid.pageNumber')}</span>
                  <Input
                    size="small"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onBlur={applyPageInput}
                    onPressEnter={applyPageInput}
                    style={{ width: 58, fontSize: 11, textAlign: 'center', height: 22 }}
                  />
                  <span className="pager-popover-total">/ {pageCount}</span>
                  <div style={{ flex: 1 }} />
                  <Button
                    type="link"
                    size="small"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(1)}
                    style={{ padding: 0, height: 20, fontSize: 11 }}
                  >
                    {t('common.firstPage')}
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    disabled={currentPage === pageCount}
                    onClick={() => setCurrentPage(pageCount)}
                    style={{ padding: 0, height: 20, fontSize: 11 }}
                  >
                    {t('common.lastPage')}
                  </Button>
                </div>
                <div className="pager-popover-row">
                  <span className="pager-popover-label">{t('common.pageSize')}</span>
                  <AutoComplete
                    value={String(pageSize)}
                    onChange={applyPageSize}
                    size="small"
                    style={{ width: 96, fontSize: 11 }}
                    options={[
                      { value: '50' },
                      { value: '100' },
                      { value: '500' },
                      { value: '1000' },
                    ]}
                    popupClassName="page-size-dropdown"
                  />
                </div>
                <div className="pager-popover-row">
                  <span className="pager-popover-label">{t('common.goToRow')}</span>
                  <Input
                    size="small"
                    placeholder={t('common.goToRow')}
                    value={goToRowValue}
                    onChange={(e) => setGoToRowValue(e.target.value)}
                    onPressEnter={handleGoToRow}
                    style={{ width: 110, fontSize: 11, textAlign: 'center', height: 22 }}
                  />
                </div>
              </div>
            }
          >
            <Button
              type="text"
              size="small"
              className="pager-summary-btn"
              style={{ height: 20, padding: '0 6px', fontSize: 11 }}
            >
              {currentPage} / {pageCount} · {totalCount.toLocaleString()} {t('common.rows')}
            </Button>
          </Popover>
          <Button
            size="small"
            disabled={currentPage * pageSize >= totalCount}
            onClick={() => setCurrentPage(currentPage + 1)}
            style={{ height: 20, padding: '0 6px', fontSize: 11, lineHeight: '18px' }}
          >
            ›
          </Button>
        </Space>
      </div>
    </div>
  );
});

export default DataTable;
