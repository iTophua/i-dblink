/**
 * ResultGrid — SQL 查询结果展示组件（Glide Data Grid 版）
 *
 * 完整功能：拖拽多选、内联编辑、新增行Modal、右键菜单(INSERT/UPDATE/DELETE)、
 * 多格式导出(CSV/JSON/Excel/TXT/XML/MD)、底部SQL预览、提交/撤销。
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Button, Space, Empty, Tag, App, Modal, Dropdown } from 'antd';
import {
  DeleteOutlined, SaveOutlined, UndoOutlined, CodeOutlined,
  PlusOutlined, DownloadOutlined,
  ExclamationCircleOutlined, BgColorsOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../../hooks/useApi';
import type { QueryResult, DatabaseType, ColumnInfo } from '../../types/api';
import { exportToExcel } from '../../utils/exportUtils';
import { getDialect } from '../../utils/sqlDialects';
import DataEditor from '@glideapps/glide-data-grid';
import { GlideDataTable, type GlideRow } from '../DataTable/GlideDataTable';
import { EnhancedEmptyState } from '../LoadingStates';
import { namesToGlideColumns, createResultCellModified } from '../DataTable/adapters/resultAdapter';
import { useContextMenu } from '../ContextMenu';
import { ResultGridContextMenu } from './ResultGridContextMenu';
import { useEditHistory } from '../../hooks/useEditHistory';
import { isSameEditValue } from '../DataTable/utils';
import { appModal } from '../../utils/appModal';
import { ConditionalFormattingPanel, type FormatRule } from '../DataTable/ConditionalFormattingPanel';
import { getErrorMessage } from '../../utils/getErrorMessage';

// ── Types ──
interface ResultGridProps {
  queryResult: QueryResult & { executionTime?: number; totalTime?: number; executedSql?: string };
  executionTime?: number;
  isDark: boolean;
  connectionId?: string;
  database?: string;
  originalSql?: string;
  dbType?: DatabaseType;
}

// ── SQL 解析 ──
function extractTable(sql: string): string | null {
  const clean = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '').replace(/;\s*$/, '').trim();
  if (/\bJOIN\b|\bUNION\b|\bINTO\b|(?:\()\s*SELECT\b/i.test(clean)) return null;
  const match = clean.match(/\bFROM\s+(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?(?:\s+(?:AS\s+)?\w+)?(?:\s*$|\s+(?:WHERE|ORDER|GROUP|HAVING|LIMIT|OFFSET)\b)/i);
  return match ? (match[2] || match[1] || null) : null;
}

// ── 导出工具 ──
function downloadBlob(content: string, name: string, type: string) {
  const blob = new Blob([content], { type }); const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
function exportToCsv(cols: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
  return cols.map(esc).join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n');
}
function exportToJson(cols: string[], rows: unknown[][]): string {
  return JSON.stringify(rows.map((r) => { const o: Record<string, unknown> = {}; cols.forEach((c, i) => { o[c] = r[i]; }); return o; }), null, 2);
}
function exportToTxt(cols: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => { const s = String(v ?? ''); return s.includes('\t') || s.includes('\n') ? s.replace(/\t/g, ' ').replace(/\n/g, '\\n') : s; };
  return '\uFEFF' + cols.map(esc).join('\t') + '\n' + rows.map((r) => r.map(esc).join('\t')).join('\n');
}
function exportToXml(cols: string[], rows: unknown[][]): string {
  const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9_\u4e00-\u9fff.-]/g, '_');
  const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<data>'];
  for (const row of rows) { lines.push('  <row>'); cols.forEach((c, i) => lines.push(`    <${sanitize(c)}>${esc(row[i])}</${sanitize(c)}>`)); lines.push('  </row>'); }
  lines.push('</data>'); return lines.join('\n');
}
function exportToMd(cols: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  const h = '| ' + cols.map(esc).join(' | ') + ' |';
  return '\uFEFF' + h + '\n| ' + cols.map(() => '---').join(' | ') + ' |\n' + rows.map((r) => '| ' + r.map(esc).join(' | ') + ' |').join('\n');
}

// ── Component ──
export function ResultGrid({
  queryResult, executionTime, isDark: _isDark, connectionId, database, originalSql, dbType,
}: ResultGridProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { getColumns, executeQuery } = useDatabase();

  const sqlForExtract = queryResult.executedSql || originalSql || '';
  const tableName = useMemo(() => (sqlForExtract ? extractTable(sqlForExtract) : null), [sqlForExtract]);
  const [tableColumns, setTableColumns] = useState<ColumnInfo[]>([]);
  const primaryKeyCol = useMemo(() => {
    const pk = tableColumns.find((c) => c.column_key === 'PRI') || null;
    return pk;
  }, [tableColumns]);
  const isEditable = !!(tableName && primaryKeyCol && connectionId);

  useEffect(() => {
    if (!connectionId || !tableName) { setTableColumns([]); return; }
    getColumns(connectionId, tableName, database).then((cols) => {
      setTableColumns(cols);
    }).catch(() => {
      setTableColumns([]);
    });
  }, [connectionId, tableName, database, getColumns]);

  // 重新执行 SQL 时清除编辑状态
  useEffect(() => {
    setModifiedRows(new Map());
    setDeletedIndices(new Set());
    setNewRows([]);
    setSelectedIndices(new Set());
    setOperationSql('');
    clearEditHistory();
  }, [queryResult]);

  // 编辑状态
  const [modifiedRows, setModifiedRows] = useState<Map<number, unknown[]>>(new Map());
  // ref 同步最新 modifiedRows，供 handleCellEdited 同步读取「当前值」避免闭包陈旧
  const modifiedRowsRef = useRef(modifiedRows);
  useEffect(() => { modifiedRowsRef.current = modifiedRows; }, [modifiedRows]);
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set());
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [newRows, setNewRows] = useState<unknown[][]>([]);
  const [operationSql, setOperationSql] = useState('');
  const [scrollToRowIndex, setScrollToRowIndex] = useState<number | undefined>(undefined);
  const { menuState, menuTarget, openMenu, closeMenu } = useContextMenu();

  // Conditional formatting
  const [formatRules, setFormatRules] = useState<FormatRule[]>([]);
  const [formatPanelVisible, setFormatPanelVisible] = useState(false);

  // 行数据
  const allRows = useMemo(() => {
    const existing = queryResult.rows.map((row, i) => {
      if (deletedIndices.has(i)) return null;
      const r = modifiedRows.has(i) ? modifiedRows.get(i)! : row;
      const obj: Record<string, unknown> = { __id: i, __isNew: false };
      queryResult.columns.forEach((col, j) => { obj[col] = r[j]; });
      return obj;
    }).filter(Boolean) as Record<string, unknown>[];
    const newOnes = newRows.map((row, i) => {
      const obj: Record<string, unknown> = { __id: `new-${i}`, __isNew: true };
      queryResult.columns.forEach((col, j) => { obj[col] = row[j]; });
      return obj;
    });
    return [...existing, ...newOnes];
  }, [queryResult.rows, queryResult.columns, modifiedRows, deletedIndices, newRows]);

  // 行状态回调
  const rowStatus = useCallback((row: GlideRow, _idx: number) => {
    const id = row.__id as number;
    if (deletedIndices.has(id)) return 'deleted' as const;
    if (modifiedRows.has(id)) return 'modified' as const;
    return undefined;
  }, [deletedIndices, modifiedRows]);

  const isCellModified = useMemo(() => createResultCellModified(modifiedRows, queryResult.columns, queryResult.rows), [modifiedRows, queryResult.columns, queryResult.rows]);

  const glideColumns = useMemo(() => namesToGlideColumns(queryResult.columns), [queryResult.columns]);
  const glideRows = useMemo(() => allRows as GlideRow[], [allRows]);

  // 选中（存储 allRows 中的索引；已有行 __id=数字=原始索引，新增行 = qLen + k）
  const qLen = queryResult.rows.length;
  const handleSelectionChange = useCallback((rows: GlideRow[]) => {
    const indices = new Set<number>();
    for (const r of rows) {
      const id = r.__id;
      if (typeof id === 'number' && id >= 0) {
        indices.add(id);
      } else if (typeof id === 'string' && id.startsWith('new-')) {
        const k = parseInt(id.slice(4), 10);
        if (!isNaN(k)) indices.add(qLen + k);
      }
    }
    setSelectedIndices(indices);
  }, [qLen]);

  // 撤销
  const { record: recordEdit, undo: handleUndoStep, clear: clearEditHistory, hasHistory: hasEditHistory } = useEditHistory({
    onRestore: useCallback((cells: Array<{ rowId: string; colId: string; value: unknown }>) => {
      setModifiedRows((prev) => {
        const grouped = new Map<number, Map<number, unknown>>();
        for (const c of cells) {
          const rowIdx = Number(c.rowId);
          const colIdx = Number(c.colId);
          if (!grouped.has(rowIdx)) grouped.set(rowIdx, new Map());
          grouped.get(rowIdx)!.set(colIdx, c.value);
        }
        if (grouped.size === 0) return prev;
        const next = new Map(prev);
        for (const [rowIdx, cols] of grouped) {
          const current = next.has(rowIdx) ? [...next.get(rowIdx)!] : [...queryResult.rows[rowIdx]];
          for (const [colIdx, val] of cols) {
            current[colIdx] = val;
          }
          const originalRow = queryResult.rows[rowIdx];
          const allSame = originalRow.every((v, i) => v === current[i]);
          if (allSame) next.delete(rowIdx);
          else next.set(rowIdx, current);
        }
        return next;
      });
    }, [queryResult.rows]),
    enabled: isEditable,
  });

  // 内联编辑
  const handleCellEdited = useCallback((col: number, row: number, newValue: string) => {
    if (!isEditable) return;
    const colName = queryResult.columns[col];
    if (!colName) return;
    const rowId = row;

    // 新增行：更新 newRows state
    if (rowId >= queryResult.rows.length) {
      const newRowIndex = rowId - queryResult.rows.length;
      setNewRows((prev) => prev.map((r, i) => {
        if (i !== newRowIndex) return r;
        const updated = [...r];
        updated[col] = newValue === 'NULL' ? null : newValue;
        return updated;
      }));
      return;
    }

    const originalRow = queryResult.rows[rowId];
    const originalValue = originalRow[col];

    // 取「当前值」：modifiedRows 里有则用已修改值，否则用原始值。
    // 之前用原始值做比较，导致已修改过的单元格再次双击不改动时误入栈（oldValue=原始，newValue=已改值，不等就 recordEdit）。
    const currentModified = modifiedRowsRef.current.get(rowId);
    const currentValue = currentModified ? currentModified[col] : originalValue;

    const resolvedNew = newValue === 'NULL' ? null : newValue;

    // 值未真正变化（与当前显示值一致）则不入栈、不改 modifiedRows
    if (isSameEditValue(currentValue, resolvedNew)) return;

    // 值被改回原始值：从 modifiedRows 移除该列的修改标记（若整行恢复则删除该行）
    if (isSameEditValue(originalValue, resolvedNew)) {
      setModifiedRows((prev) => {
        if (!prev.has(rowId)) return prev;
        const next = new Map(prev);
        const current = [...next.get(rowId)!];
        current[col] = originalValue;
        const allSame = originalRow.every((v, i) => {
          const cv = current[i];
          return (v == null && cv == null) || (v != null && cv != null && String(v) === String(cv));
        });
        if (allSame) next.delete(rowId);
        else next.set(rowId, current);
        return next;
      });
      // 仍需入栈一条记录（记录"从已修改值恢复到原始值"），以便撤销时恢复之前的修改
      recordEdit([{ rowId: String(rowId), colId: String(col), oldValue: currentValue, newValue: resolvedNew }]);
      return;
    }

    recordEdit([{ rowId: String(rowId), colId: String(col), oldValue: currentValue, newValue: resolvedNew }]);

    setModifiedRows((prev) => {
      const next = new Map(prev);
      const current = next.get(rowId) ? [...next.get(rowId)!] : [...originalRow];
      current[col] = resolvedNew;
      next.set(rowId, current);
      return next;
    });
  }, [isEditable, queryResult, recordEdit]);

  // 范围编辑（批量）
  const handleCellsEdited = useCallback((edits: Array<{ col: number; row: number; value: string }>) => {
    for (const edit of edits) {
      handleCellEdited(edit.col, edit.row, edit.value);
    }
  }, [handleCellEdited]);

  // 生成操作SQL
  useEffect(() => {
    if (!tableName || !primaryKeyCol) { setOperationSql(''); return; }
    const pkIdx = queryResult.columns.indexOf(primaryKeyCol.column_name);
    if (pkIdx < 0) { setOperationSql(''); return; }
    const dialect = getDialect(dbType);
    const tableRef = dialect.buildTableRef(tableName, database);
    const lines: string[] = [];
    for (const row of newRows) {
      const cols: string[] = []; const vals: unknown[] = [];
      row.forEach((v, i) => { if (v !== null) { cols.push(queryResult.columns[i]); vals.push(v); } });
      if (cols.length === 0) continue;
      lines.push(dialect.buildInsert(tableRef, cols, [vals])[0] + ';');
    }
    for (const [rowId, row] of modifiedRows) {
      if (deletedIndices.has(rowId)) continue;
      const setters: Record<string, unknown> = {};
      const original = queryResult.rows[rowId];
      queryResult.columns.forEach((c, i) => {
        const cur = row[i];
        const orig = original?.[i];
        if ((cur == null && orig == null) || (cur != null && String(cur) === String(orig ?? ''))) return;
        setters[c] = cur;
      });
      if (Object.keys(setters).length === 0) continue;
      const where = `${dialect.escapeIdentifier(primaryKeyCol.column_name)} = ${dialect.escapeValue(queryResult.rows[rowId][pkIdx])}`;
      lines.push(dialect.buildUpdate(tableRef, setters, where) + ';');
    }
    for (const rowId of deletedIndices) {
      const where = `${dialect.escapeIdentifier(primaryKeyCol.column_name)} = ${dialect.escapeValue(queryResult.rows[rowId][pkIdx])}`;
      lines.push(dialect.buildDelete(tableRef, where) + ';');
    }
    setOperationSql(lines.join('\n'));
  }, [modifiedRows, deletedIndices, newRows, tableName, primaryKeyCol, queryResult, dbType, database]);

  // 提交
  const handleCommit = useCallback(async () => {
    if (!connectionId || !tableName || !primaryKeyCol) return;
    const pkIdx = queryResult.columns.indexOf(primaryKeyCol.column_name);
    if (pkIdx < 0) return;
    const dialect = getDialect(dbType);
    const tableRef = dialect.buildTableRef(tableName, database);
    try {
      let success = 0, errMsg = '';
      for (const row of newRows) {
        const cols: string[] = []; const vals: unknown[] = [];
        row.forEach((v, i) => { if (v !== null) { cols.push(queryResult.columns[i]); vals.push(v); } });
        if (cols.length === 0) continue;
        const sql = dialect.buildInsert(tableRef, cols, [vals])[0];
        const res = await executeQuery(connectionId, sql, database);
        if (res.error) { errMsg = res.error; break; } success++;
      }
      if (!errMsg) {
        for (const [rowId, row] of modifiedRows) {
          if (deletedIndices.has(rowId)) continue;
          const setters: Record<string, unknown> = {};
          const original = queryResult.rows[rowId];
          queryResult.columns.forEach((c, i) => {
            const cur = row[i];
            const orig = original?.[i];
            if ((cur == null && orig == null) || (cur != null && String(cur) === String(orig ?? ''))) return;
            setters[c] = cur;
          });
          if (Object.keys(setters).length === 0) continue;
          const where = `${dialect.escapeIdentifier(primaryKeyCol.column_name)} = ${dialect.escapeValue(queryResult.rows[rowId][pkIdx])}`;
          const sql = dialect.buildUpdate(tableRef, setters, where);
          const res = await executeQuery(connectionId, sql, database);
          if (res.error) { errMsg = res.error; break; } success++;
        }
      }
      if (!errMsg) {
        for (const rowId of deletedIndices) {
          const where = `${dialect.escapeIdentifier(primaryKeyCol.column_name)} = ${dialect.escapeValue(queryResult.rows[rowId][pkIdx])}`;
          const sql = dialect.buildDelete(tableRef, where);
          const res = await executeQuery(connectionId, sql, database);
          if (res.error) { errMsg = res.error; break; } success++;
        }
      }
      if (errMsg) message.error(`${t('common.submitFailed')}: ${errMsg}`);
      else { message.success(`${t('common.submittedSuccessfully')} ${success}`); setModifiedRows(new Map()); setDeletedIndices(new Set()); setNewRows([]); clearEditHistory(); }
    } catch (err: unknown) { message.error(`${t('common.submitFailed')}: ${getErrorMessage(err)}`); }
  }, [connectionId, tableName, primaryKeyCol, modifiedRows, deletedIndices, newRows, queryResult, dbType, database, executeQuery, message, t]);

  // 撤销
  const handleUndo = useCallback(() => {
    if (hasEditHistory) {
      handleUndoStep();
      return;
    }
    if (modifiedRows.size === 0 && deletedIndices.size === 0 && newRows.length === 0) return;
    appModal.confirm({ title: t('common.undoModifications'), content: t('common.confirmDiscardAllChanges'), transitionName: '', maskTransitionName: '',
      onOk: () => { setModifiedRows(new Map()); setDeletedIndices(new Set()); setNewRows([]); message.info(t('common.allChangesRevoked')); },
    });
  }, [hasEditHistory, handleUndoStep, modifiedRows, deletedIndices, newRows, message, t]);

  // 删除选中（已有行 → 标记删除，新增行 → 直接从 newRows 移除）
  const handleDeleteSelected = useCallback(() => {
    if (!isEditable) { message.warning(t('common.currentResultSetNotEditable')); return; }
    if (selectedIndices.size === 0) { message.warning(t('common.pleaseSelectRowsToDelete')); return; }

    const selected = Array.from(selectedIndices)
      .filter((i) => i < allRows.length)
      .map((i) => allRows[i]);

    const newRowKs: number[] = []; // newRows 中的索引
    const existingIds: number[] = [];

    for (const row of selected) {
      if (row.__isNew) {
        const k = parseInt((row.__id as string).slice(4), 10);
        if (!isNaN(k)) newRowKs.push(k);
      } else {
        existingIds.push(row.__id as number);
      }
    }

    const count = newRowKs.length + existingIds.length;
    if (count === 0) return;

    appModal.confirm({
      title: t('common.confirmDelete'),
      content: t('common.confirmMarkRowsForDeletion', { count }),
      okText: existingIds.length > 0 ? t('common.markForDeletion') : t('common.delete'),
      okType: 'danger', transitionName: '', maskTransitionName: '',
      onOk: () => {
        if (newRowKs.length > 0) {
          setNewRows((prev) => prev.filter((_, i) => !newRowKs.includes(i)));
        }
        if (existingIds.length > 0) {
          setDeletedIndices((prev) => { const n = new Set(prev); existingIds.forEach((i) => n.add(i)); return n; });
        }
        setSelectedIndices(new Set());
        if (count > 0) message.success(`${t('common.markedForDeletion')} ${count}`);
      },
    });
  }, [isEditable, selectedIndices, allRows, message, t]);

  // 导出
  const handleExport = useCallback((format: string) => {
    const cols = queryResult.columns; const rows = queryResult.rows;
    if (format === 'csv') { downloadBlob(exportToCsv(cols, rows), 'result.csv', 'text/csv'); message.success(t('common.exportedCsv')); }
    else if (format === 'json') { downloadBlob(exportToJson(cols, rows), 'result.json', 'application/json'); message.success(t('common.exportedJson')); }
    else if (format === 'txt') { downloadBlob(exportToTxt(cols, rows), 'result.txt', 'text/plain'); message.success(t('common.exportedTxt')); }
    else if (format === 'xml') { downloadBlob(exportToXml(cols, rows), 'result.xml', 'application/xml'); message.success(t('common.exportedXml')); }
    else if (format === 'md') { downloadBlob(exportToMd(cols, rows), 'result.md', 'text/markdown'); message.success(t('common.exportedMarkdown')); }
    else if (format === 'xlsx') {
      const data = rows.map((r) => { const o: Record<string, any> = {}; cols.forEach((c, i) => { o[c] = r[i]; }); return o; });
      const cdefs = cols.map((c) => ({ field: c, headerName: c }));
      exportToExcel(data, cdefs, { filename: 'result.xlsx', sheetName: 'Query Result' }); message.success(t('common.exportedExcel'));
    }
  }, [queryResult, message, t]);

  // 错误
  if (queryResult.error)
    return (
      <EnhancedEmptyState
        icon={<ExclamationCircleOutlined style={{ fontSize: 36, color: 'var(--color-error)' }} />}
        title={queryResult.error}
      />
    );

  const hasChanges = modifiedRows.size > 0 || deletedIndices.size > 0 || newRows.length > 0;

  const selectedRows = useMemo(() => {
    return Array.from(selectedIndices)
      .filter((i) => i < allRows.length)
      .map((i) => allRows[i]);
  }, [selectedIndices, allRows]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ padding: '4px 12px', borderBottom: '1px solid var(--border)', background: 'var(--background-toolbar)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 12 }}><strong>{queryResult.rows.length.toLocaleString()}</strong> {t('common.rows')}</span>
        <span style={{ fontSize: 12 }}><strong>{queryResult.columns.length}</strong> {t('common.tableStructure.columns')}</span>
        {executionTime != null && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('common.executionTime')} {executionTime}ms</span>}
        {queryResult.totalTime != null && queryResult.totalTime > 0 && queryResult.totalTime !== executionTime && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{t('common.totalDuration')} {queryResult.totalTime}ms</span>
        )}
        {isEditable && (
          <Tag style={{ margin: 0, fontSize: 11, lineHeight: '20px', background: 'var(--color-primary-alpha-15)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-alpha-30)' }}>
            {t('common.editable')}
          </Tag>
        )}
        {tableName && !isEditable && (
          <Tag color="default" style={{ margin: 0, fontSize: 11, lineHeight: '20px' }}>
            <ExclamationCircleOutlined /> {t('common.readOnly')}
          </Tag>
        )}
        <div style={{ flex: 1 }} />
        <Dropdown menu={{ items: [
          { key: 'csv', label: t('common.exportedCsv'), onClick: () => handleExport('csv') },
          { key: 'json', label: t('common.exportedJson'), onClick: () => handleExport('json') },
          { key: 'xlsx', label: t('common.exportedExcel'), onClick: () => handleExport('xlsx') },
          { type: 'divider' as const },
          { key: 'txt', label: t('common.exportedTxt'), onClick: () => handleExport('txt') },
          { key: 'xml', label: t('common.exportedXml'), onClick: () => handleExport('xml') },
          { key: 'md', label: t('common.exportedMarkdown'), onClick: () => handleExport('md') },
        ]}}>
          <Button size="small" icon={<DownloadOutlined />} style={{ fontSize: 11, height: 22 }}>{t('common.export')}</Button>
        </Dropdown>
        <Button
          size="small"
          icon={<BgColorsOutlined />}
          onClick={() => setFormatPanelVisible((v) => !v)}
          style={{ fontSize: 11, height: 22 }}
          type={formatRules.length > 0 ? 'primary' : 'default'}
        >
          {t('common.dataGrid.conditionalFormatting')}
        </Button>
        {isEditable && hasChanges && (
          <Space size={4}>
            <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleCommit} style={{ fontSize: 11, height: 22 }}>{t('common.submit')}</Button>
            <Button size="small" icon={<UndoOutlined />} onClick={handleUndo} style={{ fontSize: 11, height: 22 }}>{t('common.undo')}</Button>
            <Button size="small" icon={<CodeOutlined />} onClick={() => appModal.info({ title: t('common.operationSqlPreview'), width: 800, content: <pre style={{ maxHeight: 400, overflow: 'auto', background: 'var(--background-toolbar)', padding: 12, borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{operationSql}</pre>, transitionName: '', maskTransitionName: '' })} style={{ fontSize: 11, height: 22 }}>{t('common.sqlQuery')}</Button>
          </Space>
        )}
        {isEditable && (
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              const newRow = queryResult.columns.map(() => null);
              setNewRows((prev) => {
                const next = [...prev, newRow];
                setScrollToRowIndex(queryResult.rows.length + next.length - 1);
                return next;
              });
            }}
            style={{ fontSize: 11, height: 22 }}
          >
            {t('common.addNewRow')}
          </Button>
        )}
        {isEditable && <Button size="small" danger icon={<DeleteOutlined />} onClick={handleDeleteSelected} disabled={selectedIndices.size === 0} style={{ fontSize: 11, height: 22 }}>{t('common.dataGrid.deleteRow')}</Button>}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <GlideDataTable
          columns={glideColumns}
          rows={glideRows}
          rowStatus={rowStatus}
          isCellModified={isCellModified}
          scrollToRowIndex={scrollToRowIndex}
          onSelectionChange={handleSelectionChange}
          onCellEdited={handleCellEdited}
          onCellsEdited={handleCellsEdited}
          onCellContextMenu={(col, row, bounds) => {
            const colName = queryResult.columns[col];
            const rowData = row >= 0 && row < queryResult.rows.length ? queryResult.rows[row] : undefined;
            openMenu(bounds.x, bounds.y, {
              row,
              col,
              cellValue: rowData?.[col],
              colName,
              rowData: rowData ? { ...rowData, __row_index: row } : undefined,
            });
          }}
          editable={isEditable}
          enableFindReplace
          formatRules={formatRules}
        />
        <ConditionalFormattingPanel
          visible={formatPanelVisible}
          onClose={() => setFormatPanelVisible(false)}
          rules={formatRules}
          onRulesChange={setFormatRules}
          columns={queryResult.columns}
        />
      </div>

      <ResultGridContextMenu
        menuState={menuState}
        menuTarget={menuTarget}
        selectedRows={selectedRows}
        context={{
          dbType,
          tableName: tableName ?? undefined,
          database,
          columns: tableColumns,
          queryColumns: queryResult.columns,
          isEditable,
          onCopyToClipboard: (text) => navigator.clipboard.writeText(text),
          onCellEdited: handleCellEdited,
        }}
        onClose={closeMenu}
        onAddRow={() => {
          const newRow = queryResult.columns.map(() => null);
          setNewRows((prev) => {
            const next = [...prev, newRow];
            setScrollToRowIndex(queryResult.rows.length + next.length - 1);
            return next;
          });
        }}
      />

      {/* SQL Preview + 快捷提交/撤销 */}
      {isEditable && operationSql && (
        <div
          style={{
            padding: '4px 12px',
            borderTop: '1px solid var(--border)',
            background: 'var(--background-toolbar)',
            fontSize: 11,
            fontFamily: 'monospace',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'var(--color-primary)', flexShrink: 0 }}>SQL ▶</span>
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 48, overflow: 'auto' }}>
            {operationSql}
          </span>
          <Space size={4} style={{ flexShrink: 0 }}>
            <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleCommit} style={{ fontSize: 11, height: 22 }}>{t('common.submit')}</Button>
            <Button size="small" icon={<UndoOutlined />} onClick={handleUndo} style={{ fontSize: 11, height: 22 }}>{t('common.undo')}</Button>
          </Space>
        </div>
      )}
    </div>
  );
}

