/**
 * ResultGrid — SQL 查询结果展示组件（Glide Data Grid 版）
 *
 * 完整功能：拖拽多选、内联编辑、新增行Modal、右键菜单(INSERT/UPDATE/DELETE)、
 * 多格式导出(CSV/JSON/Excel/TXT/XML/MD)、底部SQL预览、提交/撤销。
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button, Space, Empty, Tag, App, Modal, Dropdown } from 'antd';
import {
  DeleteOutlined, SaveOutlined, UndoOutlined, CodeOutlined,
  PlusOutlined, DownloadOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDatabase } from '../../hooks/useApi';
import type { QueryResult, DatabaseType, ColumnInfo } from '../../types/api';
import { exportToExcel } from '../../utils/exportUtils';
import { escapeSqlValue, escapeSqlIdentifier } from '../../utils/sqlUtils';
import DataEditor from '@glideapps/glide-data-grid';
import { GlideDataTable, type GlideRow } from '../DataTable/GlideDataTable';
import { namesToGlideColumns, createResultCellModified } from '../DataTable/adapters/resultAdapter';
import { useContextMenu } from '../ContextMenu';
import { ResultGridContextMenu } from './ResultGridContextMenu';

// ── Types ──
interface ResultGridProps {
  queryResult: QueryResult & { executionTime?: number; totalTime?: number };
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

// ── SQL 生成 ──
function generateInsertSql(tableName: string, cols: string[], rows: unknown[][], dbType?: DatabaseType): string {
  const tr = escapeSqlIdentifier(tableName, dbType);
  const cs = cols.map((c) => escapeSqlIdentifier(c, dbType)).join(', ');
  const vals = rows.map((r) => `(${r.map((v) => escapeSqlValue(v, dbType)).join(', ')})`).join(',\n');
  return `INSERT INTO ${tr} (${cs})\nVALUES\n${vals};`;
}
function generateUpdateSql(tableName: string, cols: string[], row: unknown[], pkCol: string, pkIdx: number, dbType?: DatabaseType): string {
  const tr = escapeSqlIdentifier(tableName, dbType);
  const ss = cols.map((c, i) => `${escapeSqlIdentifier(c, dbType)} = ${escapeSqlValue(row[i], dbType)}`).filter((_, i) => i !== pkIdx).join(', ');
  return `UPDATE ${tr} SET ${ss} WHERE ${escapeSqlIdentifier(pkCol, dbType)} = ${escapeSqlValue(row[pkIdx], dbType)}`;
}
function generateDeleteSql(tableName: string, pkCol: string, pkValues: unknown[], dbType?: DatabaseType): string {
  const tr = escapeSqlIdentifier(tableName, dbType);
  return `DELETE FROM ${tr} WHERE ${escapeSqlIdentifier(pkCol, dbType)} IN (${pkValues.map((v) => escapeSqlValue(v, dbType)).join(', ')});`;
}

// ── 导出工具 ──
function downloadBlob(content: string, name: string, type: string) {
  const blob = new Blob([content], { type }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
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

  const tableName = useMemo(() => (originalSql ? extractTable(originalSql) : null), [originalSql]);
  const [tableColumns, setTableColumns] = useState<ColumnInfo[]>([]);
  const primaryKeyCol = useMemo(() => tableColumns.find((c) => c.column_key === 'PRI') || null, [tableColumns]);
  const isEditable = !!(tableName && primaryKeyCol && connectionId);

  useEffect(() => {
    if (!connectionId || !tableName) { setTableColumns([]); return; }
    getColumns(connectionId, tableName, database).then(setTableColumns).catch(() => setTableColumns([]));
  }, [connectionId, tableName, database, getColumns]);

  // 重新执行 SQL 时清除编辑状态
  useEffect(() => {
    setModifiedRows(new Map());
    setDeletedIndices(new Set());
    setNewRows([]);
    setSelectedIndices(new Set());
    setOperationSql('');
  }, [queryResult]);

  // 编辑状态
  const [modifiedRows, setModifiedRows] = useState<Map<number, unknown[]>>(new Map());
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set());
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [newRows, setNewRows] = useState<unknown[][]>([]);
  const [operationSql, setOperationSql] = useState('');
  const [scrollToRowIndex, setScrollToRowIndex] = useState<number | undefined>(undefined);
  const { menuState, menuTarget, openMenu, closeMenu } = useContextMenu();

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

    const originalVal = queryResult.rows[rowId][col];
    const originalStr = originalVal === null ? 'NULL' : String(originalVal);

    if (originalStr === newValue) {
      setModifiedRows((prev) => {
        if (!prev.has(rowId)) return prev;
        const next = new Map(prev);
        const current = [...next.get(rowId)!];
        current[col] = originalVal;
        const originalRow = queryResult.rows[rowId];
        const allSame = originalRow.every((v, i) => v === current[i]);
        if (allSame) next.delete(rowId);
        else next.set(rowId, current);
        return next;
      });
      return;
    }

    setModifiedRows((prev) => {
      const next = new Map(prev);
      const current = next.get(rowId) ? [...next.get(rowId)!] : [...queryResult.rows[rowId]];
      current[col] = newValue === 'NULL' ? null : newValue;
      next.set(rowId, current);
      return next;
    });
  }, [isEditable, queryResult]);

  // 生成操作SQL
  useEffect(() => {
    if (!tableName || !primaryKeyCol) { setOperationSql(''); return; }
    const pkIdx = queryResult.columns.indexOf(primaryKeyCol.column_name);
    if (pkIdx < 0) { setOperationSql(''); return; }
    const lines: string[] = [];
    for (const row of newRows) {
      const cols: string[] = []; const vals: unknown[] = [];
      row.forEach((v, i) => { if (v !== null) { cols.push(queryResult.columns[i]); vals.push(v); } });
      if (cols.length === 0) continue;
      lines.push(`INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${cols.map((c) => escapeSqlIdentifier(c, dbType)).join(', ')}) VALUES (${vals.map((v) => escapeSqlValue(v, dbType)).join(', ')});`);
    }
    for (const [rowId, row] of modifiedRows) {
      if (deletedIndices.has(rowId)) continue;
      const ss = queryResult.columns.map((c, i) => `${escapeSqlIdentifier(c, dbType)} = ${escapeSqlValue(row[i], dbType)}`).join(', ');
      lines.push(`UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${ss} WHERE ${escapeSqlIdentifier(primaryKeyCol.column_name, dbType)} = ${escapeSqlValue(queryResult.rows[rowId][pkIdx], dbType)};`);
    }
    for (const rowId of deletedIndices) {
      lines.push(`DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(primaryKeyCol.column_name, dbType)} = ${escapeSqlValue(queryResult.rows[rowId][pkIdx], dbType)};`);
    }
    setOperationSql(lines.join('\n'));
  }, [modifiedRows, deletedIndices, newRows, tableName, primaryKeyCol, queryResult, dbType]);

  // 提交
  const handleCommit = useCallback(async () => {
    if (!connectionId || !tableName || !primaryKeyCol) return;
    const pkIdx = queryResult.columns.indexOf(primaryKeyCol.column_name);
    if (pkIdx < 0) return;
    try {
      let success = 0, errMsg = '';
      for (const row of newRows) {
        const cols: string[] = []; const vals: unknown[] = [];
        row.forEach((v, i) => { if (v !== null) { cols.push(queryResult.columns[i]); vals.push(v); } });
        if (cols.length === 0) continue;
        const sql = `INSERT INTO ${escapeSqlIdentifier(tableName, dbType)} (${cols.map((c) => escapeSqlIdentifier(c, dbType)).join(', ')}) VALUES (${vals.map((v) => escapeSqlValue(v, dbType)).join(', ')})`;
        const res = await executeQuery(connectionId, sql, database);
        if (res.error) { errMsg = res.error; break; } success++;
      }
      if (!errMsg) {
        for (const [rowId, row] of modifiedRows) {
          if (deletedIndices.has(rowId)) continue;
          const ss = queryResult.columns.map((c, i) => `${escapeSqlIdentifier(c, dbType)} = ${escapeSqlValue(row[i], dbType)}`).join(', ');
          const sql = `UPDATE ${escapeSqlIdentifier(tableName, dbType)} SET ${ss} WHERE ${escapeSqlIdentifier(primaryKeyCol.column_name, dbType)} = ${escapeSqlValue(queryResult.rows[rowId][pkIdx], dbType)}`;
          const res = await executeQuery(connectionId, sql, database);
          if (res.error) { errMsg = res.error; break; } success++;
        }
      }
      if (!errMsg) {
        for (const rowId of deletedIndices) {
          const sql = `DELETE FROM ${escapeSqlIdentifier(tableName, dbType)} WHERE ${escapeSqlIdentifier(primaryKeyCol.column_name, dbType)} = ${escapeSqlValue(queryResult.rows[rowId][pkIdx], dbType)}`;
          const res = await executeQuery(connectionId, sql, database);
          if (res.error) { errMsg = res.error; break; } success++;
        }
      }
      if (errMsg) message.error(`${t('common.submitFailed')}: ${errMsg}`);
      else { message.success(`${t('common.submittedSuccessfully')} ${success}`); setModifiedRows(new Map()); setDeletedIndices(new Set()); setNewRows([]); }
    } catch (err: any) { message.error(`${t('common.submitFailed')}: ${err.message || err}`); }
  }, [connectionId, tableName, primaryKeyCol, modifiedRows, deletedIndices, newRows, queryResult, dbType, database, executeQuery, message, t]);

  // 撤销
  const handleUndo = useCallback(() => {
    Modal.confirm({ title: t('common.undoModifications'), content: t('common.confirmDiscardAllChanges'), transitionName: '', maskTransitionName: '',
      onOk: () => { setModifiedRows(new Map()); setDeletedIndices(new Set()); setNewRows([]); message.info(t('common.allChangesRevoked')); },
    });
  }, [message, t]);

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

    Modal.confirm({
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

  // 错误/空
  if (queryResult.error) return <Empty description={<span style={{ color: 'var(--color-error)' }}>{queryResult.error}</span>} />;
  if (queryResult.rows.length === 0) return <Empty description={originalSql ? t('common.noDataReturned') : undefined} />;

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
        {isEditable && <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{t('common.editable')}</Tag>}
        {tableName && !isEditable && <Tag color="default" style={{ margin: 0, fontSize: 11 }}><ExclamationCircleOutlined /> {t('common.readOnly')}</Tag>}
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
        {isEditable && hasChanges && (
          <Space size={4}>
            <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleCommit} style={{ fontSize: 11, height: 22 }}>{t('common.submit')}</Button>
            <Button size="small" icon={<UndoOutlined />} onClick={handleUndo} style={{ fontSize: 11, height: 22 }}>{t('common.undo')}</Button>
            <Button size="small" icon={<CodeOutlined />} onClick={() => Modal.info({ title: t('common.operationSqlPreview'), width: 800, content: <pre style={{ maxHeight: 400, overflow: 'auto', background: 'var(--background-toolbar)', padding: 12, borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{operationSql}</pre>, transitionName: '', maskTransitionName: '' })} style={{ fontSize: 11, height: 22 }}>{t('common.sqlQuery')}</Button>
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
      <div style={{ flex: 1, minHeight: 0 }}>
        <GlideDataTable
          columns={glideColumns}
          rows={glideRows}
          rowStatus={rowStatus}
          isCellModified={isCellModified}
          scrollToRowIndex={scrollToRowIndex}
          onSelectionChange={handleSelectionChange}
          onCellEdited={handleCellEdited}
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
        />
      </div>

      <ResultGridContextMenu
        menuState={menuState}
        menuTarget={menuTarget}
        selectedRows={selectedRows}
        context={{
          dbType,
          tableName: tableName ?? undefined,
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

      {/* SQL Preview */}
      {isEditable && operationSql && (
        <div style={{ padding: '4px 12px', borderTop: '1px solid var(--border)', background: 'var(--background-toolbar)', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 60, overflow: 'auto', flexShrink: 0 }}>
          <span style={{ color: 'var(--color-primary)', marginRight: 8 }}>SQL ▶</span>{operationSql}
        </div>
      )}
    </div>
  );
}

// ── ExplainPlanGrid ──
export function ExplainPlanGrid({ data, isDark }: { data: any[]; isDark: boolean }) {
  const { t } = useTranslation();
  if (!data || data.length === 0) return <Empty description={t('common.noExplainPlanData')} />;
  const colNames = Object.keys(data[0]);
  const columns = colNames.map((n) => ({ id: n, title: n, width: 150, grow: 1 }));
  const rows = data.map((r) => { const o: Record<string, unknown> = {}; colNames.forEach((c) => { o[c] = r[c]; }); return o; });
  const getCellContent = ([col, row]: readonly [number, number]) => ({
    kind: 'text' as 'text', data: rows[row]?.[colNames[col]] == null ? '' : String(rows[row]?.[colNames[col]]),
    displayData: rows[row]?.[colNames[col]] == null ? 'NULL' : String(rows[row]?.[colNames[col]]),
    allowOverlay: false, readonly: true,
  } as any);
  return <DataEditor columns={columns} rows={rows.length} getCellContent={getCellContent} headerHeight={32} rowHeight={28} rowMarkers="number" smoothScrollX smoothScrollY width="100%" height="100%" />;
}
