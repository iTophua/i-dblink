import { useState, useMemo, useCallback, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Button, Space, Empty, Tooltip, Tag, Modal, App, Form, Input, Dropdown } from 'antd';
import {
  DeleteOutlined,
  SaveOutlined,
  UndoOutlined,
  CodeOutlined,
  ExclamationCircleOutlined,
  CopyOutlined,
  PlusOutlined,
  DownloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../../hooks/useApi';
import type { QueryResult, DatabaseType, ColumnInfo } from '../../types/api';
import { exportToExcel } from '../../utils/exportUtils';
import { escapeSqlValue, escapeSqlIdentifier } from '../../utils/sqlUtils';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface QueryResultWithTiming extends QueryResult {
  executionTime?: number;
}

export interface ResultGridProps {
  queryResult: QueryResultWithTiming;
  isDark: boolean;
  executionTime?: number;
  connectionId?: string;
  database?: string;
  originalSql?: string;
  dbType?: DatabaseType;
}

/** 从简单 SELECT 语句中提取单表名，遇到 JOIN/UNION/子查询返回 null */
function extractSingleTableName(sql: string): string | null {
  const clean = sql
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释
    .replace(/--.*$/gm, '') // 行注释
    .trim();

  // 排除复杂查询
  if (/\bJOIN\b|\bUNION\b|\bINTO\b|(?:\()\s*SELECT\b/i.test(clean)) {
    return null;
  }

  const match = clean.match(
    /\bFROM\s+(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?(?:\s+(?:AS\s+)?\w+)?(?:\s*$|\s+(?:WHERE|ORDER|GROUP|HAVING|LIMIT|OFFSET)\b)/i
  );
  if (!match) return null;
  return match[2] || match[1] || null;
}

function generateInsertSql(
  tableName: string,
  columns: string[],
  rows: unknown[][],
  dbType?: DatabaseType
): string {
  const tableRef = escapeSqlIdentifier(tableName, dbType);
  const colStr = columns.map((c) => escapeSqlIdentifier(c, dbType)).join(', ');
  const values = rows.map((row) => `(${row.map(escapeSqlValue).join(', ')})`).join(',\n');
  return `INSERT INTO ${tableRef} (${colStr})\nVALUES\n${values};`;
}

function generateUpdateSql(
  tableName: string,
  columns: string[],
  row: unknown[],
  pkCol: string,
  pkIdx: number,
  dbType?: DatabaseType
): string {
  const tableRef = escapeSqlIdentifier(tableName, dbType);
  const setters = columns
    .map((col, i) => `${escapeSqlIdentifier(col, dbType)} = ${escapeSqlValue(row[i])}`)
    .filter((_, i) => i !== pkIdx)
    .join(', ');
  return `UPDATE ${tableRef} SET ${setters} WHERE ${escapeSqlIdentifier(pkCol, dbType)} = ${escapeSqlValue(row[pkIdx])};`;
}

function generateDeleteSql(
  tableName: string,
  pkCol: string,
  pkValues: unknown[],
  dbType?: DatabaseType
): string {
  const tableRef = escapeSqlIdentifier(tableName, dbType);
  const values = pkValues.map(escapeSqlValue).join(', ');
  return `DELETE FROM ${tableRef} WHERE ${escapeSqlIdentifier(pkCol, dbType)} IN (${values});`;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportToCsv(columns: string[], rows: unknown[][]): string {
  const escape = (val: unknown) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = columns.map(escape).join(',');
  const body = rows.map((row) => row.map(escape).join(',')).join('\n');
  return `${header}\n${body}`;
}

function exportToJson(columns: string[], rows: unknown[][]): string {
  const objs = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
  return JSON.stringify(objs, null, 2);
}

function escapeTxt(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('\t') || str.includes('\n') || str.includes('\r')) {
    return str.replace(/\t/g, ' ').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }
  return str;
}

function exportToTxt(columns: string[], rows: unknown[][]): string {
  const header = columns.map(escapeTxt).join('\t');
  const body = rows.map((row) => row.map(escapeTxt).join('\t')).join('\n');
  return '\uFEFF' + header + '\n' + body;
}

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

function exportToXml(columns: string[], rows: unknown[][]): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<data>'];
  for (const row of rows) {
    lines.push('  <row>');
    columns.forEach((col, i) => {
      const tag = sanitizeXmlTag(col);
      const val = escapeXml(row[i] ?? '');
      lines.push(`    <${tag}>${val}</${tag}>`);
    });
    lines.push('  </row>');
  }
  lines.push('</data>');
  return lines.join('\n');
}

function escapeMd(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

// === 列统计辅助函数 ===

interface ColumnStats {
  columnName: string;
  count: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  nullCount: number;
  isNumeric: boolean;
}

function formatNumber(num: number, decimals?: number): string {
  if (decimals !== undefined) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  if (Number.isInteger(num)) {
    return num.toLocaleString();
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function computeColumnStats(columns: string[], rows: unknown[][]): ColumnStats[] {
  const maxRows = rows.length > 10000 ? 5000 : rows.length;
  const sampleRows = rows.slice(0, maxRows);

  return columns.map((col, colIdx) => {
    const values = sampleRows.map((r) => r[colIdx]);
    const nonNull = values.filter((v) => v !== null && v !== undefined);
    const numericValues = nonNull.map((v) => Number(v)).filter((n) => !isNaN(n));
    const isNumeric = numericValues.length > 0 && numericValues.length >= nonNull.length * 0.8;

    const stat: ColumnStats = {
      columnName: col,
      count: nonNull.length,
      nullCount: values.length - nonNull.length,
      isNumeric,
    };

    if (isNumeric && numericValues.length > 0) {
      stat.sum = numericValues.reduce((a, b) => a + b, 0);
      stat.avg = stat.sum / numericValues.length;
      stat.min = Math.min(...numericValues);
      stat.max = Math.max(...numericValues);
    }

    return stat;
  });
}

function exportToMd(columns: string[], rows: unknown[][]): string {
  const headers = columns.map(escapeMd);
  const headerLine = '| ' + headers.join(' | ') + ' |';
  const separatorLine = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const bodyLines = rows.map((row) => '| ' + row.map((v) => escapeMd(v)).join(' | ') + ' |');
  return '\uFEFF' + [headerLine, separatorLine, ...bodyLines].join('\n');
}

// === ResultGrid 主组件 ===

export function ResultGrid({
  queryResult,
  isDark,
  executionTime,
  connectionId,
  database,
  originalSql,
  dbType,
}: ResultGridProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { getColumns, executeQuery } = useDatabase();

  // 解析表名
  const tableName = useMemo(() => {
    if (!originalSql) return null;
    return extractSingleTableName(originalSql);
  }, [originalSql]);

  // 获取表结构（列信息）
  const [tableColumns, setTableColumns] = useState<ColumnInfo[]>([]);
  const primaryKeyCol = useMemo(() => {
    return tableColumns.find((c) => c.column_key === 'PRI') || null;
  }, [tableColumns]);

  // 是否可编辑：单表查询 + 有主键 + 有连接
  const isEditable = !!(tableName && primaryKeyCol && connectionId);

  useEffect(() => {
    if (!connectionId || !tableName) {
      setTableColumns([]);
      return;
    }
    getColumns(connectionId, tableName, database)
      .then((cols) => setTableColumns(cols))
      .catch(() => setTableColumns([]));
  }, [connectionId, tableName, database, getColumns]);

  // 编辑状态
  const [modifiedRows, setModifiedRows] = useState<Map<number, unknown[]>>(new Map());
  const [deletedRowIndices, setDeletedRowIndices] = useState<Set<number>>(new Set());
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const [operationSql, setOperationSql] = useState<string>('');
  const [newRows, setNewRows] = useState<unknown[][]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });

  // 行数据（带修改和删除标记，以及新增行）
  const rowData = useMemo(() => {
    const existingRows = queryResult.rows
      .map((row, i) => {
        if (deletedRowIndices.has(i)) return null;
        const displayRow = modifiedRows.has(i) ? modifiedRows.get(i)! : row;
        const obj: Record<string, unknown> = { __id: i, __isNew: false };
        displayRow.forEach((cell, j) => {
          obj[String(j)] = cell;
        });
        return obj;
      })
      .filter(Boolean) as Record<string, unknown>[];

    const newRowsData = newRows.map((row, i) => {
      const obj: Record<string, unknown> = { __id: `new-${i}`, __isNew: true };
      row.forEach((cell, j) => {
        obj[String(j)] = cell;
      });
      return obj;
    });

    return [...existingRows, ...newRowsData];
  }, [queryResult.rows, modifiedRows, deletedRowIndices, newRows]);

  const colDefs = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [
      {
        headerName: '#',
        valueGetter: (params: any) =>
          params.node?.rowIndex != null ? params.node.rowIndex + 1 : '',
        width: 60,
        minWidth: 60,
        maxWidth: 60,
        pinned: 'left',
        sortable: false,
        filter: false,
        resizable: false,
        cellStyle: { textAlign: 'right', color: 'var(--text-tertiary)' },
        checkboxSelection: isEditable,
        headerCheckboxSelection: isEditable,
      },
    ];
    cols.push(
      ...queryResult.columns.map((col, i) => ({
        field: String(i),
        headerName: col,
        flex: 1,
        minWidth: 80,
        maxWidth: 400,
        sortable: true,
        filter: true,
        resizable: true,
        wrapText: true,
        autoHeight: true,
        editable: isEditable,
        tooltipValueGetter: (p: any) =>
          p.value === null || p.value === undefined ? 'NULL' : String(p.value),
        cellRenderer: (params: any) => {
          if (params.value === null || params.value === undefined) {
            return <span className="null-cell">NULL</span>;
          }
          return String(params.value);
        },
        cellClass: (params: any) => {
          const rowId = params.data?.__id as number | undefined;
          if (rowId != null && modifiedRows.has(rowId)) {
            return 'cell-modified';
          }
          return '';
        },
      }))
    );
    return cols;
  }, [queryResult.columns, isEditable, modifiedRows]);

  // 单元格值变化
  const onCellValueChanged = useCallback(
    (event: any) => {
      if (!isEditable) return;
      const rowId = event.data.__id;
      const colId = parseInt(event.colDef.field, 10);
      const newValue = event.newValue;

      if (typeof rowId === 'string' && rowId.startsWith('new-')) {
        const newRowIndex = parseInt(rowId.split('-')[1], 10);
        setNewRows((prev) => {
          const updated = [...prev];
          const existingRow = updated[newRowIndex]
            ? [...updated[newRowIndex]]
            : [...queryResult.columns.map(() => null)];
          existingRow[colId] = newValue;
          updated[newRowIndex] = existingRow;
          return updated;
        });
        return;
      }

      setModifiedRows((prev) => {
        const newMap = new Map(prev);
        const originalRow = queryResult.rows[rowId as number];
        const currentRow = newMap.has(rowId as number)
          ? newMap.get(rowId as number)!
          : [...originalRow];
        currentRow[colId] = newValue;
        newMap.set(rowId as number, currentRow);
        return newMap;
      });
    },
    [isEditable, queryResult.rows]
  );

  // 监听修改/删除变化，更新底部 SQL 预览
  useEffect(() => {
    if (!tableName || !primaryKeyCol) {
      setOperationSql('');
      return;
    }
    const pkIdx = queryResult.columns.indexOf(primaryKeyCol.column_name);
    if (pkIdx < 0) {
      setOperationSql('');
      return;
    }

    const lines: string[] = [];
    for (const [rowId, row] of modifiedRows) {
      if (deletedRowIndices.has(rowId)) continue;
      const originalRow = queryResult.rows[rowId];
      const changedCols: string[] = [];
      const changedValues: unknown[] = [];
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== originalRow[i]) {
          changedCols.push(queryResult.columns[i]);
          changedValues.push(row[i]);
        }
      }
      if (changedCols.length === 0) continue;
      const setters = changedCols
        .map(
          (col, idx) =>
            `${escapeSqlIdentifier(col, dbType)} = ${escapeSqlValue(changedValues[idx])}`
        )
        .join(', ');
      lines.push(
        `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${setters} WHERE ${escapeSqlIdentifier(primaryKeyCol.column_name, dbType)} = ${escapeSqlValue(originalRow[pkIdx])};`
      );
    }
    for (const rowId of deletedRowIndices) {
      const originalRow = queryResult.rows[rowId];
      lines.push(
        `DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(primaryKeyCol.column_name, dbType)} = ${escapeSqlValue(originalRow[pkIdx])};`
      );
    }
    setOperationSql(lines.join('\n'));
  }, [modifiedRows, deletedRowIndices, tableName, primaryKeyCol, queryResult, dbType]);

  // 选中行变化
  const onSelectionChanged = useCallback((event: any) => {
    const selected = event.api.getSelectedRows() as Array<{ __id: number }>;
    setSelectedRowIndices(new Set(selected.map((r) => r.__id)));
  }, []);

  // 提交更改
  const handleCommit = useCallback(async () => {
    if (!connectionId || !tableName || !primaryKeyCol) return;
    const pkIdx = queryResult.columns.indexOf(primaryKeyCol.column_name);
    if (pkIdx < 0) return;

    try {
      let successCount = 0;
      let errorMsg = '';

      // 执行 INSERT（新增行）
      if (newRows.length > 0) {
        for (const row of newRows) {
          const cols: string[] = [];
          const vals: unknown[] = [];
          row.forEach((v, i) => {
            if (v !== null) {
              cols.push(queryResult.columns[i]);
              vals.push(v);
            }
          });
          if (cols.length === 0) continue;
          const sql = `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${cols.map((c) => escapeSqlIdentifier(c, dbType)).join(', ')}) VALUES (${vals.map(escapeSqlValue).join(', ')})`;
          const res = await executeQuery(connectionId, sql, database);
          if (res.error) {
            errorMsg = res.error;
            break;
          }
          successCount++;
        }
      }

      // 执行 UPDATE
      if (errorMsg) {
        message.error(`${t('common.submitFailed')}: ${errorMsg}`);
        return;
      }
      for (const [rowId, row] of modifiedRows) {
        if (deletedRowIndices.has(rowId)) continue;
        const originalRow = queryResult.rows[rowId];
        const changedCols: string[] = [];
        const changedValues: unknown[] = [];
        for (let i = 0; i < row.length; i++) {
          if (row[i] !== originalRow[i]) {
            changedCols.push(queryResult.columns[i]);
            changedValues.push(row[i]);
          }
        }
        if (changedCols.length === 0) continue;

        const setters = changedCols
          .map(
            (col, i) => `${escapeSqlIdentifier(col, dbType)} = ${escapeSqlValue(changedValues[i])}`
          )
          .join(', ');
        const sql = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${setters} WHERE ${escapeSqlIdentifier(primaryKeyCol.column_name, dbType)} = ${escapeSqlValue(originalRow[pkIdx])}`;

        const res = await executeQuery(connectionId, sql, database);
        if (res.error) {
          errorMsg = res.error;
          break;
        }
        successCount++;
      }

      // 执行 DELETE
      if (!errorMsg) {
        for (const rowId of deletedRowIndices) {
          const originalRow = queryResult.rows[rowId];
          const sql = `DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(primaryKeyCol.column_name, dbType)} = ${escapeSqlValue(originalRow[pkIdx])}`;
          const res = await executeQuery(connectionId, sql, database);
          if (res.error) {
            errorMsg = res.error;
            break;
          }
          successCount++;
        }
      }

      if (errorMsg) {
        message.error(`${t('common.submitFailed')}: ${errorMsg}`);
      } else {
        message.success(
          `${t('common.submittedSuccessfully')} ${successCount} ${t('common.changes')}`
        );
        setModifiedRows(new Map());
        setDeletedRowIndices(new Set());
        setNewRows([]);
      }
    } catch (err: any) {
      message.error(`${t('common.submitFailed')}: ${err.message || err}`);
    }
  }, [
    connectionId,
    tableName,
    primaryKeyCol,
    queryResult,
    newRows,
    modifiedRows,
    deletedRowIndices,
    dbType,
    database,
    executeQuery,
    message,
  ]);

  // 撤销更改
  const handleUndo = useCallback(() => {
    Modal.confirm({
      title: t('common.undoModifications'),
      content: t('common.confirmDiscardAllChanges'),
      onOk: () => {
        setModifiedRows(new Map());
        setDeletedRowIndices(new Set());
        setNewRows([]);
        message.info(t('common.allChangesRevoked'));
      },
    });
  }, [message]);

  // 删除选中行
  const handleDeleteSelected = useCallback(() => {
    if (!isEditable) {
      message.warning(t('common.currentResultSetNotEditable'));
      return;
    }
    if (selectedRowIndices.size === 0) {
      message.warning(t('common.pleaseSelectRowsToDelete'));
      return;
    }
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('common.confirmMarkRowsForDeletion', { count: selectedRowIndices.size }),
      okText: t('common.markForDeletion'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => {
        setDeletedRowIndices((prev) => {
          const next = new Set(prev);
          selectedRowIndices.forEach((i) => next.add(i));
          return next;
        });
        message.success(
          `${t('common.markedForDeletion')} ${selectedRowIndices.size} ${t('common.rows')}`
        );
      },
    });
  }, [isEditable, selectedRowIndices, message]);

  // 右键菜单事件
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClick = () => closeContextMenu();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu.visible, closeContextMenu]);

  // 复制为 SQL
  const copyAsInsert = useCallback(() => {
    if (!tableName) {
      message.warning(t('common.cannotDetermineTableName'));
      return;
    }
    const indices = Array.from(selectedRowIndices);
    if (indices.length === 0) {
      message.warning(t('common.pleaseSelectRows'));
      return;
    }
    const rows = indices.map((i) => queryResult.rows[i]);
    const sql = generateInsertSql(tableName, queryResult.columns, rows, dbType);
    navigator.clipboard.writeText(sql);
    message.success(
      `${t('common.copyTable.copied')} ${indices.length} ${t('common.rows')} INSERT ${t('common.statements')}`
    );
    closeContextMenu();
  }, [tableName, selectedRowIndices, queryResult, dbType, message, closeContextMenu]);

  const copyAsUpdate = useCallback(() => {
    if (!tableName || !primaryKeyCol) {
      message.warning(t('common.currentResultSetCannotGenerateUpdate'));
      return;
    }
    const pkIdx = queryResult.columns.indexOf(primaryKeyCol.column_name);
    if (pkIdx < 0) {
      message.warning(t('common.primaryKeyColumnNotFound'));
      return;
    }
    const indices = Array.from(selectedRowIndices);
    if (indices.length === 0) {
      message.warning(t('common.pleaseSelectRows'));
      return;
    }
    const sqls = indices.map((i) =>
      generateUpdateSql(
        tableName,
        queryResult.columns,
        queryResult.rows[i],
        primaryKeyCol.column_name,
        pkIdx,
        dbType
      )
    );
    navigator.clipboard.writeText(sqls.join('\n'));
    message.success(
      `${t('common.copyTable.copied')} ${indices.length} ${t('common.rows')} UPDATE ${t('common.statements')}`
    );
    closeContextMenu();
  }, [tableName, primaryKeyCol, queryResult, dbType, message, closeContextMenu]);

  const copyAsDelete = useCallback(() => {
    if (!tableName || !primaryKeyCol) {
      message.warning(t('common.currentResultSetCannotGenerateDelete'));
      return;
    }
    const pkIdx = queryResult.columns.indexOf(primaryKeyCol.column_name);
    if (pkIdx < 0) {
      message.warning(t('common.primaryKeyColumnNotFound'));
      return;
    }
    const indices = Array.from(selectedRowIndices);
    if (indices.length === 0) {
      message.warning(t('common.pleaseSelectRows'));
      return;
    }
    const pkValues = indices.map((i) => queryResult.rows[i][pkIdx]);
    const sql = generateDeleteSql(tableName, primaryKeyCol.column_name, pkValues, dbType);
    navigator.clipboard.writeText(sql);
    message.success(
      `${t('common.copyTable.copied')} ${indices.length} ${t('common.rows')} DELETE ${t('common.statements')}`
    );
    closeContextMenu();
  }, [tableName, primaryKeyCol, queryResult, dbType, message, closeContextMenu]);

  // 显示操作 SQL 弹窗
  const showOperationSql = useCallback(() => {
    if (!operationSql) {
      message.info(t('common.noOperationSql'));
      return;
    }
    Modal.info({
      title: t('common.operationSqlPreview'),
      width: 800,
      content: (
        <pre
          style={{
            maxHeight: 400,
            overflow: 'auto',
            background: 'var(--background-toolbar)',
            padding: 12,
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
          }}
        >
          {operationSql}
        </pre>
      ),
    });
  }, [operationSql, message]);

  // 错误/空结果处理
  if (queryResult.error) {
    return (
      <div
        style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Empty
          description={
            <div style={{ color: 'var(--color-error)' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {t('common.queryExecutionFailed')}
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, maxWidth: 400, wordBreak: 'break-all' }}>
                {queryResult.error}
              </div>
            </div>
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  if (queryResult.rows.length === 0) {
    return (
      <div
        style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Empty
          description={
            <div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{t('common.querySuccess')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {executionTime !== undefined
                  ? `${t('common.executionTime')} ${executionTime}ms · `
                  : ''}
                {t('common.noDataReturned')}
              </div>
            </div>
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  const hasChanges = modifiedRows.size > 0 || deletedRowIndices.size > 0;

  // 列统计
  const columnStats = useMemo(() => {
    if (queryResult.rows.length === 0) return [];
    return computeColumnStats(queryResult.columns, queryResult.rows);
  }, [queryResult.columns, queryResult.rows]);

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      onContextMenu={handleContextMenu}
    >
      {/* 顶部元信息栏 */}
      <div
        style={{
          padding: '4px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--background-toolbar)',
          display: 'flex',
          gap: 16,
          fontSize: 12,
          color: 'var(--text-secondary)',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>
            {queryResult.rows.length.toLocaleString()}
          </strong>{' '}
          {t('common.rows')}
        </span>
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>{queryResult.columns.length}</strong>{' '}
          {t('common.tableStructure.columns')}
        </span>
        {executionTime !== undefined && (
          <span>
            {t('common.historyPanel.duration')}{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{executionTime}ms</strong>
          </span>
        )}
        {queryResult.rows_affected !== undefined && queryResult.rows_affected > 0 && (
          <span>{t('common.affectedRows', { count: queryResult.rows_affected })}</span>
        )}
        {isEditable && (
          <Tag color="blue" style={{ margin: 0, fontSize: 11, lineHeight: '16px' }}>
            {t('common.editable')}
          </Tag>
        )}
        {tableName && !isEditable && (
          <Tooltip title={t('common.cannotEdit')}>
            <Tag color="default" style={{ margin: 0, fontSize: 11, lineHeight: '16px' }}>
              <ExclamationCircleOutlined style={{ marginRight: 4 }} />
              {t('common.readOnly')}
            </Tag>
          </Tooltip>
        )}
        <div style={{ flex: 1 }} />
        <Dropdown
          menu={{
            items: [
              {
                key: 'excel',
                label: t('common.importExport.exportExcel'),
                icon: <FileTextOutlined />,
                onClick: () => {
                  try {
                    const cols = queryResult.columns.map((c) => ({ field: c, headerName: c }));
                    const data = queryResult.rows.map((row) => {
                      const obj: Record<string, any> = {};
                      queryResult.columns.forEach((col, i) => {
                        obj[col] = row[i] === null ? '' : row[i];
                      });
                      return obj;
                    });
                    exportToExcel(data, cols, {
                      filename: `result_${Date.now()}.xlsx`,
                      sheetName: 'Query Result',
                    });
                    message.success(t('common.exportedExcel'));
                  } catch (e: any) {
                    message.error(`${t('common.importExport.exportFailed')}: ${e.message}`);
                  }
                },
              },
              {
                key: 'csv',
                label: t('common.exportCsv'),
                icon: <FileTextOutlined />,
                onClick: () => {
                  const csv = exportToCsv(queryResult.columns, queryResult.rows);
                  downloadBlob(csv, `result_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
                  message.success(t('common.exportedCsv'));
                },
              },
              {
                key: 'json',
                label: t('common.exportJson'),
                icon: <FileTextOutlined />,
                onClick: () => {
                  const json = exportToJson(queryResult.columns, queryResult.rows);
                  downloadBlob(json, `result_${Date.now()}.json`, 'application/json');
                  message.success(t('common.exportedJson'));
                },
              },
              { type: 'divider' as const },
              {
                key: 'txt',
                label: t('common.exportTxt'),
                icon: <FileTextOutlined />,
                onClick: () => {
                  const txt = exportToTxt(queryResult.columns, queryResult.rows);
                  downloadBlob(txt, `result_${Date.now()}.txt`, 'text/plain;charset=utf-8;');
                  message.success(t('common.exportedTxt'));
                },
              },
              {
                key: 'xml',
                label: t('common.exportXml'),
                icon: <FileTextOutlined />,
                onClick: () => {
                  const xml = exportToXml(queryResult.columns, queryResult.rows);
                  downloadBlob(xml, `result_${Date.now()}.xml`, 'application/xml;charset=utf-8;');
                  message.success(t('common.exportedXml'));
                },
              },
              {
                key: 'markdown',
                label: t('common.exportMarkdown'),
                icon: <FileTextOutlined />,
                onClick: () => {
                  const md = exportToMd(queryResult.columns, queryResult.rows);
                  downloadBlob(md, `result_${Date.now()}.md`, 'text/markdown;charset=utf-8;');
                  message.success(t('common.exportedMarkdown'));
                },
              },
            ],
          }}
        >
          <Button size="small" icon={<DownloadOutlined />} style={{ fontSize: 11, height: 22 }}>
            {t('common.export')}
          </Button>
        </Dropdown>
        {isEditable && hasChanges && (
          <Space size={4}>
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              onClick={handleCommit}
              style={{ fontSize: 11, height: 22 }}
            >
              {t('common.submit')}
            </Button>
            <Button
              size="small"
              icon={<UndoOutlined />}
              onClick={handleUndo}
              style={{ fontSize: 11, height: 22 }}
            >
              {t('common.undo')}
            </Button>
            <Button
              size="small"
              icon={<CodeOutlined />}
              onClick={showOperationSql}
              style={{ fontSize: 11, height: 22 }}
            >
              SQL
            </Button>
          </Space>
        )}
        {isEditable && (
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
            style={{ fontSize: 11, height: 22 }}
          >
            {t('common.addNewRow')}
          </Button>
        )}
        {isEditable && (
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={handleDeleteSelected}
            disabled={selectedRowIndices.size === 0}
            style={{ fontSize: 11, height: 22 }}
          >
            {t('common.dataGrid.deleteRow')}
          </Button>
        )}
      </div>

      {/* AG Grid */}
      <div
        className={`ag-theme-compact ${isDark ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'}`}
        style={{ flex: 1, overflow: 'hidden' }}
      >
        <AgGridReact
          columnDefs={colDefs}
          rowData={rowData}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
            wrapText: true,
          }}
          pagination={rowData.length > 500}
          paginationPageSize={500}
          paginationPageSizeSelector={[100, 500, 1000]}
          domLayout="normal"
          rowHeight={28}
          headerHeight={32}
          suppressColumnVirtualisation={false}
          suppressRowVirtualisation={false}
          rowSelection="multiple"
          onCellValueChanged={onCellValueChanged}
          onSelectionChanged={onSelectionChanged}
        />
      </div>

      {/* 列统计栏 */}
      {queryResult.rows.length > 0 && (
        <div
          style={{
            height: 28,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            background: 'var(--background-toolbar)',
            borderTop: '1px solid var(--border)',
            gap: 8,
            fontSize: 11,
            color: 'var(--text-secondary)',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          <span>
            {t('common.records')}: {queryResult.rows.length.toLocaleString()}
          </span>
          {columnStats.map((stat) => (
            <Tag
              key={stat.columnName}
              style={{
                margin: 0,
                fontSize: 10,
                whiteSpace: 'nowrap',
              }}
            >
              {stat.columnName}:
              {stat.isNumeric ? (
                <>
                  {' '}
                  SUM={formatNumber(stat.sum!)} AVG={formatNumber(stat.avg!, 2)} MIN=
                  {formatNumber(stat.min!)} MAX={formatNumber(stat.max!)}
                </>
              ) : (
                <> COUNT={stat.count}</>
              )}
              {stat.nullCount > 0 && <span style={{ opacity: 0.7 }}> NULL={stat.nullCount}</span>}
            </Tag>
          ))}
        </div>
      )}

      {/* 底部操作 SQL 栏（Navicat 风格） */}
      {isEditable && operationSql && (
        <div
          style={{
            padding: '4px 12px',
            borderTop: '1px solid var(--border)',
            background: 'var(--background-toolbar)',
            fontSize: 11,
            fontFamily: 'monospace',
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: 60,
            overflow: 'auto',
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'var(--color-primary)', marginRight: 8 }}>SQL ▶</span>
          {operationSql}
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
            background: 'var(--background-card)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            padding: '4px 0',
            minWidth: 160,
          }}
        >
          {tableName && (
            <div
              style={{
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onClick={copyAsInsert}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'var(--background-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              <CopyOutlined />
              {t('common.dataGrid.copyAsInsert')}
            </div>
          )}
          {tableName && primaryKeyCol && (
            <>
              <div
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onClick={copyAsUpdate}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--background-hover)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <CopyOutlined />
                {t('common.dataGrid.copyAsUpdate')}
              </div>
              <div
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onClick={copyAsDelete}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--background-hover)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <DeleteOutlined />
                {t('common.copyAsDelete')}
              </div>
            </>
          )}
          {isEditable && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <div
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: 'var(--color-error)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onClick={() => {
                  closeContextMenu();
                  handleDeleteSelected();
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--background-hover)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <DeleteOutlined />
                {t('common.deleteSelectedRows')}
              </div>
            </>
          )}
        </div>
      )}

      {/* 新增行 Modal */}
      <Modal
        title={t('common.addRowTitle')}
        open={addModalOpen}
        onCancel={() => {
          setAddModalOpen(false);
          addForm.resetFields();
        }}
        onOk={async () => {
          try {
            const values = await addForm.validateFields();
            const newRow = queryResult.columns.map((_, i) => {
              const colName = queryResult.columns[i];
              return values[colName] ?? null;
            });
            setNewRows((prev) => [...prev, newRow]);
            setAddModalOpen(false);
            addForm.resetFields();
            message.success(
              `${t('common.newRowAdded')}, ${t('common.pleaseClickSubmit')} ${t('common.toSaveToDatabase')}`
            );
          } catch (err) {
            // 表单验证失败，不做处理
          }
        }}
        okText={t('common.add')}
        cancelText={t('common.cancel')}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          {tableColumns.map((col) => (
            <Form.Item
              key={col.column_name}
              label={
                <span>
                  {col.column_name}
                  {col.is_nullable !== 'YES' && (
                    <span style={{ color: 'var(--color-error)' }}> *</span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                    {col.data_type}
                  </span>
                </span>
              }
              name={col.column_name}
              rules={[
                {
                  required: col.is_nullable !== 'YES',
                  message: t('common.pleaseEnterColumnValue', { column: col.column_name }),
                },
              ]}
            >
              <Input placeholder={col.comment || col.data_type} />
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </div>
  );
}

// === 执行计划表格 ===

interface ExplainPlanGridProps {
  data: any[];
  isDark: boolean;
}

export function ExplainPlanGrid({ data, isDark }: ExplainPlanGridProps) {
  const { t } = useTranslation();
  if (!data || data.length === 0) {
    return (
      <div
        style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Empty description={t('common.noExplainPlanData')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  const columns = Object.keys(data[0]);
  const colDefs = useMemo<ColDef[]>(() => {
    return columns.map((col) => ({
      field: col,
      headerName: col,
      flex: 1,
      minWidth: 100,
      sortable: true,
      filter: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    }));
  }, [columns]);

  const rowData = useMemo(() => data, [data]);

  return (
    <div
      className={`ag-theme-compact ${isDark ? 'ag-theme-alpine-dark' : 'ag-theme-alpine'}`}
      style={{ height: '100%' }}
    >
      <AgGridReact
        columnDefs={colDefs}
        rowData={rowData}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
          wrapText: true,
        }}
        pagination={rowData.length > 500}
        paginationPageSize={500}
        domLayout="normal"
        rowHeight={28}
        headerHeight={32}
      />
    </div>
  );
}