// ── ExplainPlanGrid ──
// Color-coding helpers for explain plan rows (MySQL `type` column values)
const ACCESS_TYPE_COLORS: Record<string, { bg: string; fg: string; level: 'good' | 'moderate' | 'bad' }> = {
  system:   { bg: '#e6ffed', fg: '#1a7f37', level: 'good' },
  const:    { bg: '#e6ffed', fg: '#1a7f37', level: 'good' },
  eq_ref:   { bg: '#e6ffed', fg: '#1a7f37', level: 'good' },
  ref:      { bg: '#e6ffed', fg: '#1a7f37', level: 'good' },
  range:    { bg: '#e6ffed', fg: '#1a7f37', level: 'good' },
  index:    { bg: '#fff8c5', fg: '#9a6700', level: 'moderate' },
  ALL:      { bg: '#ffebe9', fg: '#cf222e', level: 'bad' },
  fulltext: { bg: '#fff8c5', fg: '#9a6700', level: 'moderate' },
  ref_or_null: { bg: '#e6ffed', fg: '#1a7f37', level: 'good' },
  index_merge: { bg: '#fff8c5', fg: '#9a6700', level: 'moderate' },
  unique_subquery: { bg: '#e6ffed', fg: '#1a7f37', level: 'good' },
  index_subquery:  { bg: '#fff8c5', fg: '#9a6700', level: 'moderate' },
};

