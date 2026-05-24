import { CopyOutlined, FilterOutlined } from '@ant-design/icons';
import type { MenuItemConfig, MenuGroupConfig, MenuContext } from './types';
import { escapeSqlValue, escapeSqlIdentifier } from '../../utils/sqlUtils';

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
      const sql = escapeSqlValue(value, ctx.dbType);
      copyToClipboard(sql);
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
  const colInfo = ctx.columns?.find((c) => c.column_name === ctx.colName);
  const canBeNull = colInfo?.is_nullable === 'YES';
  const isEditable = ctx.isEditable && canBeNull;

  return {
    key: 'set-null',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.setNull'),
    disabled: !isEditable,
    onClick: () => {
      if (!isEditable || !ctx.onCellEdited || ctx.colName == null || ctx.rowData == null) return;
      const rowIdx = ctx.rowData.__row_index as number;
      const colIdx = ctx.queryColumns?.indexOf(ctx.colName) ?? -1;
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
  const colInfo = ctx.columns?.find((c) => c.column_name === ctx.colName);
  const hasDefault = colInfo?.column_default != null;
  const isEditable = ctx.isEditable && hasDefault;

  return {
    key: 'set-default',
    icon: <CopyOutlined />,
    label: t('common.contextMenu.setDefault'),
    disabled: !isEditable,
    onClick: () => {
      if (!isEditable || !ctx.onCellEdited || ctx.colName == null || ctx.rowData == null) return;
      const rowIdx = ctx.rowData.__row_index as number;
      const colIdx = ctx.queryColumns?.indexOf(ctx.colName) ?? -1;
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
          const where = `${escapeSqlIdentifier(colName, ctx.dbType)} = ${escapeSqlValue(value, ctx.dbType)}`;
          ctx.onSetWhereClause(where);
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
          const where = `${escapeSqlIdentifier(colName, ctx.dbType)} != ${escapeSqlValue(value, ctx.dbType)}`;
          ctx.onSetWhereClause(where);
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
          const where = `${escapeSqlIdentifier(colName, ctx.dbType)} LIKE '%${String(value).replace(/'/g, "''")}%'`;
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
      const cols = getVisibleColumns(ctx);
      const vals = ctx.selectedRows.map((r) => `(${cols.map((c) => escapeSqlValue(r[c], ctx.dbType)).join(', ')})`);
      const sql = `INSERT INTO ${escapeSqlIdentifier(ctx.tableName, ctx.dbType)} (${cols.map((c) => escapeSqlIdentifier(c, ctx.dbType)).join(', ')})
VALUES
${vals.join(',\n')};`;
      copyToClipboard(sql);
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
      const cols = getVisibleColumns(ctx);
      const sqls = targetRows.map((r) => {
        const vals = `(${cols.map((c) => escapeSqlValue(r[c], ctx.dbType)).join(', ')})`;
        return `INSERT INTO ${escapeSqlIdentifier(ctx.tableName!, ctx.dbType)} (${cols.map((c) => escapeSqlIdentifier(c, ctx.dbType)).join(', ')})
VALUES ${vals};`;
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
      const tableName = ctx.tableName;
      const sqls = ctx.selectedRows.map((r) => {
        const setters = getVisibleColumns(ctx)
          .filter((c) => c !== pkCol.column_name)
          .map((c) => `${escapeSqlIdentifier(c, ctx.dbType)} = ${escapeSqlValue(r[c], ctx.dbType)}`)
          .join(', ');
        return `UPDATE ${escapeSqlIdentifier(tableName, ctx.dbType)} SET ${setters} WHERE ${escapeSqlIdentifier(pkCol.column_name, ctx.dbType)} = ${escapeSqlValue(r[pkCol.column_name], ctx.dbType)}`;
      });
      copyToClipboard(sqls.join('\n'));
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
      const tableName = ctx.tableName;
      const sqls = ctx.selectedRows.map((r) => {
        return `DELETE FROM ${escapeSqlIdentifier(tableName, ctx.dbType)} WHERE ${escapeSqlIdentifier(pkCol.column_name, ctx.dbType)} = ${escapeSqlValue(r[pkCol.column_name], ctx.dbType)}`;
      });
      copyToClipboard(sqls.join('\n'));
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
