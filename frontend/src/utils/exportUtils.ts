/**
 * Excel 导出工具
 * 基于 SheetJS (xlsx) 实现 CSV/JSON/Excel 导出
 */
import * as XLSX from 'xlsx';
import { Modal } from 'antd';
import { appModal } from './appModal';

export interface ExportOptions {
  filename?: string;
  sheetName?: string;
  chunkSize?: number; // 分块处理大小，用于大数据集
}

/**
 * 将数据导出为 Excel (.xlsx) 文件 - 优化版本支持大数据集
 * @param data 数据数组
 * @param columns 列定义（可选，用于控制列顺序和标题）
 * @param options 导出选项
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  columns?: { field: string; headerName?: string }[],
  options: ExportOptions = {}
) {
  if (data.length === 0) {
    throw new Error('没有数据可导出');
  }

  const { filename = 'export.xlsx', sheetName = 'Sheet1', chunkSize = 5000 } = options;

  // 如果数据量很大，使用分块处理
  if (data.length > chunkSize) {
    return exportLargeExcel(data, columns, { filename, sheetName, chunkSize });
  }

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
 * 处理大数据集的 Excel 导出（分块处理）
 */
function exportLargeExcel(
  data: Record<string, unknown>[],
  columns?: { field: string; headerName?: string }[],
  options: ExportOptions = {}
) {
  const { filename = 'export.xlsx', chunkSize = 5000 } = options;
  
  // 显示进度提示
  showExportProgress(0, data.length);
  
  // 如果有列定义，先处理列映射
  let columnMapping: Record<string, string> = {};
  if (columns && columns.length > 0) {
    columnMapping = {};
    columns.forEach((col) => {
      const header = col.headerName || col.field;
      columnMapping[col.field] = header;
    });
  }

  // 分块处理数据
  const chunks: Record<string, any>[][] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    
    // 应用列映射
    const processedChunk = columnMapping ? 
      chunk.map(row => {
        const newRow: Record<string, any> = {};
        Object.keys(columnMapping).forEach(field => {
          newRow[columnMapping[field]] = row[field] ?? '';
        });
        return newRow;
      }) : chunk;
    
    chunks.push(processedChunk);
    
    // 更新进度
    showExportProgress(Math.min(i + chunkSize, data.length), data.length);
  }

  // 创建工作簿
  const wb = XLSX.utils.book_new();
  
  // 为每个分块创建工作表（如果只有一个分块，使用指定名称）
  chunks.forEach((chunk, index) => {
    const ws = XLSX.utils.json_to_sheet(chunk);
    const sheetName = chunks.length === 1 ? (options?.sheetName || 'Sheet1') : `${options?.sheetName || 'Sheet1'}_${index + 1}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, filename);
  
  // 完成进度
  hideExportProgress();
}

/**
 * 将数据导出为 CSV 文件 - 优化版本支持大数据集
 * @param data 数据数组
 * @param columns 列定义（可选）
 * @param options 导出选项
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  columns?: { field: string; headerName?: string }[],
  options: ExportOptions = {}
) {
  if (data.length === 0) {
    throw new Error('没有数据可导出');
  }

  const { filename = 'export.csv', chunkSize = 10000 } = options;

  // 如果数据量很大，使用流式处理
  if (data.length > chunkSize) {
    return exportLargeCSV(data, columns, { filename, chunkSize });
  }

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
 * 流式处理大数据集的 CSV 导出
 */
function exportLargeCSV(
  data: Record<string, unknown>[],
  columns?: { field: string; headerName?: string }[],
  options: ExportOptions = {}
) {
  const { filename = 'export.csv', chunkSize = 10000 } = options;
  
  // 显示进度提示
  showExportProgress(0, data.length);
  
  // 如果有列定义，先处理列映射
  let columnMapping: Record<string, string> = {};
  let headers: string[] = [];
  if (columns && columns.length > 0) {
    columnMapping = {};
    headers = columns.map(col => col.headerName || col.field);
    columns.forEach((col) => {
      columnMapping[col.field] = col.headerName || col.field;
    });
  } else {
    headers = Object.keys(data[0]);
  }

  // 创建 CSV 内容
  const csvContent: string[] = [];
  
  // 添加标题行
  csvContent.push(headers.join(','));
  
  // 分块处理数据行
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    
    // 处理当前块的数据行
    const chunkRows = chunk.map(row => {
      return headers.map(header => {
        const value = row[columnMapping[header]] ?? '';
        // CSV 特殊字符处理
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });
    
    csvContent.push(...chunkRows);
    
    // 更新进度
    showExportProgress(Math.min(i + chunkSize, data.length), data.length);
  }

  // 创建并下载文件
  const blob = new Blob(['\uFEFF' + csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
  
  // 完成进度
  hideExportProgress();
}

/**
 * 导出 JSON 文件 - 优化版本支持大数据集
 * @param data 数据数组
 * @param options 导出选项
 */
export function exportToJSON(data: Record<string, unknown>[], options: ExportOptions = {}) {
  if (data.length === 0) {
    throw new Error('没有数据可导出');
  }

  const { filename = 'export.json', chunkSize = 5000 } = options;

  // 如果数据量很大，使用流式处理
  if (data.length > chunkSize) {
    return exportLargeJSON(data, { filename, chunkSize });
  }

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/**
 * 流式处理大数据集的 JSON 导出
 */
function exportLargeJSON(
  data: Record<string, unknown>[],
  options: ExportOptions = {}
) {
  const { filename = 'export.json', chunkSize = 5000 } = options;
  
  // 显示进度提示
  showExportProgress(0, data.length);
  
  // 创建 JSON 内容流式处理
  const jsonContent: string[] = ['['];
  let isFirst = true;
  
  // 分块处理数据
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    
    // 处理当前块的 JSON
    const chunkJson = chunk.map(row => JSON.stringify(row)).join(',');
    
    if (!isFirst) {
      jsonContent.push(',');
    }
    jsonContent.push(chunkJson);
    isFirst = false;
    
    // 更新进度
    showExportProgress(Math.min(i + chunkSize, data.length), data.length);
  }
  
  jsonContent.push(']');
  
  // 创建并下载文件
  const blob = new Blob([jsonContent.join('')], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, filename);
  
  // 完成进度
  hideExportProgress();
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

/**
 * 导出进度管理
 */
let progressModal: ReturnType<typeof Modal.confirm> | null = null;
let progressTimer: NodeJS.Timeout | null = null;

function showExportProgress(current: number, total: number) {
  // 清除之前的定时器
  if (progressTimer) {
    clearTimeout(progressTimer);
    progressTimer = null;
  }
  
  // 计算进度百分比
  const percent = Math.round((current / total) * 100);
  
  // 使用 ant Modal 显示进度
  if (typeof Modal !== 'undefined') {
    if (!progressModal) {
      progressModal = appModal.confirm({
        title: '导出进度',
        content: `正在处理数据... ${current}/${total} (${percent}%)`,
        okText: '等待',
        cancelText: '取消',
        keyboard: false,
        mask: true,
        maskClosable: false,
        closable: false,
      });
    } else {
      // 更新进度内容
      progressModal.update({
        content: `正在处理数据... ${current}/${total} (${percent}%)`,
      });
    }
  } else {
    // 如果没有 ant Modal，使用控制台输出
    console.log(`导出进度: ${current}/${total} (${percent}%)`);
  }
}

function hideExportProgress() {
  if (progressTimer) {
    clearTimeout(progressTimer);
    progressTimer = null;
  }
  
  if (progressModal) {
    progressModal.destroy();
    progressModal = null;
  }
}

/**
 * 取消导出进度
 */
export function cancelExportProgress() {
  hideExportProgress();
}
