/**
 * GlideDataTable 适配器 —— 表数据浏览（DataTable）场景
 *
 * 将 ColumnInfo[] → GlideColumn[]，RowData[] → GlideRow[]，
 * 并提供 rowStatus / isCellModified 回调。
 */
import type { GlideColumn, GlideRow } from '../GlideDataTable';
import type { ColumnInfo } from '../../../types/api';
import type { RowData } from '../utils';

// ============================================================
// 转换函数
// ============================================================

/** ColumnInfo[] → GlideColumn[] */
export function columnsToGlideColumns(columnInfos: ColumnInfo[]): GlideColumn[] {
  return columnInfos.map((col) => ({
    id: col.column_name,
    title: col.column_name,
  }));
}

/** RowData[] → GlideRow[] */
export function rowsToGlideRows(
  rowData: RowData[],
  columnInfos: ColumnInfo[]
): GlideRow[] {
  return rowData.map((row) => {
    const out: GlideRow = { ...row };
    // 确保内部字段透传（__row_id__, __status__, __original_data__）
    return out;
  });
}

// ============================================================
// 回调解耦
// ============================================================

/** 行状态回调 */
export const tableRowStatus = (
  row: GlideRow,
  _index: number
): 'new' | 'modified' | 'deleted' | undefined => {
  const status = row.__status__ as string | undefined;
  if (status === 'new' || status === 'modified' || status === 'deleted') return status;
  return undefined;
};

/** 单元格是否被修改 */
export const tableCellModified = (row: GlideRow, colId: string): boolean => {
  const status = row.__status__ as string | undefined;
  if (status === 'new') return true; // 新行所有字段都是"修改过的"
  if (status === 'deleted') return false;
  const original = row.__original_data__ as Record<string, unknown> | undefined;
  if (!original) return false;
  return original[colId] !== (row as Record<string, unknown>)[colId];
};