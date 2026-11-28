/**
 * ResultGrid — SQL 查询结果展示组件（Glide Data Grid 版）
 *
 * 完整功能：拖拽多选、内联编辑、新增行Modal、右键菜单(INSERT/UPDATE/DELETE)、
 * 多格式导出(CSV/JSON/Excel/TXT/XML/MD)、底部SQL预览、提交/撤销。
 */
import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { Button, Space, Empty, Tag, App, Dropdown } from 'antd';
import {
  DeleteOutlined,
  SaveOutlined,
  UndoOutlined,
  PlusOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  BgColorsOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ResultExportDialog, type ExportFormat } from './ResultExportDialog';
import { useDatabase } from '../../hooks/useApi';
import type { QueryResult, DatabaseType, ColumnInfo } from '../../types/api';
import { getDialect } from '../../utils/sqlDialects';
import { GlideDataTable, type GlideRow } from '../DataTable/GlideDataTable';
import { EnhancedEmptyState } from '../LoadingStates';
import { createResultCellModified } from '../DataTable/adapters/resultAdapter';
import { useContextMenu } from '../ContextMenu';
import { ResultGridContextMenu } from './ResultGridContextMenu';
import { useEditHistory } from '../../hooks/useEditHistory';
import {
  diffRowSetters,
  isSameEditValue,
  primaryKeyLiteral,
  runEditStatement,
  uniqueColumnIds,
} from '../DataTable/utils';
import { buildResultSetTableRef, extractTableRefParts, tableLookupName } from './resultTable';
import { appModal } from '../../utils/appModal';
import {
  ConditionalFormattingPanel,
  type FormatRule,
} from '../DataTable/ConditionalFormattingPanel';
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
  /** 结果集内未提交编辑的脏状态，供 SQL tab 关闭保护/重新执行确认使用 */
  onDirtyChange?: (dirty: boolean, scope?: number) => void;
  /** 多结果时的结果序号，用于父组件按结果聚合脏状态 */
  dirtyScope?: number;
}

