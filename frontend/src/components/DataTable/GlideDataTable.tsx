/**
 * GlideDataTable — 基于 Glide Data Grid 的通用数据表格组件
 */
import { useMemo, useCallback, useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  /** 设置后自动滚动到该行（索引基于可见行，不含 rowMarker） */
  scrollToRowIndex?: number;
  rowHeight?: number;
  headerHeight?: number;
  editable?: boolean;
}

const FILLER_COL_ID = '__filler__';

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
  const cellData = (p.value as any).data;
  const [val, setVal] = useState(p.initialValue ?? String(cellData ?? ''));
  const valRef = useRef(val);
  valRef.current = val;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        hasFocusedRef.current = true;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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
  }, [p]);

  // 组件卸载时自动提交（兜底：onBlur 在卸载时可能不触发）
  // hasFocusedRef 用于区分 StrictMode 模拟卸载和真实卸载
  useLayoutEffect(() => {
    return () => {
      if (hasFocusedRef.current && !committedRef.current && !cancelledRef.current) {
        commit(valRef.current);
      }
    };
  }, []);

  return (
    <input
      ref={ref}
      value={val}
      onChange={(e) => setVal(e.target.value)}
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
  scrollToRowIndex,
  rowHeight = 24,
  headerHeight = 28,
  editable = false,
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
  const gridRef = useRef<DataEditorRef>(null);

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
    [gridColumns, rows, rowStatus, isCellModified, isDark, getRowColor]
  );

  // ===== 选择变化 =====
  const handleSelectionChange = useCallback(
    (newSelection: GridSelection) => {
      if (emptyClickTimerRef.current !== null) {
        clearTimeout(emptyClickTimerRef.current);
        emptyClickTimerRef.current = null;
      }
      setGridSelection(newSelection);
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

      const numCols = gridColumns.length;
      const cells: { cell: Item }[] = [];
      for (let c = 0; c < numCols; c++) {
        cells.push({ cell: [c, row] });
      }
      requestAnimationFrame(() => {
        gridRef.current?.updateCells(cells);
      });
    },
    [onCellEdited, editable, gridColumns]
  );

  // ===== 范围编辑 =====
  // Glide Data Grid 内部协议：先调 onCellsEdited，若返回 true 则不再调 onCellEdited。
  // 因此单 cell 编辑必须在此主动调用 onCellEdited（更新 React state），
  // 然后返回 true 阻止 Glide Data Grid 重复调用。
  const handleCellsEdited = useCallback(
    (newValues: readonly { location: Item; value: EditableGridCell }[]) => {
      if (!onCellsEdited || !editable) return false;

      if (onCellEdited && newValues.length <= 1) {
        const [{ location: [col, row], value }] = newValues;
        if (gridColumns[col]?.id === FILLER_COL_ID) return false;
        const v = typeof value === 'object' && value !== null ? (value as any).data ?? '' : String(value ?? '');
        onCellEdited(col, row, String(v));

        // 标记整行为脏（rAF 延迟：等待 React setRowData 批处理完成）
        const numCols = gridColumns.length;
        const cells: { cell: Item }[] = [];
        for (let c = 0; c < numCols; c++) {
          cells.push({ cell: [c, row] });
        }
        requestAnimationFrame(() => {
          gridRef.current?.updateCells(cells);
        });
        return true;
      }
      const edits = newValues
        .map(({ location: [col, row], value }) => {
          if (gridColumns[col]?.id === FILLER_COL_ID) return null;
          const v = typeof value === 'object' && value !== null ? (value as any).data ?? '' : String(value ?? '');
          return { col, row, value: String(v) };
        })
        .filter(Boolean) as Array<{ col: number; row: number; value: string }>;
      if (edits.length === 0) return false;
      onCellsEdited(edits);

      // 批量标记受影响的行（去重）为脏，确保同行其他列也刷新，
      // 必须用 rAF 延迟：等待 React 批处理状态更新完成。
      const damagedRows = new Set<number>();
      const cells: { cell: Item }[] = [];
      const numCols = gridColumns.length;
      for (const edit of edits) {
        if (!damagedRows.has(edit.row)) {
          damagedRows.add(edit.row);
          for (let c = 0; c < numCols; c++) {
            cells.push({ cell: [c, edit.row] });
          }
        }
      }
      requestAnimationFrame(() => {
        gridRef.current?.updateCells(cells);
      });

      return true;
    },
    [onCellsEdited, editable, gridColumns]
  );

  // ===== 自定义内联编辑器 =====
  const provideEditor: ProvideEditorCallback<GridCell> = useCallback((cell) => {
    if (cell.kind !== GridCellKind.Text && cell.kind !== GridCellKind.Number) return;
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
      const pos = event?.bounds ?? { x: 0, y: 0 };
      onCellContextMenu(cell[0], cell[1], { x: pos.x, y: pos.y });
    },
    [onCellContextMenu, gridColumns]
  );

  return (
    <div style={{ position: 'absolute', inset: 0 }} onPointerDown={handleWrapperPointerDown}>
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
        theme={theme}
        headerHeight={headerHeight}
        rowHeight={rowHeight}
        rowMarkers="clickable-number"
        smoothScrollX
        smoothScrollY
        rangeSelect="rect"
        keybindings={{ search: true, copy: true }}
        provideEditor={provideEditor}
      />
    </div>
  );
}

export default GlideDataTable;