function getRowColor(data: Record<string, unknown>): { bg: string; fg: string } | null {
  // MySQL: check `type` column (access type)
  const accessType = data.type ?? data.access_type;
  if (typeof accessType === 'string') {
    const match = ACCESS_TYPE_COLORS[accessType];
    if (match) return { bg: match.bg, fg: match.fg };
  }

  // Check `Extra` column for warning signals
  const extra = typeof data.Extra === 'string' ? data.Extra : '';
  if (/Using filesort|Using temporary/i.test(extra)) {
    return { bg: '#ffebe9', fg: '#cf222e' };
  }

  // PostgreSQL: color based on cost (if present)
  if (typeof data['Total Cost'] === 'number') {
    const cost = data['Total Cost'] as number;
    if (cost < 100) return { bg: '#e6ffed', fg: '#1a7f37' };
    if (cost < 10000) return { bg: '#fff8c5', fg: '#9a6700' };
    return { bg: '#ffebe9', fg: '#cf222e' };
  }

  return null;
}

// Detect MySQL-style explain output (has `id`, `select_type` columns)
function isMySQLExplain(columns: string[]): boolean {
  return columns.includes('id') || columns.includes('select_type');
}

// Detect PostgreSQL explain output (has `QUERY PLAN` or `query plan` column)
function isPGExplain(columns: string[]): boolean {
  return columns.some(c => c.toLowerCase().includes('query plan'));
}

