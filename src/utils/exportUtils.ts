/**
 * Excel 导出工具
 * 基于 SheetJS (xlsx) 实现 CSV/JSON/Excel 导出
 */
import * as XLSX from 'xlsx';

export interface ExportOptions {
  filename?: string;
  sheetName?: string;
}

/**
 * 将数据导出为 Excel (.xlsx) 文件
 * @param data 数据数组
 * @param columns 列定义（可选，用于控制列顺序和标题）
 * @param options 导出选项
 */
export function exportToExcel(
  data: Record<string, any>[],
  columns?: { field: string; headerName?: string }[],
  options: ExportOptions = {}
) {
  if (data.length === 0) {
    throw new Error('没有数据可导出');
  }

  const { filename = 'export.xlsx', sheetName = 'Sheet1' } = options;

  // 如果有列定义，按列定义顺序和标题导出
  let exportData = data;
  if (columns && columns.length > 0) {
    exportData = data.map((row) => {
      const newRow: Record<string, any> = {};
      columns.forEach((col) => {
        const header = col.headerName || col.field;
        newRow[header] = row[col.field] ?? '';
      });
      return newRow;
    });
  }

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/**
 * 将数据导出为 CSV 文件
 * @param data 数据数组
 * @param columns 列定义（可选）
 * @param options 导出选项
 */
export function exportToCSV(
  data: Record<string, any>[],
  columns?: { field: string; headerName?: string }[],
  options: ExportOptions = {}
) {
  if (data.length === 0) {
    throw new Error('没有数据可导出');
  }

  const { filename = 'export.csv' } = options;

  let exportData = data;
  if (columns && columns.length > 0) {
    exportData = data.map((row) => {
      const newRow: Record<string, any> = {};
      columns.forEach((col) => {
        const header = col.headerName || col.field;
        newRow[header] = row[col.field] ?? '';
      });
      return newRow;
    });
  }

  const ws = XLSX.utils.json_to_sheet(exportData);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/**
 * 将数据导出为 JSON 文件
 * @param data 数据数组
 * @param options 导出选项
 */
export function exportToJSON(data: Record<string, any>[], options: ExportOptions = {}) {
  if (data.length === 0) {
    throw new Error('没有数据可导出');
  }

  const { filename = 'export.json' } = options;
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/**
 * 下载 Blob 文件
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
