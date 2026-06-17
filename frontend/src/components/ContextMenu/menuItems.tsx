import { CopyOutlined, FilterOutlined } from '@ant-design/icons';
import type { MenuItemConfig, MenuGroupConfig, MenuContext } from './types';
import { getDialect } from '../../utils/sqlDialects';

// Helper: copy to clipboard
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// Helper: get visible columns
function getVisibleColumns(ctx: MenuContext): string[] {
  const all = ctx.queryColumns || [];
  const hidden = ctx.hiddenColumns || new Set<string>();
  return all.filter((c) => !hidden.has(c));
}

// 1. Copy Cell Value
export function createCopyCellValueItem(
  ctx: MenuContext,
  t: (key: string) => string,
  onClose: () => void
): MenuItemConfig {
  return {
    key: 'copy-cell-value',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.copyCellValue'),
    onClick: () => {
      const value = ctx.cellValue == null ? 'NULL' : String(ctx.cellValue);
      copyToClipboard(value);
      onClose();
    },
  };
}

// 2. Copy Cell as SQL Literal
export function createCopyCellAsSqlLiteralItem(
  ctx: MenuContext,
  t: (key: string) => string,
  onClose: () => void
): MenuItemConfig {
  return {
    key: 'copy-cell-sql-literal',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.copyAsSqlLiteral'),
    onClick: () => {
      const value = ctx.cellValue;
      const dialect = getDialect(ctx.dbType);
      copyToClipboard(dialect.escapeValue(value));
      onClose();
    },
  };
}

// 3. Set to NULL
export function createSetNullItem(
  ctx: MenuContext,
  t: (key: string) => string,
  onClose: () => void
): MenuItemConfig {
  const isEditable = ctx.isEditable && ctx.colName != null;

  return {
    key: 'set-null',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.setNull'),
    disabled: !isEditable,
    hidden: ctx.colName == null,
    onClick: () => {
      if (!isEditable || !ctx.onCellEdited) return;
      const colIdx = ctx.queryColumns?.indexOf(ctx.colName!) ?? -1;
      const rowIdx = ctx.row ?? -1;
      if (rowIdx >= 0 && colIdx >= 0) {
        ctx.onCellEdited(colIdx, rowIdx, 'NULL');
      }
      onClose();
    },
  };
}

// 4. Set to DEFAULT
export function createSetDefaultItem(
  ctx: MenuContext,
  t: (key: string) => string,
  onClose: () => void
): MenuItemConfig {
  const isEditable = ctx.isEditable;

  return {
    key: 'set-default',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.setDefault'),
    disabled: !isEditable,
    hidden: ctx.colName == null,
    onClick: () => {
      if (!isEditable || !ctx.onCellEdited) return;
      const colIdx = ctx.queryColumns?.indexOf(ctx.colName!) ?? -1;
      const rowIdx = ctx.row ?? -1;
      if (rowIdx >= 0 && colIdx >= 0) {
        ctx.onCellEdited(colIdx, rowIdx, 'DEFAULT');
      }
      onClose();
    },
  };
}

// 5. Quick Filter Items (Group)
export function createQuickFilterItems(
  ctx: MenuContext,
  t: (key: string) => string,
  onClose: () => void
): MenuGroupConfig {
  const colName = ctx.colName;
  const value = ctx.cellValue;
  const dialect = getDialect(ctx.dbType);

  const eqValue = dialect.escapeValue(value);
  const colRef = colName ? dialect.escapeIdentifier(colName) : '';

  return {
    type: 'group',
    label: t('common.contextMenu.quickFilter'),
    items: [
      {
        key: 'quick-filter-eq',
        icon: <FilterOutlined />,
        label: t('common.contextMenu.equals'),
        disabled: colName == null,
        onClick: () => {
          if (!colName || !ctx.onSetWhereClause) return;
          ctx.onSetWhereClause(`${colRef} = ${eqValue}`);
          onClose();
        },
      },
      {
        key: 'quick-filter-ne',
        icon: <FilterOutlined />,
        label: t('common.contextMenu.notEquals'),
        disabled: colName == null,
        onClick: () => {
          if (!colName || !ctx.onSetWhereClause) return;
          ctx.onSetWhereClause(`${colRef} != ${eqValue}`);
          onClose();
        },
      },
      {
        key: 'quick-filter-like',
        icon: <FilterOutlined />,
        label: t('common.contextMenu.contains'),
        disabled: colName == null || value == null,
        onClick: () => {
          if (!colName || !ctx.onSetWhereClause) return;
          const { condition, value: escapedVal } = dialect.buildLikeCondition(colName, `%${String(value)}%`);
          const where = condition.replace('?', dialect.escapeValue(escapedVal));
          ctx.onSetWhereClause(where);
          onClose();
        },
      },
    ],
  };
}