// Compute indent level from MySQL row data
function getMySQLIndent(row: Record<string, unknown>): number {
  const id = row.id;
  if (typeof id === 'number') return Math.max(0, id - 1);
  return 0;
}

// Compute indent level from PG text (count leading spaces / arrows)
function getPGIndent(text: string): number {
  // Count leading spaces or arrow markers (→)
  const match = text.match(/^(\s*(?:->\s*)*)/);
  if (!match) return 0;
  // Count the number of "-> " markers as indent levels
  const arrows = (match[1].match(/->/g) || []).length;
  return arrows;
}

// Dark-mode aware color overrides
function adjustColor(color: string, isDark: boolean): string {
  if (!isDark) return color;
  // Simple dark-mode adjustments
  const darkMap: Record<string, string> = {
    '#e6ffed': '#1a3a2a',
    '#fff8c5': '#3a3520',
    '#ffebe9': '#3a2020',
    '#1a7f37': '#56d364',
    '#9a6700': '#e3b341',
    '#cf222e': '#f85149',
  };
  return darkMap[color] || color;
}

export function ExplainPlanGrid({ data, isDark }: { data: any[]; isDark: boolean }) {
  const { t } = useTranslation();

  if (!data || data.length === 0) {
    return <Empty description={t('common.noExplainPlanData')} />;
  }

  const columns = Object.keys(data[0]);
  const isMySQL = isMySQLExplain(columns);
  const isPG = isPGExplain(columns);

  // For PG explain, show a single-column text view with indentation
  if (isPG && columns.length === 1) {
    const pgCol = columns[0];
    return (
      <div style={{ height: '100%', overflow: 'auto', fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace", fontSize: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--background-toolbar)', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ textAlign: 'left', padding: '6px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 11 }}>{pgCol}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const text = String(row[pgCol] ?? '');
              const indent = getPGIndent(text);
              const cleanText = text.replace(/^\s*(?:->\s*)*/, '');
              const isPlanLine = /^\s*->/.test(text);
              const bg = isPlanLine ? (i % 2 === 0 ? 'var(--background-elevated)' : 'transparent') : 'transparent';
              return (
                <tr key={i} style={{ background: bg }}>
                  <td style={{
                    padding: '3px 12px 3px ' + (12 + indent * 20) + 'px',
                    borderBottom: '1px solid var(--border-subtle, #f0f0f0)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: isPlanLine ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}>
                    {isPlanLine && <span style={{ color: 'var(--color-primary)', marginRight: 4, userSelect: 'none' }}>→</span>}
                    {cleanText}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // MySQL / generic table-style explain
  // Prioritize important columns first, then the rest
  const priorityCols = ['id', 'select_type', 'table', 'type', 'possible_keys', 'key', 'key_len', 'ref', 'rows', 'filtered', 'Extra'];
  const orderedCols = isMySQL
    ? [...priorityCols.filter(c => columns.includes(c)), ...columns.filter(c => !priorityCols.includes(c))]
    : columns;

  return (
    <div style={{ height: '100%', overflow: 'auto', fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace", fontSize: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--background-toolbar)', position: 'sticky', top: 0, zIndex: 1 }}>
            {orderedCols.map(col => (
              <th key={col} style={{
                textAlign: 'left',
                padding: '6px 10px',
                borderBottom: '1px solid var(--border)',
                fontWeight: 600,
                fontSize: 11,
                whiteSpace: 'nowrap',
                color: 'var(--text-secondary)',
                borderRight: '1px solid var(--border-subtle, #f0f0f0)',
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => {
            const color = getRowColor(row as Record<string, unknown>);
            const indent = isMySQL ? getMySQLIndent(row as Record<string, unknown>) : 0;
            const bg = color
              ? adjustColor(color.bg, isDark)
              : (rowIdx % 2 === 0 ? 'transparent' : 'var(--background-elevated)');

            return (
              <tr key={rowIdx} style={{ background: bg }}>
                {orderedCols.map((col, colIdx) => {
                  const val = row[col];
                  const display = val == null ? 'NULL' : String(val);
                  const isNull = val == null;
                  const isIndentCol = isMySQL && colIdx === 0; // indent on first column
                  const isTypeCol = col === 'type' || col === 'access_type';
                  const isExtraCol = col === 'Extra';
                  const isKeyCol = col === 'key';

                  // Highlight bad signals in Extra
                  let cellColor: string | undefined;
                  if (isTypeCol && color) {
                    cellColor = adjustColor(color.fg, isDark);
                  }
                  if (isExtraCol && /Using filesort|Using temporary/i.test(display)) {
                    cellColor = adjustColor('#cf222e', isDark);
                  }
                  if (isKeyCol && display === 'NULL') {
                    cellColor = adjustColor('#cf222e', isDark);
                  }

                  return (
                    <td key={col} style={{
                      padding: '4px 10px',
                      borderBottom: '1px solid var(--border-subtle, #f0f0f0)',
                      borderRight: '1px solid var(--border-subtle, #f0f0f0)',
                      whiteSpace: 'nowrap',
                      color: isNull ? 'var(--text-tertiary, #999)' : cellColor,
                      fontStyle: isNull ? 'italic' : 'normal',
                      paddingLeft: isIndentCol ? (10 + indent * 24) + 'px' : undefined,
                    }}>
                      {isIndentCol && indent > 0 && (
                        <span style={{
                          display: 'inline-block',
                          width: indent * 24,
                          marginRight: 4,
                          userSelect: 'none',
                          color: 'var(--text-tertiary, #999)',
                        }}>
                          {'└' + '─'.repeat(Math.max(0, indent - 1))}
                        </span>
                      )}
                      {display}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
