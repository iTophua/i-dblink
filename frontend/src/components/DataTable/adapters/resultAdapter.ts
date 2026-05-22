/**
 * GlideDataTable 适配器 —— SQL 查询结果（ResultGrid）场景
 *
 * 将 string[] 列名 → GlideColumn[]，unknown[][] 行数据 → GlideRow[]，
 * 并提供 rowStatus / isCellModified 回调。
 */
import type { GlideColumn, GlideRow } from '../GlideDataTable';

// ============================================================
// 转换函数
// ============================================================

/** string[] 列名 → GlideColumn[] */
export function namesToGlideColumns(columnNames: string[]): GlideColumn[] {
  return columnNames.map((name) => ({
    id: name,
    title: name,
  }));
}

/** unknown[][] 行数据 → GlideRow[]，列名作为 key */
export function rowsToGlideRows(
  rawRows: unknown[][],
  columnNames: string[]
): GlideRow[] {
  return rawRows.map((row) => {
    const out: GlideRow = {};
    columnNames.forEach((col, i) => {
      out[col] = row[i];
    });
    return out;
  });
}

// ============================================================
// 回调解耦
// ============================================================

/** 行状态回调（查询结果用 internal 字段） */
export const resultRowStatus = (
  row: GlideRow,
  _index: number
): 'new' | 'modified' | 'deleted' | undefined => {
  const status = row.__status as string | undefined;
  if (status === 'new' || status === 'modified' || status === 'deleted') return status;
  return undefined;
};

/** 单元格是否被修改（查询结果场景需要传入 modifiedRows Map） */
export function createResultCellModified(
  modifiedRows: Map<number, unknown[]>,
  columnNames: string[]
): (row: GlideRow, colId: string) => boolean {
  return (row: GlideRow, colId: string): boolean => {
    const rowId = row.__id as number;
    if (typeof rowId !== 'number') return false;
    const modified = modifiedRows.get(rowId);
    if (!modified) return false;
    const colIndex = columnNames.indexOf(colId);
    if (colIndex < 0) return false;
    return modified[colIndex] !== undefined;
  };
}