// ── Component ──
export const ResultGrid = memo(function ResultGrid({
  queryResult,
  executionTime,
  connectionId,
  database,
  originalSql,
  dbType,
  onDirtyChange,
  dirtyScope,
}: ResultGridProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { getColumns, executeQuery } = useDatabase();

  const sqlForExtract = queryResult.executedSql || originalSql || '';
  // 被查询的那张表（含 SQL 里的限定部分）。定位不到唯一的一张表 → null，结果集只读
  const tableParts = useMemo(
    () => (sqlForExtract ? extractTableRefParts(sqlForExtract) : null),
    [sqlForExtract]
  );
  const tableName = tableParts ? tableParts[tableParts.length - 1].name : null;
  // 取列信息时按 SQL 里的写法带上限定部分（`库.表` / `schema.表`）。只拿表名去查的话，
  // MySQL 会在当前库里找同名表，PG 会把各个 schema 里的同名表混在一起
  const tableLookup = useMemo(
    () => (tableParts ? tableLookupName(tableParts, dbType) : ''),
    [tableParts, dbType]
  );
  // 列信息连同它对应的表一起存：换了结果集、新的列信息还没回来（或晚到的旧响应）时，
  // 不能拿上一张表的主键去定位这一张表的行
  const columnsKey = `${connectionId ?? ''}\u0000${tableLookup}\u0000${database ?? ''}`;
  const [columnsState, setColumnsState] = useState<{ key: string; cols: ColumnInfo[] }>({
    key: '',
    cols: [],
  });
  const tableColumns = useMemo(
    () => (columnsState.key === columnsKey ? columnsState.cols : []),
    [columnsState, columnsKey]
  );
  // 全部主键列：行定位 WHERE 必须全列 AND——只取第一列时复合主键值组合重复
  // 的行会命中多行（UPDATE/DELETE 扩散，数据风险）
  const primaryKeyCols = useMemo(
    () => tableColumns.filter((c) => c.column_key === 'PRI'),
    [tableColumns]
  );
  // 列信息里出现重名列，说明这张表没定位到唯一的一张（PG 不带 schema 时各 schema 的
  // 同名表会合并在一起）：主键可能是另一张表的，不能拿它去定位行
  const tableColumnsAmbiguous =
    new Set(tableColumns.map((c) => c.column_name)).size !== tableColumns.length;
  // 可编辑条件收紧：所有主键列都必须出现在查询结果列中（缺一列行就不可定位）
  const isEditable = !!(
    tableName &&
    primaryKeyCols.length > 0 &&
    !tableColumnsAmbiguous &&
    connectionId &&
    primaryKeyCols.every((c) => queryResult.columns.includes(c.column_name))
  );
  // isEditable 定义在 primaryKeyCols 之后（上方）——此处删除旧的单列主键版本

  useEffect(() => {
    if (!connectionId || !tableName) {
      setColumnsState({ key: columnsKey, cols: [] });
      return;
    }
    getColumns(connectionId, tableLookup || tableName, database)
      .then((cols) => {
        setColumnsState({ key: columnsKey, cols });
      })
      .catch(() => {
        setColumnsState({ key: columnsKey, cols: [] });
      });
  }, [connectionId, tableName, tableLookup, columnsKey, database, getColumns]);

  // 编辑状态
  const [modifiedRows, setModifiedRows] = useState<Map<number, unknown[]>>(new Map());
  // ref 同步最新 modifiedRows，供 handleCellEdited 同步读取「当前值」避免闭包陈旧
  const modifiedRowsRef = useRef(modifiedRows);
  useEffect(() => {
    modifiedRowsRef.current = modifiedRows;
  }, [modifiedRows]);
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set());
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [newRows, setNewRows] = useState<unknown[][]>([]);
  const [operationSql, setOperationSql] = useState('');
  const [scrollToRowIndex, setScrollToRowIndex] = useState<number | undefined>(undefined);
  const { menuState, menuTarget, openMenu, closeMenu } = useContextMenu();

  // Conditional formatting
  const [formatRules, setFormatRules] = useState<FormatRule[]>([]);
  const [formatPanelVisible, setFormatPanelVisible] = useState(false);

  // 网格列 id（重名列按出现次序编号）：行对象以它为键、按下标取值，重名列各是各的
  const columnIds = useMemo(() => uniqueColumnIds(queryResult.columns), [queryResult.columns]);

  // 行数据
  const allRows = useMemo(() => {
    const existing = queryResult.rows
      .map((row, i) => {
        if (deletedIndices.has(i)) return null;
        const r = modifiedRows.has(i) ? modifiedRows.get(i)! : row;
        const obj: Record<string, unknown> = { __id: i, __isNew: false };
        columnIds.forEach((id, j) => {
          obj[id] = r[j];
        });
        return obj;
      })
      .filter(Boolean) as Record<string, unknown>[];
    const newOnes = newRows.map((row, i) => {
      const obj: Record<string, unknown> = { __id: `new-${i}`, __isNew: true };
      columnIds.forEach((id, j) => {
        obj[id] = row[j];
      });
      return obj;
    });
    return [...existing, ...newOnes];
  }, [queryResult.rows, columnIds, modifiedRows, deletedIndices, newRows]);

  // 行状态回调
  const rowStatus = useCallback(
    (row: GlideRow) => {
      const id = row.__id as number;
      if (deletedIndices.has(id)) return 'deleted' as const;
      if (modifiedRows.has(id)) return 'modified' as const;
      return undefined;
    },
    [deletedIndices, modifiedRows]
  );

  const isCellModified = useMemo(
    () => createResultCellModified(modifiedRows, columnIds, queryResult.rows),
    [modifiedRows, columnIds, queryResult.rows]
  );

  // 列头编码 name|type|isPK|comment（与表数据浏览一致）：
  // 类型/注释来自 SQL 中识别到的表结构（单表查询可完整匹配；
  // join/别名列匹配不到则退化为仅列名），GlideDataTable 的
  // drawHeader 渲染类型与 PK 标记、hover tooltip 显示注释
  const glideColumns = useMemo(() => {
    const typeMap = new Map(tableColumns.map((c) => [c.column_name, c.data_type]));
    const commentMap = new Map(tableColumns.map((c) => [c.column_name, c.comment || '']));
    const pkSet = new Set(
      tableColumns.filter((c) => c.column_key === 'PRI').map((c) => c.column_name)
    );
    // 结果集没有列元数据：按列名 + 前 50 行文本长度估一个初始宽度，
    // 仍可用表头双击自适应/拖拽微调（全 130px 时宽值列会被截断）
    const estimateWidth = (name: string, idx: number) => {
      let maxLen = name.length;
      const sample = Math.min(queryResult.rows.length, 50);
      for (let i = 0; i < sample; i++) {
        const value = queryResult.rows[i]?.[idx];
        const len = value == null ? 4 : String(value).length;
        if (len > maxLen) maxLen = len;
      }
      return Math.max(90, Math.min(320, Math.ceil(Math.min(maxLen, 36) * 8 + 26)));
    };
    return queryResult.columns.map((name, idx) => ({
      id: columnIds[idx],
      title: `${name}|${typeMap.get(name) || ''}|${pkSet.has(name) ? '1' : '0'}|${commentMap.get(name) || ''}`,
      width: estimateWidth(name, idx),
    }));
  }, [queryResult.columns, columnIds, queryResult.rows, tableColumns]);
  const glideRows = useMemo(() => allRows as GlideRow[], [allRows]);

  // 选中（存储 allRows 中的索引；已有行 __id=数字=原始索引，新增行 = qLen + k）
  const qLen = queryResult.rows.length;
  const handleSelectionChange = useCallback(
    (rows: GlideRow[]) => {
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
    },
    [qLen]
  );

  // 撤销
  const {
    record: recordEdit,
    undo: handleUndoStep,
    clear: clearEditHistory,
    removeByRowId: removeEditHistoryByRowId,
    hasHistory: hasEditHistory,
  } = useEditHistory({
    onRestore: useCallback(
      (cells: Array<{ rowId: string; colId: string; value: unknown }>) => {
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
            const current = next.has(rowIdx)
              ? [...next.get(rowIdx)!]
              : [...queryResult.rows[rowIdx]];
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
      },
      [queryResult.rows]
    ),
    enabled: isEditable,
  });

  // 重新执行 SQL 时清除编辑状态（放在所有 state/hook 声明之后，避免 TDZ 报错）
  useEffect(() => {
    setModifiedRows(new Map());
    setDeletedIndices(new Set());
    setNewRows([]);
    setSelectedIndices(new Set());
    setOperationSql('');
    clearEditHistory();
  }, [queryResult, clearEditHistory]);

  // 内联编辑
  const handleCellEdited = useCallback(
    (col: number, row: number, newValue: string) => {
      if (!isEditable) return;
      const colName = queryResult.columns[col];
      if (!colName) return;
      const rowId = row;

      // 新增行：更新 newRows state
      if (rowId >= queryResult.rows.length) {
        const newRowIndex = rowId - queryResult.rows.length;
        setNewRows((prev) =>
          prev.map((r, i) => {
            if (i !== newRowIndex) return r;
            const updated = [...r];
            updated[col] = newValue === 'NULL' ? null : newValue;
            return updated;
          })
        );
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
            return (
              (v == null && cv == null) || (v != null && cv != null && String(v) === String(cv))
            );
          });
          if (allSame) next.delete(rowId);
          else next.set(rowId, current);
          return next;
        });
        // 仍需入栈一条记录（记录"从已修改值恢复到原始值"），以便撤销时恢复之前的修改
        recordEdit([
          {
            rowId: String(rowId),
            colId: String(col),
            oldValue: currentValue,
            newValue: resolvedNew,
          },
        ]);
        return;
      }

      recordEdit([
        { rowId: String(rowId), colId: String(col), oldValue: currentValue, newValue: resolvedNew },
      ]);

      setModifiedRows((prev) => {
        const next = new Map(prev);
        const current = next.get(rowId) ? [...next.get(rowId)!] : [...originalRow];
        current[col] = resolvedNew;
        next.set(rowId, current);
        return next;
      });
    },
    [isEditable, queryResult, recordEdit]
  );

  // 范围编辑（批量）
  const handleCellsEdited = useCallback(
    (edits: Array<{ col: number; row: number; value: string }>) => {
      for (const edit of edits) {
        handleCellEdited(edit.col, edit.row, edit.value);
      }
    },
    [handleCellEdited]
  );

  // 行定位 WHERE（全主键列 AND）。大整数主键写裸数字，见 primaryKeyLiteral
  const buildRowWhere = useCallback(
    (rowId: number): string | null => {
      const dialect = getDialect(dbType);
      const conds: string[] = [];
      for (const pk of primaryKeyCols) {
        const idx = queryResult.columns.indexOf(pk.column_name);
        if (idx < 0) return null;
        const value = queryResult.rows[rowId]?.[idx];
        conds.push(
          `${dialect.escapeIdentifier(pk.column_name)} = ${primaryKeyLiteral(dialect, pk, value)}`
        );
      }
      return conds.length ? conds.join(' AND ') : null;
    },
    [primaryKeyCols, queryResult, dbType]
  );

  // 生成操作SQL
  useEffect(() => {
    if (!tableName || primaryKeyCols.length === 0) {
      setOperationSql('');
      return;
    }
    const dialect = getDialect(dbType);
    const tableRef = buildResultSetTableRef(tableParts!, database, dbType);
    const lines: string[] = [];
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
      lines.push(dialect.buildInsert(tableRef, cols, [vals])[0] + ';');
    }
    for (const [rowId, row] of modifiedRows) {
      if (deletedIndices.has(rowId)) continue;
      const setters = diffRowSetters(queryResult.rows[rowId], row, queryResult.columns);
      if (Object.keys(setters).length === 0) continue;
      const where = buildRowWhere(rowId);
      if (!where) continue;
      lines.push(dialect.buildUpdate(tableRef, setters, where) + ';');
    }
    for (const rowId of deletedIndices) {
      const where = buildRowWhere(rowId);
      if (!where) continue;
      lines.push(dialect.buildDelete(tableRef, where) + ';');
    }
    setOperationSql(lines.join('\n'));
  }, [
    modifiedRows,
    deletedIndices,
    newRows,
    tableName,
    primaryKeyCols,
    queryResult,
    dbType,
    database,
    tableParts,
    buildRowWhere,
  ]);

  // 提交
  const handleCommit = useCallback(async () => {
    if (!connectionId || !isEditable || !tableParts) return;
    const dialect = getDialect(dbType);
    const tableRef = buildResultSetTableRef(tableParts, database, dbType);
    const run = (kind: 'insert' | 'update' | 'delete', sql: string, where: string) =>
      runEditStatement(
        executeQuery,
        connectionId,
        database,
        kind,
        sql,
        { tableRef, where },
        t('common.dataGrid.noRowMatched')
      );

    // 已经落库的编辑立刻从待提交状态里去掉：中途失败时留下的只有没执行的，
    // 用户处理后再次提交不会把已落库的 INSERT 再执行一遍（重试插出重复行）
    const appliedModified: number[] = [];
    const appliedDeleted: number[] = [];
    const doneNew = new Set<number>(); // 已插入的新行；全成功时连一行都没填的新行一起算做完
    let success = 0;
    let errMsg = '';
    try {
      for (let i = 0; i < newRows.length && !errMsg; i++) {
        const cols: string[] = [];
        const vals: unknown[] = [];
        newRows[i].forEach((v, j) => {
          if (v !== null) {
            cols.push(queryResult.columns[j]);
            vals.push(v);
          }
        });
        if (cols.length === 0) continue;
        const sql = dialect.buildInsert(tableRef, cols, [vals])[0];
        errMsg = (await run('insert', sql, '')) ?? '';
        if (!errMsg) {
          success++;
          doneNew.add(i);
        }
      }
      for (const [rowId, row] of modifiedRows) {
        if (errMsg) break;
        if (deletedIndices.has(rowId)) continue;
        const setters = diffRowSetters(queryResult.rows[rowId], row, queryResult.columns);
        if (Object.keys(setters).length === 0) continue;
        const where = buildRowWhere(rowId);
        if (!where) continue;
        errMsg = (await run('update', dialect.buildUpdate(tableRef, setters, where), where)) ?? '';
        if (!errMsg) {
          success++;
          appliedModified.push(rowId);
        }
      }
      for (const rowId of deletedIndices) {
        if (errMsg) break;
        const where = buildRowWhere(rowId);
        if (!where) continue;
        errMsg = (await run('delete', dialect.buildDelete(tableRef, where), where)) ?? '';
        if (!errMsg) {
          success++;
          appliedDeleted.push(rowId);
        }
      }
    } catch (err: unknown) {
      errMsg = getErrorMessage(err);
    }

    if (errMsg) message.error(`${t('common.submitFailed')}: ${errMsg}`);
    else message.success(`${t('common.submittedSuccessfully')} ${success}`);

    // 没执行的编辑留在网格里（连同撤销历史），落库的不能再撤销
    if (errMsg) {
      if (doneNew.size > 0) setNewRows((prev) => prev.filter((_, i) => !doneNew.has(i)));
      if (appliedModified.length > 0) {
        setModifiedRows((prev) => {
          const next = new Map(prev);
          for (const rowId of appliedModified) next.delete(rowId);
          return next;
        });
        for (const rowId of appliedModified) removeEditHistoryByRowId(String(rowId));
      }
      if (appliedDeleted.length > 0) {
        setDeletedIndices((prev) => {
          const next = new Set(prev);
          for (const rowId of appliedDeleted) next.delete(rowId);
          return next;
        });
      }
    } else {
      setModifiedRows(new Map());
      setDeletedIndices(new Set());
      setNewRows([]);
      clearEditHistory();
    }
  }, [
    isEditable,
    tableParts,
    connectionId,
    primaryKeyCols,
    modifiedRows,
    deletedIndices,
    newRows,
    queryResult,
    dbType,
    database,
    executeQuery,
    message,
    t,
    buildRowWhere,
    removeEditHistoryByRowId,
    clearEditHistory,
  ]);

  // 撤销
  const handleUndo = useCallback(() => {
    if (hasEditHistory) {
      handleUndoStep();
      return;
    }
    if (modifiedRows.size === 0 && deletedIndices.size === 0 && newRows.length === 0) return;
    appModal.confirm({
      title: t('common.undoModifications'),
      content: t('common.confirmDiscardAllChanges'),
      transitionName: '',
      maskTransitionName: '',
      onOk: () => {
        setModifiedRows(new Map());
        setDeletedIndices(new Set());
        setNewRows([]);
        message.info(t('common.allChangesRevoked'));
      },
    });
  }, [hasEditHistory, handleUndoStep, modifiedRows, deletedIndices, newRows, message, t]);

  // 删除选中（已有行 → 标记删除，新增行 → 直接从 newRows 移除）
  const handleDeleteSelected = useCallback(() => {
    if (!isEditable) {
      message.warning(t('common.currentResultSetNotEditable'));
      return;
    }
    if (selectedIndices.size === 0) {
      message.warning(t('common.pleaseSelectRowsToDelete'));
      return;
    }

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
      okType: 'danger',
      transitionName: '',
      maskTransitionName: '',
      onOk: () => {
        if (newRowKs.length > 0) {
          setNewRows((prev) => prev.filter((_, i) => !newRowKs.includes(i)));
        }
        if (existingIds.length > 0) {
          setDeletedIndices((prev) => {
            const n = new Set(prev);
            existingIds.forEach((i) => n.add(i));
            return n;
          });
        }
        setSelectedIndices(new Set());
        if (count > 0) message.success(`${t('common.markedForDeletion')} ${count}`);
      },
    });
  }, [isEditable, selectedIndices, allRows, message, t]);

  // 导出：打开向导（格式预选自菜单项；范围/文件名/CSV 选项在向导内确认）
  const [exportDialog, setExportDialog] = useState<{
    open: boolean;
    format: ExportFormat;
  }>({ open: false, format: 'csv' });
  // 选中行转导出形态：按列名取值（含未提交编辑），与全部行导出同构
  const selectedExportRows = useMemo(
    () =>
      Array.from(selectedIndices)
        .filter((i) => i < allRows.length)
        .map((i) => columnIds.map((id) => allRows[i][id])),
    [selectedIndices, allRows, columnIds]
  );
  const openExportDialog = useCallback((format: string) => {
    setExportDialog({ open: true, format: format as ExportFormat });
  }, []);

  const hasChanges = modifiedRows.size > 0 || deletedIndices.size > 0 || newRows.length > 0;

  // selectedRows 必须在错误早退之前计算：否则错误/成功切换时 hooks 数量变化，
  // React 会抛 "Rendered more hooks than during the previous render"
  const selectedRows = useMemo(() => {
    return Array.from(selectedIndices)
      .filter((i) => i < allRows.length)
      .map((i) => allRows[i]);
  }, [selectedIndices, allRows]);

  // 结果集未提交编辑的脏状态：SQLEditor 用它做重新执行确认，并聚合到 tab dirty
  useEffect(() => {
    onDirtyChange?.(hasChanges, dirtyScope);
  }, [hasChanges, onDirtyChange, dirtyScope]);
  useEffect(() => () => onDirtyChange?.(false, dirtyScope), [onDirtyChange, dirtyScope]);

  // 错误：图标 + 可滚动的等宽详情 + 复制，避免把长报错直接当标题展示导致溢出
  if (queryResult.error) {
    return (
      <div className="result-grid-error">
        <ExclamationCircleOutlined className="result-grid-error-icon" />
        <div className="result-grid-error-title">{t('common.sqlExecutionFailed')}</div>
        <div className="result-grid-error-detail">{queryResult.error}</div>
        <Button
          size="small"
          icon={<CopyOutlined />}
          onClick={() => {
            navigator.clipboard.writeText(queryResult.error || '');
            message.success(t('common.copied'));
          }}
        >
          {t('common.sqlEditor.copyError')}
        </Button>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar：统计信息收进底部状态条，顶部只留编辑标记与操作 */}
      <div className="result-grid-toolbar">
        {isEditable && <Tag className="result-grid-tag is-editable">{t('common.editable')}</Tag>}
        {tableName && !isEditable && (
          <Tag className="result-grid-tag">
            <ExclamationCircleOutlined /> {t('common.readOnly')}
          </Tag>
        )}
        {hasChanges && (
          <Tag className="result-grid-tag is-dirty">
            {t('common.dataGrid.unsavedCount', {
              count: modifiedRows.size + deletedIndices.size + newRows.length,
            })}
          </Tag>
        )}
        <div style={{ flex: 1 }} />
        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={() => openExportDialog('csv')}
          style={{ fontSize: 12, height: 26 }}
          data-testid="result-export-btn"
        >
          {t('common.export')}
        </Button>
        <Button
          size="small"
          icon={<BgColorsOutlined />}
          onClick={() => setFormatPanelVisible((v) => !v)}
          style={{ fontSize: 12, height: 26 }}
          type={formatRules.length > 0 ? 'primary' : 'default'}
        >
          {t('common.dataGrid.conditionalFormatting')}
        </Button>
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
            style={{ fontSize: 12, height: 26 }}
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
            disabled={selectedIndices.size === 0}
            style={{ fontSize: 12, height: 26 }}
          >
            {t('common.dataGrid.deleteRow')}
          </Button>
        )}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {queryResult.columns.length === 0 ? (
          <EnhancedEmptyState
            title={t('common.dataGrid.noResultSet')}
            description={
              queryResult.rows_affected
                ? t('common.dataGrid.affectedRowsSummary', { count: queryResult.rows_affected })
                : undefined
            }
          />
        ) : (
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
              const rowData =
                row >= 0 && row < queryResult.rows.length ? queryResult.rows[row] : undefined;
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
            headerHeight={44}
            rowHeight={28}
            formatRules={formatRules}
          />
        )}
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
          // 复制出的 INSERT / UPDATE / DELETE 要写回 SQL 里指定的那张表，不是当前库里的同名表
          tableRef: tableParts ? buildResultSetTableRef(tableParts, database, dbType) : undefined,
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
          <span
            style={{
              flex: 1,
              minWidth: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 48,
              overflow: 'auto',
            }}
          >
            {operationSql}
          </span>
          <Space size={4} style={{ flexShrink: 0 }}>
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              onClick={handleCommit}
              style={{ fontSize: 12, height: 26 }}
            >
              {t('common.submit')}
            </Button>
            <Button
              size="small"
              icon={<UndoOutlined />}
              onClick={handleUndo}
              style={{ fontSize: 12, height: 26 }}
            >
              {t('common.undo')}
            </Button>
          </Space>
        </div>
      )}

      {/* 底部状态条：行数/列数/耗时统一放这里，避免与 tab 标签和顶部工具栏重复 */}
      <div className="result-grid-status">
        <span>
          <strong>{queryResult.rows.length.toLocaleString()}</strong> {t('common.rows')}
        </span>
        <span>
          <strong>{queryResult.columns.length}</strong> {t('common.tableStructure.columns')}
        </span>
        {executionTime != null && (
          <span>
            {t('common.executionTime')} {executionTime}ms
          </span>
        )}
        {queryResult.totalTime != null &&
          queryResult.totalTime > 0 &&
          queryResult.totalTime !== executionTime && (
            <span>
              {t('common.totalDuration')} {queryResult.totalTime}ms
            </span>
          )}
        {queryResult.truncated && (
          <span className="is-warning">{t('common.dataGrid.truncatedBadge')}</span>
        )}
      </div>

      <ResultExportDialog
        open={exportDialog.open}
        initialFormat={exportDialog.format}
        columns={queryResult.columns}
        rows={queryResult.rows}
        selectedRows={selectedExportRows.length > 0 ? selectedExportRows : null}
        sql={sqlForExtract}
        connectionId={connectionId}
        database={database}
        onClose={() => setExportDialog((d) => ({ ...d, open: false }))}
      />
    </div>
  );
});

