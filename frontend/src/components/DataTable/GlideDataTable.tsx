/**
 * GlideDataTable — 基于 Glide Data Grid 的通用数据表格组件
 */
import { useMemo, useCallback, useState } from 'react';
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
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useThemeColors } from '../../hooks/useThemeColors';
import { lightGlideTheme, darkGlideTheme } from './glide-theme';

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
  isCellModified?: (row: GlideRow, colId: string) => boolean;
  onSelectionChange?: (selectedRows: GlideRow[], gridSelection: GridSelection) => void;
  onColumnMoved?: (startIndex: number, endIndex: number) => void;
  onCellEdited?: (col: number, row: number, newValue: string) => void;
  onCellContextMenu?: (col: number, row: number, bounds: DOMRect) => void;
  onHeaderClicked?: (colIndex: number) => void;
  onColumnResized?: (col: GridColumn, newWidth: number) => void;
  rowHeight?: number;
  headerHeight?: number;
  editable?: boolean;
}

export function buildGridColumns(columns: GlideColumn[], hiddenColumns: Set<string>): GridColumn[] {
  return columns
    .filter((col) => !hiddenColumns.has(col.id))
    .map((col) => ({
      id: col.id,
      title: col.title,
      width: col.width ?? 130,
      grow: 1,
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
      allowOverlay: false,
      readonly: !editable,
    };
  }
  return {
    kind: GridCellKind.Text,
    data: value == null ? '' : String(value),
    displayData: value == null ? 'NULL' : String(value),
    allowOverlay: false,
    readonly: !editable,
  };
}

export function GlideDataTable({
  columns,
  rows,
  hiddenColumns,
  rowStatus,
  isCellModified,
  onSelectionChange,
  onColumnMoved,
  onCellEdited,
  onCellContextMenu,
  onHeaderClicked,
  onColumnResized,
  rowHeight = 24,
  headerHeight = 28,
  editable = false,
}: GlideDataTableProps) {
  const tc = useThemeColors();
  const isDark = tc.isDark;
  const hiddenSet = hiddenColumns ?? new Set<string>();

  const theme = useMemo<Partial<Theme>>(
    () => (isDark ? darkGlideTheme : lightGlideTheme),
    [isDark]
  );

  const gridColumns = useMemo<GridColumn[]>(
    () => buildGridColumns(columns, hiddenSet),
    [columns, hiddenSet]
  );

  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });

  // ===== getCellContent =====
  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const gridCol = gridColumns[col];
      const colId = gridCol?.id;
      if (!colId) {
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
    (args) => {
      const { ctx, rect, column, isSelected, theme: t } = args;
      const parts = (column.title || '').split('|');
      const name = parts[0] || '';
      const type = parts[1] || '';
      const isPk = parts[2] === '1';
      const colIdx = gridColumns.findIndex((c) => c.id === column.id);
      // 选中背景
      if (isSelected) {
        ctx.fillStyle = isDark ? 'rgba(24,144,255,0.15)' : 'rgba(24,144,255,0.08)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
      // 列名
      ctx.fillStyle = t.textDark || '#0f0f0f';
      ctx.font = '600 12px sans-serif';
      ctx.fillText(name, rect.x + 8, rect.y + 16);
      // 类型 + PK（第二行）
      const secondY = rect.y + 26;
      let secondX = rect.x + 8;
      if (isPk) {
        ctx.fillStyle = '#faad14';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('PK', secondX, secondY);
        secondX += 22;
      }
      if (type) {
        ctx.fillStyle = t.textLight || '#8c8c8c';
        ctx.font = '10px sans-serif';
        ctx.fillText(type, secondX, secondY);
      }
      // 最后一列右侧边框
      if (colIdx === gridColumns.length - 1) {
        ctx.strokeStyle = t.borderColor || (isDark ? '#303030' : '#d9d9d9');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.width, rect.y);
        ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
        ctx.stroke();
      }
      return false;
    },
    [isDark, gridColumns]
  );

  // ===== drawCell =====
  const drawCell = useCallback(
    (args: any) => {
      const { cell, rect, ctx, theme: t, col, row: drawRow } = args;
      const gridCol = gridColumns[col];
      if (!gridCol?.id) return;
      const rowItem = rows[drawRow];
      if (!rowItem) return;
      const raw = cell as { displayData?: string; data?: unknown };
      const display = raw.displayData ?? '';
      const dataVal = raw.data;
      const status = rowStatus?.(rowItem, drawRow);

      // 背景
      if (status === 'new') { ctx.fillStyle = 'rgba(82, 196, 26, 0.08)'; ctx.fillRect(rect.x, rect.y, rect.width, rect.height); }
      else if (status === 'modified') { ctx.fillStyle = 'rgba(24, 144, 255, 0.1)'; ctx.fillRect(rect.x, rect.y, rect.width, rect.height); }
      if (isCellModified?.(rowItem, gridCol.id)) { ctx.fillStyle = 'rgba(24, 144, 255, 0.06)'; ctx.fillRect(rect.x, rect.y, rect.width, rect.height); }

      const tx = rect.x + 8, ty = rect.y + 16;

      // 最后一列右侧边框（在所有绘制之前，避免被 early return 跳过）
      if (col === gridColumns.length - 1) {
        ctx.strokeStyle = t.borderColor || (isDark ? '#303030' : '#d9d9d9');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.width, rect.y);
        ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
        ctx.stroke();
      }

      // 删除
      if (status === 'deleted') {
        ctx.fillStyle = t.textLight; ctx.font = '12px sans-serif';
        ctx.fillText(display || 'NULL', tx, ty);
        ctx.strokeStyle = t.textLight; ctx.beginPath(); ctx.moveTo(tx, rect.y + rect.height / 2);
        ctx.lineTo(tx + ctx.measureText(display || 'NULL').width, rect.y + rect.height / 2); ctx.stroke();
        return;
      }
      // Bool
      if (cell.kind === GridCellKind.Boolean) {
        ctx.fillStyle = t.textDark; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(dataVal ? '✓' : '✗', rect.x + rect.width / 2, ty); ctx.textAlign = 'start'; return;
      }
      // NULL
      if (display === 'NULL' || display === '') {
        ctx.fillStyle = t.textLight; ctx.font = 'italic 12px sans-serif'; ctx.fillText('NULL', tx, ty); return;
      }
      // 数值左对齐
      if (cell.kind === GridCellKind.Number || (typeof dataVal === 'number')) {
        ctx.fillStyle = t.textDark; ctx.font = '12px sans-serif';
        ctx.fillText(display, rect.x + 8, ty); return;
      }
      // 文本
      ctx.fillStyle = t.textDark; ctx.font = '12px sans-serif'; ctx.fillText(display, tx, ty);
    },
    [gridColumns, rows, rowStatus, isCellModified, isDark]
  );

  // ===== 选择变化 =====
  const handleSelectionChange = useCallback(
    (newSelection: GridSelection) => {
      setGridSelection(newSelection);
      if (onSelectionChange) {
        const indices = newSelection.rows.toArray();
        onSelectionChange(indices.map((i) => rows[i]).filter(Boolean), newSelection);
      }
    },
    [rows, onSelectionChange]
  );

  // ===== 编辑 =====
  const handleCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell) => {
      if (!onCellEdited || !editable) return;
      const val = typeof newValue === 'object' && newValue !== null ? (newValue as any).data ?? '' : String(newValue ?? '');
      onCellEdited(col, row, String(val));
    },
    [onCellEdited, editable]
  );

  // ===== 右键菜单 =====
  const handleContextMenu = useCallback(
    (cell: Item, event: any) => {
      if (!onCellContextMenu) return;
      const bounds = event?.bounds ?? { left: 0, top: 0 };
      onCellContextMenu(cell[0], cell[1], bounds);
    },
    [onCellContextMenu]
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <DataEditor
        columns={gridColumns}
        rows={rows.length}
        getCellContent={getCellContent}
        drawCell={drawCell}
        drawHeader={drawHeader}
        gridSelection={gridSelection}
        onGridSelectionChange={handleSelectionChange}
        onColumnMoved={onColumnMoved}
        onColumnResize={onColumnResized ? (col, newWidth, colIndex) => onColumnResized(col, newWidth, colIndex) : undefined}
        onCellEdited={handleCellEdited}
        onCellContextMenu={handleContextMenu}
        onHeaderClicked={onHeaderClicked}
        onColumnResized={onColumnResized ? (col, newWidth, colIndex) => onColumnResized(col, newWidth, colIndex) : undefined}
        theme={theme}
        headerHeight={headerHeight}
        rowHeight={rowHeight}
        rowMarkers="clickable-number"
        smoothScrollX
        smoothScrollY
        rangeSelect="rect"
        keybindings={{ search: true, copy: true }}
      />
    </div>
  );
}

export default GlideDataTable;