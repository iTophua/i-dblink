/**
 * GlideDataTable — 基于 Glide Data Grid 的通用数据表格组件
 */
import { useMemo, useCallback, useState, useEffect, useRef, useLayoutEffect, createContext, useContext } from 'react';
import type { MutableRefObject } from 'react';
import DataEditor, {
  GridCellKind,
  CompactSelection,
  type GridColumn,
  type GridCell,
  type Item,
  type Theme,
  type GridSelection,
  type DrawHeaderCallback,
  type EditableGridCell,
  type ProvideEditorCallback,
  type ProvideEditorComponent,
  type DataEditorRef,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useThemeColors } from '../../hooks/useThemeColors';
import { buildGlideTheme } from './glide-theme';
import { FindReplaceBar, type FindMatch, type FindOptions } from './FindReplaceBar';

export type GlideRow = Record<string, unknown>;

export interface GlideColumn {
  id: string;
  title: string;
  width?: number;
}

export interface GlideDataTableProps {
  columns: GlideColumn[];
  rows: GlideRow[];
  hiddenColumns?: Set<string>;
  rowStatus?: (row: GlideRow, index: number) => 'new' | 'modified' | 'deleted' | undefined;
  /** 自定义行底色，返回 CSS 颜色值；未提供时默认偶数行浅灰斑马纹 */
  getRowColor?: (row: GlideRow, index: number) => string | undefined;
  isCellModified?: (row: GlideRow, colId: string) => boolean;
  onSelectionChange?: (selectedRows: GlideRow[], gridSelection: GridSelection) => void;
  onColumnMoved?: (startIndex: number, endIndex: number) => void;
  onCellEdited?: (col: number, row: number, newValue: string) => void;
  onCellsEdited?: (edits: Array<{ col: number; row: number; value: string }>) => void;
  onCellContextMenu?: (col: number, row: number, bounds: { x: number; y: number }) => void;
  onHeaderClicked?: (colIndex: number) => void;
  onColumnResized?: (col: GridColumn, newWidth: number, colIndex: number) => void;
  onPaste?: (target: Item, values: readonly (readonly string[])[]) => boolean;
  onHeaderContextMenu?: (colIndex: number, bounds: { x: number; y: number }) => void;
  /** 设置后自动滚动到该行（索引基于可见行，不含 rowMarker） */
  scrollToRowIndex?: number;
  rowHeight?: number;
  headerHeight?: number;
  editable?: boolean;
  /** 启用查找替换功能（Ctrl+F / Cmd+F 打开查找栏） */
  enableFindReplace?: boolean;
  /** 外部控制查找栏显隐 */
  findReplaceVisible?: boolean;
  onFindReplaceVisibleChange?: (visible: boolean) => void;
}

const FILLER_COL_ID = '__filler__';

// 范围编辑的运行时状态，通过 React Context 注入到 InlineCellEditor。
// 每个 GlideDataTable 实例持有独立的一份，避免多实例互相污染。
interface RangeEditState {
  editingRange: { x: number; y: number; width: number; height: number } | null;
  liveRangeEditFn: ((value: string) => void) | null;
  wasLiveRangeEdit: boolean;
}

type RangeEditRef = MutableRefObject<RangeEditState>;

const RangeEditContext = createContext<RangeEditRef | null>(null);

function hexWithAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('#') && hex.length === 7) {
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return hex + a;
  }
  return hex;
}

export function buildGridColumns(columns: GlideColumn[], hiddenColumns: Set<string>): GridColumn[] {
  return columns
    .filter((col) => !hiddenColumns.has(col.id))
    .map((col) => ({
      id: col.id,
      title: col.title,
      width: col.width ?? 130,
    }));
}