// ── ExplainPlanGrid ──
// Color-coding helpers for explain plan rows (MySQL `type` column values)
// 全部走主题令牌：亮暗模式自动翻转，且与 app 的 success/warning/error 同源
// （旧版是 GitHub 配色硬编码 + 手工暗色映射表）
const ACCESS_TYPE_COLORS: Record<
  string,
  { bg: string; fg: string; level: 'good' | 'moderate' | 'bad' }
> = {
  system: { bg: 'var(--color-success-alpha-15)', fg: 'var(--color-success)', level: 'good' },
  const: { bg: 'var(--color-success-alpha-15)', fg: 'var(--color-success)', level: 'good' },
  eq_ref: { bg: 'var(--color-success-alpha-15)', fg: 'var(--color-success)', level: 'good' },
  ref: { bg: 'var(--color-success-alpha-15)', fg: 'var(--color-success)', level: 'good' },
  range: { bg: 'var(--color-success-alpha-15)', fg: 'var(--color-success)', level: 'good' },
  index: { bg: 'var(--color-warning-alpha-15)', fg: 'var(--color-warning)', level: 'moderate' },
  ALL: { bg: 'var(--color-error-alpha-15)', fg: 'var(--color-error)', level: 'bad' },
  fulltext: { bg: 'var(--color-warning-alpha-15)', fg: 'var(--color-warning)', level: 'moderate' },
  ref_or_null: { bg: 'var(--color-success-alpha-15)', fg: 'var(--color-success)', level: 'good' },
  index_merge: {
    bg: 'var(--color-warning-alpha-15)',
    fg: 'var(--color-warning)',
    level: 'moderate',
  },
  unique_subquery: {
    bg: 'var(--color-success-alpha-15)',
    fg: 'var(--color-success)',
    level: 'good',
  },
  index_subquery: {
    bg: 'var(--color-warning-alpha-15)',
    fg: 'var(--color-warning)',
    level: 'moderate',
  },
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
    return { bg: 'var(--color-error-alpha-15)', fg: 'var(--color-error)' };
  }

  // PostgreSQL: color based on cost (if present)
  if (typeof data['Total Cost'] === 'number') {
    const cost = data['Total Cost'] as number;
    if (cost < 100) return { bg: 'var(--color-success-alpha-15)', fg: 'var(--color-success)' };
    if (cost < 10000) return { bg: 'var(--color-warning-alpha-15)', fg: 'var(--color-warning)' };
    return { bg: 'var(--color-error-alpha-15)', fg: 'var(--color-error)' };
  }

  return null;
}