// 6. Copy as INSERT (批量)
export function createCopyAsInsertItem(
  ctx: MenuContext,
  t: (key: string) => string,
  onClose: () => void
): MenuItemConfig {
  const hasRows = (ctx.selectedRows?.length ?? 0) > 0;
  return {
    key: 'copy-as-insert',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.copyAsInsert'),
    disabled: !hasRows || !ctx.tableName,
    onClick: () => {
      if (!ctx.tableName || !ctx.selectedRows?.length) return;
      const dialect = getDialect(ctx.dbType);
      const tableRef = dialect.buildTableRef(ctx.tableName, ctx.database);
      const cols = getVisibleColumns(ctx);
      const values = ctx.selectedRows.map((r) => cols.map((c) => r[c]));
      const sqls = dialect.buildInsert(tableRef, cols, values);
      copyToClipboard(sqls.join(';\n') + ';');
      onClose();
    },
  };
}

// 6b. Copy as INSERT (单行 - 每个选中的行生成一个独立 INSERT)
export function createCopyAsSingleInsertItem(
  ctx: MenuContext,
  t: (key: string) => string,
  onClose: () => void
): MenuItemConfig {
  const selectedRows = ctx.selectedRows || [];
  const targetRows = selectedRows.length > 0 ? selectedRows : ctx.rowData ? [ctx.rowData] : [];
  const hasRows = targetRows.length > 0;
  return {
    key: 'copy-as-single-insert',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.copyAsSingleInsert'),
    disabled: !hasRows || !ctx.tableName,
    onClick: () => {
      if (!ctx.tableName || targetRows.length === 0) return;
      const dialect = getDialect(ctx.dbType);
      const tableRef = dialect.buildTableRef(ctx.tableName, ctx.database);
      const cols = getVisibleColumns(ctx);
      const sqls = targetRows.map((r) => {
        const vals = [cols.map((c) => r[c])];
        return dialect.buildInsert(tableRef, cols, vals)[0] + ';';
      });
      copyToClipboard(sqls.join('\n'));
      onClose();
    },
  };
}

// 7. Copy as UPDATE
export function createCopyAsUpdateItem(
  ctx: MenuContext,
  t: (key: string) => string,
  onClose: () => void
): MenuItemConfig {
  const hasRows = (ctx.selectedRows?.length ?? 0) > 0;
  const pkCol = ctx.columns?.find((c) => c.column_key === 'PRI');
  return {
    key: 'copy-as-update',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.copyAsUpdate'),
    disabled: !hasRows || !ctx.tableName || !pkCol,
    onClick: () => {
      if (!ctx.tableName || !ctx.selectedRows?.length || !pkCol) return;
      const dialect = getDialect(ctx.dbType);
      const tableRef = dialect.buildTableRef(ctx.tableName, ctx.database);
      const sqls = ctx.selectedRows.map((r) => {
        const setters: Record<string, unknown> = {};
        for (const c of getVisibleColumns(ctx)) {
          if (c !== pkCol.column_name) setters[c] = r[c];
        }
        const where = `${dialect.escapeIdentifier(pkCol.column_name)} = ${dialect.escapeValue(r[pkCol.column_name])}`;
        return dialect.buildUpdate(tableRef, setters, where);
      });
      copyToClipboard(sqls.join(';\n') + ';');
      onClose();
    },
  };
}

// 8. Copy as DELETE
export function createCopyAsDeleteItem(
  ctx: MenuContext,
  t: (key: string) => string,
  onClose: () => void
): MenuItemConfig {
  const hasRows = (ctx.selectedRows?.length ?? 0) > 0;
  const pkCol = ctx.columns?.find((c) => c.column_key === 'PRI');
  return {
    key: 'copy-as-delete',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.copyAsDelete'),
    disabled: !hasRows || !ctx.tableName || !pkCol,
    onClick: () => {
      if (!ctx.tableName || !ctx.selectedRows?.length || !pkCol) return;
      const dialect = getDialect(ctx.dbType);
      const tableRef = dialect.buildTableRef(ctx.tableName, ctx.database);
      const sqls = ctx.selectedRows.map((r) => {
        const where = `${dialect.escapeIdentifier(pkCol.column_name)} = ${dialect.escapeValue(r[pkCol.column_name])}`;
        return dialect.buildDelete(tableRef, where);
      });
      copyToClipboard(sqls.join(';\n') + ';');
      onClose();
    },
  };
}

// 9. Copy Row as JSON
export function createCopyRowAsJsonItem(
  ctx: MenuContext,
  t: (key: string) => string,
  onClose: () => void
): MenuItemConfig {
  const hasRows = (ctx.selectedRows?.length ?? 0) > 0;
  return {
    key: 'copy-row-json',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.copyAsJson'),
    disabled: !hasRows,
    onClick: () => {
      if (!ctx.selectedRows?.length) return;
      const json = ctx.selectedRows.map((r) => {
        const obj: Record<string, unknown> = {};
        getVisibleColumns(ctx).forEach((c) => {
          obj[c] = r[c];
        });
        return obj;
      });
      copyToClipboard(JSON.stringify(json.length === 1 ? json[0] : json, null, 2));
      onClose();
    },
  };
}