export function valueToGridCell(value: unknown, editable: boolean): GridCell {
  if (typeof value === 'symbol') {
    return {
      kind: GridCellKind.Text,
      data: '',
      displayData: value.description ?? 'DEFAULT',
      allowOverlay: editable,
      readonly: !editable,
    };
  }
  if (value === true || value === false) {
    return {
      kind: GridCellKind.Boolean,
      data: value as boolean,
      allowOverlay: false,
      readonly: !editable,
      contentAlign: 'center',
    };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      kind: GridCellKind.Number,
      data: value,
      displayData: String(value),
      allowOverlay: editable,
      readonly: !editable,
    };
  }
  return {
    kind: GridCellKind.Text,
    data: value == null ? '' : String(value),
    displayData: value == null ? 'NULL' : String(value),
    allowOverlay: editable,
    readonly: !editable,
  };
}

const InlineCellEditor: ProvideEditorComponent<GridCell> = (p) => {
  const ref = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const committedRef = useRef(false);
  const hasFocusedRef = useRef(false);
  const tc = useThemeColors();
  const rangeEditRef = useContext(RangeEditContext);
  const cellData = (p.value as any).data;
  const targetKey = `${p.target.x},${p.target.y}`;
  const [prevKey, setPrevKey] = useState(targetKey);
  const [val, setVal] = useState(p.initialValue ?? String(cellData ?? ''));
  const valRef = useRef(val);
  valRef.current = val;

  if (prevKey !== targetKey) {
    setPrevKey(targetKey);
    committedRef.current = false;
    cancelledRef.current = false;
    hasFocusedRef.current = false;
    const newCellData = (p.value as any).data;
    const synced = p.initialValue ?? String(newCellData ?? '');
    valRef.current = synced;
    setVal(synced);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        hasFocusedRef.current = true;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // 进入编辑器时，如果是范围编辑，先把初始值铺满整个范围。
  // 只在 mounted 且未提交/未取消时执行一次（用 valRef 避免闭包捕获旧值）。
  const didInitialFillRef = useRef(false);
  useEffect(() => {
    if (didInitialFillRef.current) return;
    didInitialFillRef.current = true;
    const liveFn = rangeEditRef?.current.liveRangeEditFn;
    if (liveFn) liveFn(valRef.current);
  }, [rangeEditRef]);

  const commit = useCallback((v: string) => {
    if (committedRef.current || cancelledRef.current) return;
    committedRef.current = true;
    const kind = p.value.kind;
    let data: any;
    let displayData: string;
    if (kind === GridCellKind.Number) {
      data = v === '' ? undefined : Number(v);
      displayData = data == null ? 'NULL' : String(data);
    } else {
      data = v;
      displayData = v == null || v === '' ? 'NULL' : String(v);
    }
    p.onFinishedEditing({ ...(p.value as any), data, displayData } as any);
  }, [p, targetKey]);

  // 组件卸载时自动提交（兜底：onBlur 在卸载时可能不触发）
  // hasFocusedRef 用于区分 StrictMode 模拟卸载（focus 前的假卸载）和真实卸载。
  // 范围编辑状态只在真实卸载时清理，避免 StrictMode 双 mount 导致状态丢失。
  useLayoutEffect(() => {
    return () => {
      const isRealUnmount = hasFocusedRef.current;
      if (isRealUnmount && !committedRef.current && !cancelledRef.current) {
        commit(valRef.current);
      }
      if (isRealUnmount) {
        const rs = rangeEditRef?.current;
        if (rs && (rs.editingRange !== null || rs.liveRangeEditFn !== null || rs.wasLiveRangeEdit)) {
          rs.editingRange = null;
          rs.liveRangeEditFn = null;
          rs.wasLiveRangeEdit = false;
        }
      }
    };
  }, [rangeEditRef]);

  return (
    <input
      ref={ref}
      value={val}
      onChange={(e) => {
        setVal(e.target.value);
        rangeEditRef?.current.liveRangeEditFn?.(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.stopPropagation(); commit(val); }
        if (e.key === 'Escape') { e.stopPropagation(); cancelledRef.current = true; p.onFinishedEditing(); }
        if (e.key === 'Tab') { e.preventDefault(); commit(val); }
      }}
      onBlur={() => commit(val)}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      style={{
        position: 'absolute',
        left: 0, top: 0,
        width: p.target.width,
        height: p.target.height,
        border: 'none',
        outline: `1px solid ${tc.primary}`,
        outlineOffset: -1,
        padding: '0 8px',
        margin: 0,
        fontSize: 12,
        fontFamily: 'sans-serif',
        background: tc.backgroundCard,
        color: tc.textPrimary,
        caretColor: tc.textPrimary,
        boxSizing: 'border-box',
      }}
    />
  );
}

export function GlideDataTable({
  columns,
  rows,
  hiddenColumns,
  rowStatus,
  getRowColor,
  isCellModified,
  onSelectionChange,
  onColumnMoved,
  onCellEdited,
  onCellsEdited,
  onCellContextMenu,
  onHeaderClicked,
  onColumnResized,
  onPaste,
  onHeaderContextMenu,
  scrollToRowIndex,
  rowHeight = 24,
  headerHeight = 28,
  editable = false,
  enableFindReplace = false,
  findReplaceVisible: findReplaceVisibleProp,
  onFindReplaceVisibleChange,
}: GlideDataTableProps) {
  const tc = useThemeColors();
  const isDark = tc.isDark;
  const hiddenSet = hiddenColumns ?? new Set<string>();

  const theme = useMemo<Partial<Theme>>(
    () => buildGlideTheme(tc),
    [tc]
  );

  // 内部列顺序和宽度（仅在父组件未传回调时使用）
  const [internalColOrder, setInternalColOrder] = useState<string[] | null>(null);
  const [internalColWidths, setInternalColWidths] = useState<Record<string, number>>({});

  // 应用内部列重排和宽度
  const processedColumns = useMemo(() => {
    let result = columns;
    if (!onColumnMoved && internalColOrder) {
      const orderSet = new Set(internalColOrder);
      const reordered = internalColOrder
        .map((id) => columns.find((c) => c.id === id))
        .filter(Boolean) as GlideColumn[];
      result = [...reordered, ...columns.filter((c) => !orderSet.has(c.id))];
    }
    if (!onColumnResized) {
      result = result.map((c) => ({
        ...c,
        width: internalColWidths[c.id] ?? c.width,
      }));
    }
    return result;
  }, [columns, onColumnMoved, internalColOrder, onColumnResized, internalColWidths]);

  const gridColumns = useMemo<GridColumn[]>(
    () => buildGridColumns(processedColumns, hiddenSet),
    [processedColumns, hiddenSet]
  );

  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const emptyClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSelectionRef = useRef(gridSelection);
  currentSelectionRef.current = gridSelection;
  const lastRangeRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const gridRef = useRef<DataEditorRef>(null);
  const onCellsEditedRef = useRef(onCellsEdited);
  onCellsEditedRef.current = onCellsEdited;
  const gridColumnsRef = useRef(gridColumns);
  gridColumnsRef.current = gridColumns;
  // 范围编辑运行时状态，由本组件实例独占，通过 Context 注入到 InlineCellEditor。
  const rangeEditRef = useRef<RangeEditState>({
    editingRange: null,
    liveRangeEditFn: null,
    wasLiveRangeEdit: false,
  });

  // ===== Find/Replace =====
  const [findInternalVisible, setFindInternalVisible] = useState(false);
  const findVisible = findReplaceVisibleProp ?? findInternalVisible;
  const setFindVisible = useCallback((v: boolean) => {
    if (onFindReplaceVisibleChange) onFindReplaceVisibleChange(v);
    else setFindInternalVisible(v);
  }, [onFindReplaceVisibleChange]);

  const [findMatches, setFindMatches] = useState<FindMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const findOptionsRef = useRef<FindOptions>({ caseSensitive: false, useRegex: false, wholeWord: false });
  const findTextRef = useRef('');
  const findDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Ctrl+F / Cmd+F keyboard handler
  useEffect(() => {
    if (!enableFindReplace) return;
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setFindVisible(true);
      }
    };
    el.addEventListener('keydown', handler, { capture: true });
    return () => el.removeEventListener('keydown', handler, { capture: true });
  }, [enableFindReplace, setFindVisible]);

  // Scan rows/cells for matches (debounced 200ms)
  const doSearch = useCallback((searchText: string, options: FindOptions) => {
    if (!searchText) {
      setFindMatches([]);
      setCurrentMatchIndex(0);
      return;
    }
    const visibleCols = gridColumns.filter((c) => c.id !== FILLER_COL_ID);
    const results: FindMatch[] = [];
    try {
      let regex: RegExp | null = null;
      if (options.useRegex) {
        regex = new RegExp(searchText, options.caseSensitive ? '' : 'i');
      } else {
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
        regex = new RegExp(pattern, options.caseSensitive ? '' : 'i');
      }
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        for (let c = 0; c < visibleCols.length; c++) {
          const col = visibleCols[c];
          if (!col.id) continue;
          const value = row[col.id];
          const str = value == null ? '' : String(value);
          if (regex.test(str)) {
            // Map visible col index back to gridColumns index (accounting for filler)
            const gridColIdx = gridColumns.findIndex((gc) => gc.id === col.id);
            if (gridColIdx >= 0) {
              results.push({ row: r, col: gridColIdx });
            }
          }
        }
      }
    } catch {
      // Invalid regex, show no results
    }
    setFindMatches(results);
    setCurrentMatchIndex(results.length > 0 ? 0 : -1);
    // Scroll to first match
    if (results.length > 0) {
      gridRef.current?.scrollTo(results[0].col, results[0].row, 'both');
    }
  }, [rows, gridColumns]);

  const handleSearchChange = useCallback((searchText: string, options: FindOptions) => {
    findTextRef.current = searchText;
    findOptionsRef.current = options;
    if (findDebounceRef.current) clearTimeout(findDebounceRef.current);
    if (!searchText) {
      doSearch(searchText, options);
      return;
    }
    findDebounceRef.current = setTimeout(() => {
      doSearch(searchText, options);
    }, 200);
  }, [doSearch]);

  const handleFindNavigate = useCallback((direction: 'next' | 'prev') => {
    if (findMatches.length === 0) return;
    let nextIdx: number;
    if (direction === 'next') {
      nextIdx = (currentMatchIndex + 1) % findMatches.length;
    } else {
      nextIdx = (currentMatchIndex - 1 + findMatches.length) % findMatches.length;
    }
    setCurrentMatchIndex(nextIdx);
    const match = findMatches[nextIdx];
    gridRef.current?.scrollTo(match.col, match.row, 'both');
  }, [findMatches, currentMatchIndex]);

  const handleFindClose = useCallback(() => {
    setFindVisible(false);
    setFindMatches([]);
    setCurrentMatchIndex(0);
    findTextRef.current = '';
  }, [setFindVisible]);

  // Build a Set of matched cells for fast lookup in drawCell
  const matchSet = useMemo(() => {
    const s = new Set<string>();
    for (const m of findMatches) {
      s.add(`${m.col},${m.row}`);
    }
    return s;
  }, [findMatches]);

  // 自动滚动到指定行
  useEffect(() => {
    if (scrollToRowIndex != null && scrollToRowIndex >= 0 && gridRef.current) {
      // rowMarkerOffset=1：列 0 是行号，数据列从 1 开始
      requestAnimationFrame(() => {
        gridRef.current?.scrollTo(1, scrollToRowIndex, 'both', 0, 0);
      });
    }
  }, [scrollToRowIndex]);

  // ===== getCellContent =====
  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const gridCol = gridColumns[col];
      const colId = gridCol?.id;
      if (!colId || colId === FILLER_COL_ID) {
        return { kind: GridCellKind.Text as any, data: '', displayData: '', allowOverlay: false, readonly: true };
      }
      const rowItem = rows[row];
      const value = rowItem?.[colId];
      return valueToGridCell(value, editable);
    },
    [rows, gridColumns, editable]
  );

  // ===== drawHeader =====
  const drawHeader: DrawHeaderCallback = useCallback(
    (args, _drawContent) => {
      const { ctx, rect, column, isSelected, theme: t } = args;
      if (column.id === FILLER_COL_ID) return;
      const parts = (column.title || '').split('|');
      const name = parts[0] || '';
      const type = parts[1] || '';
      const isPk = parts[2] === '1';
      if (isSelected) {
        ctx.fillStyle = t.bgHeaderHasFocus;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
      ctx.fillStyle = tc.textPrimary;
      ctx.font = '600 12px sans-serif';
      ctx.fillText(name, rect.x + 8, rect.y + 16);
      const secondY = rect.y + 26;
      let secondX = rect.x + 8;
      if (isPk) {
        ctx.fillStyle = '#faad14';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('PK', secondX, secondY);
        secondX += 22;
      }
      if (type) {
        ctx.fillStyle = tc.textSecondary;
        ctx.font = '10px sans-serif';
        ctx.fillText(type, secondX, secondY);
      }
    },
    [tc, gridColumns]
  );

  // ===== drawCell =====
  const drawCell = useCallback(
    (args: any) => {
      const { cell, rect, ctx, theme: t, col, row: drawRow } = args;
      const gridCol = gridColumns[col];
      if (!gridCol?.id || gridCol.id === FILLER_COL_ID) return;
      const rowItem = rows[drawRow];
      if (!rowItem) return;
      const raw = cell as { displayData?: string; data?: unknown };
      const display = raw.displayData ?? '';
      const dataVal = raw.data;
      const status = rowStatus?.(rowItem, drawRow);

      ctx.textBaseline = 'middle';
      const centerY = rect.y + rect.height / 2;

      // 行底色：自定义颜色 > 状态背景 > 斑马纹
      const rowBg = getRowColor?.(rowItem, drawRow);
      if (rowBg) {
        ctx.fillStyle = rowBg;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      } else if (!status) {
        const stripeColor = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
        if (drawRow % 2 === 1) {
          ctx.fillStyle = stripeColor;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
      }
      // 状态背景（覆盖在斑马纹之上）
      if (status === 'new') { ctx.fillStyle = hexWithAlpha(tc.success, 0.08); ctx.fillRect(rect.x, rect.y, rect.width, rect.height); }
      else if (status === 'modified') { ctx.fillStyle = hexWithAlpha(tc.primary, 0.1); ctx.fillRect(rect.x, rect.y, rect.width, rect.height); }
      if (isCellModified?.(rowItem, gridCol.id)) { ctx.fillStyle = hexWithAlpha(tc.primary, 0.06); ctx.fillRect(rect.x, rect.y, rect.width, rect.height); }

      // Find/Replace match highlight
      const isCurrentMatch = findMatches.length > 0 && currentMatchIndex >= 0 && findMatches[currentMatchIndex]?.col === col && findMatches[currentMatchIndex]?.row === drawRow;
      const isAnyMatch = matchSet.has(`${col},${drawRow}`);
      if (isCurrentMatch) {
        ctx.fillStyle = hexWithAlpha(tc.warning, 0.35);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      } else if (isAnyMatch) {
        ctx.fillStyle = hexWithAlpha(tc.warning, 0.15);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }

      // 删除
      if (status === 'deleted') {
        ctx.fillStyle = t.textLight; ctx.font = '12px sans-serif';
        ctx.fillText(display || 'NULL', rect.x + 8, centerY);
        ctx.strokeStyle = t.textLight; ctx.beginPath(); ctx.moveTo(rect.x + 8, centerY);
        ctx.lineTo(rect.x + 8 + ctx.measureText(display || 'NULL').width, centerY); ctx.stroke();
        return;
      }
      // Bool
      if (cell.kind === GridCellKind.Boolean) {
        ctx.fillStyle = t.textDark; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(dataVal ? '✓' : '✗', rect.x + rect.width / 2, centerY); ctx.textAlign = 'start'; return;
      }
      // NULL
      if (display === 'NULL' || display === '') {
        ctx.fillStyle = t.textLight; ctx.font = 'italic 12px sans-serif'; ctx.fillText('NULL', rect.x + 8, centerY); return;
      }
      // 数值左对齐
      if (cell.kind === GridCellKind.Number || (typeof dataVal === 'number')) {
        ctx.fillStyle = t.textDark; ctx.font = '12px sans-serif';
        ctx.fillText(display, rect.x + 8, centerY); return;
      }
      // 文本
      ctx.fillStyle = t.textDark; ctx.font = '12px sans-serif'; ctx.fillText(display, rect.x + 8, centerY);
    },
    [gridColumns, rows, rowStatus, isCellModified, isDark, getRowColor, matchSet, findMatches, currentMatchIndex]
  );

  // ===== 选择变化 =====
  const handleSelectionChange = useCallback(
    (newSelection: GridSelection) => {
      if (emptyClickTimerRef.current !== null) {
        clearTimeout(emptyClickTimerRef.current);
        emptyClickTimerRef.current = null;
      }
      setGridSelection(newSelection);
      const range = newSelection.current?.range;
      if (range && range.width * range.height > 1) {
        lastRangeRef.current = { x: range.x, y: range.y, width: range.width, height: range.height };
      } else {
        lastRangeRef.current = null;
      }
      if (onSelectionChange) {
        const indices = newSelection.rows.toArray();
        onSelectionChange(indices.map((i) => rows[i]).filter(Boolean), newSelection);
      }
    },
    [rows, onSelectionChange]
  );

  // ===== 列拖拽 =====
  const handleColumnMoved = useCallback(
    (startIndex: number, endIndex: number) => {
      if (onColumnMoved) {
        onColumnMoved(startIndex, endIndex);
        return;
      }
      // 用 gridColumns 而非 columns prop 做索引映射，
      // 因为 DataEditor 的索引基于当前显示列（经过重排），
      // columns prop 始终是原始顺序，索引对不上会导致恢复。
      const visibleCols = gridColumns.filter((c) => c.id !== FILLER_COL_ID);
      const colId = visibleCols[startIndex]?.id;
      const targetId = visibleCols[endIndex]?.id;
      if (!colId || colId === targetId) return;
      setInternalColOrder((prev) => {
        const initOrder = () => columns.filter((c) => !hiddenSet.has(c.id)).map((c) => c.id);
        const cur = prev ? [...prev] : initOrder();
        const fromIdx = cur.indexOf(colId);
        if (fromIdx < 0) return cur;
        const toIdx = targetId ? cur.indexOf(targetId) : cur.length;
        // 如果列已在目标位置，跳过更新
        if (fromIdx === toIdx) return prev ?? cur;
        cur.splice(fromIdx, 1);
        if (targetId) {
          const adjustedToIdx = cur.indexOf(targetId);
          cur.splice(adjustedToIdx, 0, colId);
        } else {
          cur.push(colId);
        }
        return cur;
      });
    },
    [onColumnMoved, gridColumns, columns, hiddenSet]
  );

  // ===== 列宽调整 =====
  const handleColumnResized = useCallback(
    (col: GridColumn, newWidth: number, _colIndex: number) => {
      if (onColumnResized) {
        onColumnResized(col, newWidth, _colIndex);
        return;
      }
      setInternalColWidths((prev) => ({ ...prev, [col.id as string]: newWidth }));
    },
    [onColumnResized]
  );

  // ===== 空区域点击取消选择 =====
  const handleWrapperPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 只有点击 wrapper 本身（空白区域）时才清空，点击单元格时不处理
    if (e.target !== e.currentTarget) return;
    if (emptyClickTimerRef.current !== null) {
      clearTimeout(emptyClickTimerRef.current);
    }
    emptyClickTimerRef.current = setTimeout(() => {
      emptyClickTimerRef.current = null;
      const cur = currentSelectionRef.current;
      const hasSelection = cur.columns.toArray().length > 0 || cur.rows.toArray().length > 0;
      if (!hasSelection) return;
      const empty: GridSelection = {
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
      };
      setGridSelection(empty);
      if (onSelectionChange) {
        onSelectionChange([], empty);
      }
    }, 120);
  }, [onSelectionChange]);

  // ===== 编辑 =====
  // 注意：正常编辑流程由 handleCellsEdited 处理（Glide Data Grid 协议要求）。
  // 此回调仅在 Glide Data Grid 绕过 handleCellsEdited 直接调用时生效。
  const handleCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell) => {
      if (!onCellEdited || !editable) return;
      const gridCol = gridColumns[col];
      if (gridCol?.id === FILLER_COL_ID) return;
      const rawVal = typeof newValue === 'object' && newValue !== null ? (newValue as any).data : undefined;
      const hasVal = rawVal !== undefined && rawVal !== null;
      const val = hasVal ? String(rawVal) : (typeof newValue === 'object' && newValue !== null ? '' : String(newValue ?? ''));
      onCellEdited(col, row, String(val));
    },
    [onCellEdited, editable, gridColumns]
  );

  // ===== 范围编辑 =====
  // Glide Data Grid 编辑器提交时只传 1 个 cell，不传范围中所有 cell。
  // 因此用 lastRangeRef（选区变化时保存）来检测范围，将值填充到选区内所有可编辑单元格。
  const handleCellsEdited = useCallback(
    (newValues: readonly { location: Item; value: EditableGridCell }[]) => {
      const rs = rangeEditRef.current;
      rs.liveRangeEditFn = null;
      rs.editingRange = null;

      if (rs.wasLiveRangeEdit) {
        rs.wasLiveRangeEdit = false;
        lastRangeRef.current = null;
        return true;
      }

      if (!onCellsEdited || !editable) return false;

      const savedRange = lastRangeRef.current;
      const isRange = savedRange !== null && newValues.length === 1;

      const extractVal = (value: EditableGridCell) =>
        typeof value === 'object' && value !== null ? (value as any).data ?? '' : String(value ?? '');

      if (isRange) {
        lastRangeRef.current = null;
        const rawVal = extractVal(newValues[0].value);
        const edits: Array<{ col: number; row: number; value: string }> = [];
        for (let x = 0; x < savedRange.width; x++) {
          for (let y = 0; y < savedRange.height; y++) {
            const c = savedRange.x + x;
            const r = savedRange.y + y;
            if (gridColumns[c]?.id === FILLER_COL_ID) continue;
            edits.push({ col: c, row: r, value: String(rawVal) });
          }
        }
        if (edits.length === 0) return false;
        onCellsEdited(edits);
        return true;
      }

      if (onCellEdited && newValues.length <= 1) {
        const [{ location: [col, row], value }] = newValues;
        if (gridColumns[col]?.id === FILLER_COL_ID) return false;
        onCellEdited(col, row, String(extractVal(value)));
        return true;
      }
      const edits = newValues
        .map(({ location: [col, row], value }) => {
          if (gridColumns[col]?.id === FILLER_COL_ID) return null;
          return { col, row, value: String(extractVal(value)) };
        })
        .filter(Boolean) as Array<{ col: number; row: number; value: string }>;
      if (edits.length === 0) return false;
      onCellsEdited(edits);
      return true;
    },
    [onCellsEdited, onCellEdited, editable, gridColumns]
  );

  // ===== 自定义内联编辑器 =====
  const provideEditor: ProvideEditorCallback<GridCell> = useCallback((cell) => {
    if (cell.kind !== GridCellKind.Text && cell.kind !== GridCellKind.Number) return;
    const rs = rangeEditRef.current;
    if (rs.editingRange === null) {
      const savedRange = lastRangeRef.current;
      if (savedRange && onCellsEditedRef.current) {
        rs.editingRange = { x: savedRange.x, y: savedRange.y, width: savedRange.width, height: savedRange.height };
        rs.wasLiveRangeEdit = true;
        rs.liveRangeEditFn = (value: string) => {
          const range = rs.editingRange;
          if (!range) return;
          const cols = gridColumnsRef.current;
          const edits: Array<{ col: number; row: number; value: string }> = [];
          for (let x = 0; x < range.width; x++) {
            for (let y = 0; y < range.height; y++) {
              const c = range.x + x;
              const r = range.y + y;
              if (cols[c]?.id === FILLER_COL_ID) continue;
              edits.push({ col: c, row: r, value });
            }
          }
          if (edits.length > 0) onCellsEditedRef.current?.(edits);
        };
      }
    }
    return {
      editor: InlineCellEditor,
      disablePadding: true,
      disableStyling: true,
    };
  }, []);

  // ===== 右键菜单 =====
  const handleContextMenu = useCallback(
    (cell: Item, event: any) => {
      if (!onCellContextMenu) return;
      const gridCol = gridColumns[cell[0]];
      if (gridCol?.id === FILLER_COL_ID) return;
      event.preventDefault?.();
      // 优先用鼠标坐标，回退到 cell bounds 左上角
      const x = typeof event?.clientX === 'number' ? event.clientX : (event?.bounds?.x ?? 0);
      const y = typeof event?.clientY === 'number' ? event.clientY : (event?.bounds?.y ?? 0);
      onCellContextMenu(cell[0], cell[1], { x, y });
    },
    [onCellContextMenu, gridColumns]
  );

  return (
    <RangeEditContext.Provider value={rangeEditRef}>
      <div ref={wrapperRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }} onPointerDown={handleWrapperPointerDown}>
        {enableFindReplace && (
          <FindReplaceBar
            visible={findVisible}
            onClose={handleFindClose}
            matches={findMatches}
            currentMatchIndex={currentMatchIndex}
            onNavigate={handleFindNavigate}
            onSearchChange={handleSearchChange}
          />
        )}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <DataEditor
          ref={gridRef}
          width="100%"
          height="100%"
          columns={gridColumns}
          rows={rows.length}
          getCellContent={getCellContent}
          drawCell={drawCell}
          drawHeader={drawHeader}
          gridSelection={gridSelection}
          onGridSelectionChange={handleSelectionChange}
          onColumnMoved={handleColumnMoved}
          onColumnResize={handleColumnResized}
          onCellEdited={handleCellEdited}
          onCellsEdited={handleCellsEdited}
          onCellContextMenu={handleContextMenu}
          onHeaderClicked={onHeaderClicked}
          onHeaderContextMenu={(colIndex, event) => {
            if (!onHeaderContextMenu) return;
            // 优先用鼠标坐标，回退到 header cell bounds 左上角
            const ev = event as any;
            const x = typeof ev?.clientX === 'number' ? ev.clientX : (ev?.bounds?.x ?? 0);
            const y = typeof ev?.clientY === 'number' ? ev.clientY : (ev?.bounds?.y ?? 0);
            onHeaderContextMenu(colIndex, { x, y });
          }}
          theme={theme}
          headerHeight={headerHeight}
          rowHeight={rowHeight}
          rowMarkers="clickable-number"
          smoothScrollX
          smoothScrollY
          rangeSelect="rect"
          keybindings={{ search: !enableFindReplace, copy: true, paste: true, selectAll: true }}
          getCellsForSelection={true}
          onPaste={onPaste}
          provideEditor={provideEditor}
        />
        </div>
      </div>
    </RangeEditContext.Provider>
  );
}

export default GlideDataTable;