// Detect MySQL-style explain output (has `id`, `select_type` columns)
function isMySQLExplain(columns: string[]): boolean {
  return columns.includes('id') || columns.includes('select_type');
}

// Detect PostgreSQL explain output (has `QUERY PLAN` or `query plan` column)
function isPGExplain(columns: string[]): boolean {
  return columns.some((c) => c.toLowerCase().includes('query plan'));
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

// 旧版暗色硬编码映射（adjustColor / darkMap）已随主题令牌化移除：
// CSS 变量在 data-theme='dark' 下自动取暗色值，无需 JS 层换算。

export function ExplainPlanGrid({ data }: { data: any[]; isDark?: boolean }) {
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
      <div
        style={{
          height: '100%',
          overflow: 'auto',
          fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: 12,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr
              style={{
                background: 'var(--background-toolbar)',
                position: 'sticky',
                top: 0,
                zIndex: 1,
              }}
            >
              <th
                style={{
                  textAlign: 'left',
                  padding: '6px 12px',
                  borderBottom: '1px solid var(--border)',
                  fontWeight: 600,
                  fontSize: 11,
                }}
              >
                {pgCol}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const text = String(row[pgCol] ?? '');
              const indent = getPGIndent(text);
              const cleanText = text.replace(/^\s*(?:->\s*)*/, '');
              const isPlanLine = /^\s*->/.test(text);
              const bg = isPlanLine
                ? i % 2 === 0
                  ? 'var(--row-stripe-bg)'
                  : 'transparent'
                : 'transparent';
              return (
                <tr key={i} style={{ background: bg }}>
                  <td
                    style={{
                      padding: '3px 12px 3px ' + (12 + indent * 20) + 'px',
                      borderBottom: '1px solid var(--border-subtle, #f0f0f0)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: isPlanLine ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {isPlanLine && (
                      <span
                        style={{
                          color: 'var(--color-primary)',
                          marginRight: 4,
                          userSelect: 'none',
                        }}
                      >
                        →
                      </span>
                    )}
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
  const priorityCols = [
    'id',
    'select_type',
    'table',
    'type',
    'possible_keys',
    'key',
    'key_len',
    'ref',
    'rows',
    'filtered',
    'Extra',
  ];
  const orderedCols = isMySQL
    ? [
        ...priorityCols.filter((c) => columns.includes(c)),
        ...columns.filter((c) => !priorityCols.includes(c)),
      ]
    : columns;

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
        fontSize: 12,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr
            style={{
              background: 'var(--background-toolbar)',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            {orderedCols.map((col) => (
              <th
                key={col}
                style={{
                  textAlign: 'left',
                  padding: '6px 10px',
                  borderBottom: '1px solid var(--border)',
                  fontWeight: 600,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  color: 'var(--text-secondary)',
                  borderRight: '1px solid var(--border-subtle, #f0f0f0)',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => {
            const color = getRowColor(row as Record<string, unknown>);
            const indent = isMySQL ? getMySQLIndent(row as Record<string, unknown>) : 0;
            const bg = color ? color.bg : rowIdx % 2 === 0 ? 'transparent' : 'var(--row-stripe-bg)';

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
                    cellColor = color.fg;
                  }
                  if (isExtraCol && /Using filesort|Using temporary/i.test(display)) {
                    cellColor = 'var(--color-error)';
                  }
                  if (isKeyCol && display === 'NULL') {
                    cellColor = 'var(--color-error)';
                  }

                  return (
                    <td
                      key={col}
                      style={{
                        padding: '4px 10px',
                        borderBottom: '1px solid var(--border-subtle, #f0f0f0)',
                        borderRight: '1px solid var(--border-subtle, #f0f0f0)',
                        whiteSpace: 'nowrap',
                        color: isNull ? 'var(--text-tertiary, #999)' : cellColor,
                        fontStyle: isNull ? 'italic' : 'normal',
                        paddingLeft: isIndentCol ? 10 + indent * 24 + 'px' : undefined,
                      }}
                    >
                      {isIndentCol && indent > 0 && (
                        <span
                          style={{
                            display: 'inline-block',
                            width: indent * 24,
                            marginRight: 4,
                            userSelect: 'none',
                            color: 'var(--text-tertiary, #999)',
                          }}
                        >
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
