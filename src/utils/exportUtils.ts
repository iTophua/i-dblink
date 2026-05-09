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
 * 导出 JSON 文件
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
 * 导出 TXT 文件（制表符分隔）
 */
function escapeTxt(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('\t') || str.includes('\n') || str.includes('\r')) {
    return str.replace(/\t/g, ' ').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }
  return str;
}

export function exportToTXT(
  data: Record<string, unknown>[],
  columns?: { field: string; headerName?: string }[],
  options: ExportOptions = {}
) {
  if (data.length === 0) {
    throw new Error('没有数据可导出');
  }

  const { filename = 'export.txt' } = options;

  const fields = columns?.length
    ? columns
    : Object.keys(data[0]).map((f) => ({ field: f, headerName: f }));

  const header = fields.map((c) => escapeTxt(c.headerName || c.field)).join('\t');
  const body = data
    .map((row) => fields.map((c) => escapeTxt(row[c.field] ?? '')).join('\t'))
    .join('\n');

  const blob = new Blob(['\uFEFF' + header + '\n' + body], {
    type: 'text/plain;charset=utf-8;',
  });
  downloadBlob(blob, filename);
}

/**
 * 导出 XML 文件
 */
function escapeXml(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeXmlTag(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\u4e00-\u9fff.-]/g, '_');
}

export function exportToXML(
  data: Record<string, unknown>[],
  columns?: { field: string; headerName?: string }[],
  options: ExportOptions = {}
) {
  if (data.length === 0) {
    throw new Error('没有数据可导出');
  }

  const { filename = 'export.xml' } = options;

  const fields = columns?.length
    ? columns
    : Object.keys(data[0]).map((f) => ({ field: f, headerName: f }));

  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<data>'];
  for (const row of data) {
    lines.push('  <row>');
    for (const col of fields) {
      const tag = sanitizeXmlTag(col.field);
      const val = escapeXml(row[col.field] ?? '');
      lines.push(`    <${tag}>${val}</${tag}>`);
    }
    lines.push('  </row>');
  }
  lines.push('</data>');

  const blob = new Blob([lines.join('\n')], { type: 'application/xml;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/**
 * 导出 Markdown 表格文件
 */
function escapeMd(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

export function exportToMarkdown(
  data: Record<string, unknown>[],
  columns?: { field: string; headerName?: string }[],
  options: ExportOptions = {}
) {
  if (data.length === 0) {
    throw new Error('没有数据可导出');
  }

  const { filename = 'export.md' } = options;

  const fields = columns?.length
    ? columns
    : Object.keys(data[0]).map((f) => ({ field: f, headerName: f }));

  const headers = fields.map((c) => escapeMd(c.headerName || c.field));
  const headerLine = '| ' + headers.join(' | ') + ' |';
  const separatorLine = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const bodyLines = data.map(
    (row) => '| ' + fields.map((c) => escapeMd(row[c.field] ?? '')).join(' | ') + ' |'
  );

  const blob = new Blob(['\uFEFF' + [headerLine, separatorLine, ...bodyLines].join('\n')], {
    type: 'text/markdown;charset=utf-8;',
  });
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
