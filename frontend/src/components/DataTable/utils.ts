import type { ColumnInfo } from '../../types/api';
import { getDialect } from '../../utils/sqlDialects';

export const DEFAULT_MARKER = Symbol('DEFAULT');

/**
 * 规范化比较两个编辑值是否"相同"——用于判断编辑后值是否真正变化。
 * 与撤销逻辑（DataTable onRestore / ResultGrid handleCellEdited）保持一致：
 *   - null / undefined 互相视为相等
 *   - DEFAULT_MARKER（Symbol）用引用比较（=== 已覆盖）
 *   - 其他值用 String() 规范化后比较（数字 5 与字符串 "5" 视为相等，
 *     兼容 glide 显示值字符串化 vs 存储值原始类型的不一致）
 */
export function isSameEditValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const aNull = a == null;
  const bNull = b == null;
  if (aNull && bNull) return true;
  if (aNull || bNull) return false;
  return String(a) === String(b);
}

export interface FilterCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
  logic: 'AND' | 'OR';
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
  level?: number;
}

export interface RowData {
  [key: string]: any;
  __row_id__?: string;
  __status__?: 'new' | 'modified' | 'deleted';
  __original_data__?: Record<string, any>;
}

export interface DataTableProps {
  connectionId: string;
  tableName: string;
  database?: string;
  pageSize?: number;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function buildSingleCondition(cond: FilterCondition, dbType?: string): string {
  const dialect = getDialect(dbType);
  const field = dialect.escapeIdentifier(cond.field);

  switch (cond.operator) {
    case 'equals':
      return `${field} = ${dialect.escapeValue(cond.value)}`;
    case 'notEquals':
      return `${field} != ${dialect.escapeValue(cond.value)}`;
    case 'contains': {
      const { condition } = dialect.buildLikeCondition(cond.field, `%${cond.value}%`);
      return condition.replace('?', dialect.escapeValue(`%${cond.value}%`));
    }
    case 'notContains': {
      const { condition } = dialect.buildLikeCondition(cond.field, `%${cond.value}%`, true);
      return condition.replace('?', dialect.escapeValue(`%${cond.value}%`));
    }
    case 'startsWith': {
      const { condition } = dialect.buildLikeCondition(cond.field, `${cond.value}%`);
      return condition.replace('?', dialect.escapeValue(`${cond.value}%`));
    }
    case 'endsWith': {
      const { condition } = dialect.buildLikeCondition(cond.field, `%${cond.value}`);
      return condition.replace('?', dialect.escapeValue(`%${cond.value}`));
    }
    case 'isNull':
      return `${field} IS NULL`;
    case 'isNotNull':
      return `${field} IS NOT NULL`;
    case 'in': {
      const values = cond.value.split(',').map((v) => dialect.escapeValue(v.trim()));
      return `${field} IN (${values.join(', ')})`;
    }
    case 'notIn': {
      const values = cond.value.split(',').map((v) => dialect.escapeValue(v.trim()));
      return `${field} NOT IN (${values.join(', ')})`;
    }
    default:
      return `${field} = ${dialect.escapeValue(cond.value)}`;
  }
}

export function buildWhereClause(conditions: FilterCondition[], dbType?: string): string {
  const validConditions = conditions.filter((c) => c.field && c.operator);

  if (validConditions.length === 0) return '';

  let result = '';

  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];

    if (cond.isGroupStart) {
      result += '(';
      continue;
    }

    if (cond.isGroupEnd) {
      const slice = conditions
        .slice(lastValidIndex(i, conditions), i)
        .filter((c) => c.field && c.operator);
      if (slice.length > 0) {
        const subClauses = slice
          .map((c, idx) => {
            const clause = buildSingleCondition(c, dbType);
            if (idx === 0) return clause;
            return `${c.logic} ${clause}`;
          })
          .join(' ');
        result += ` ${subClauses})`;
      }
      continue;
    }

    if (!cond.field || !cond.operator) continue;

    const prevCond = i > 0 ? conditions[i - 1] : null;
    const needLogic =
      prevCond &&
      !prevCond.isGroupStart &&
      !prevCond.isGroupEnd &&
      prevCond.field &&
      prevCond.operator;

    if (needLogic) {
      result += ` ${cond.logic} ${buildSingleCondition(cond, dbType)}`;
    } else {
      result += buildSingleCondition(cond, dbType);
    }
  }

  return result.trim().replace(/\s+/g, ' ');

  function lastValidIndex(endIdx: number, conds: FilterCondition[]): number {
    for (let j = endIdx - 1; j >= 0; j--) {
      if (conds[j].field && conds[j].operator) return j + 1;
      if (conds[j].isGroupStart) return j + 1;
    }
    return 0;
  }
}

export function buildQuery(
  page: number,
  size: number,
  tableName: string,
  database: string | undefined,
  dbType: string | undefined,
  sort: { colId: string; sort: 'asc' | 'desc' }[] | undefined,
  whereClause: string,
  orderByClause: string,
  overrideWhere?: string,
  overrideOrderBy?: string
): string {
  const dialect = getDialect(dbType);
  const tableRef = dialect.buildTableRef(tableName, database);
  const offset = (page - 1) * size;

  const whereToUse = overrideWhere !== undefined ? overrideWhere : whereClause;
  const orderByToUse = overrideOrderBy !== undefined ? overrideOrderBy : orderByClause;

  let orderBy = orderByToUse;
  if (!orderBy && sort && sort.length > 0) {
    orderBy = sort
      .map((s) => `${dialect.escapeIdentifier(s.colId)} ${s.sort.toUpperCase()}`)
      .join(', ');
  }

  let sql = `SELECT * FROM ${tableRef}`;
  if (whereToUse) {
    sql += ` WHERE ${whereToUse}`;
  }
  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }

  return dialect.buildPaginationQuery(sql, { offset, limit: size });
}

export function buildCountQuery(
  tableName: string,
  database: string | undefined,
  dbType: string | undefined,
  whereClause: string,
  overrideWhere?: string
): string {
  const dialect = getDialect(dbType);
  const tableRef = dialect.buildTableRef(tableName, database);
  const whereToUse = overrideWhere !== undefined ? overrideWhere : whereClause;
  return dialect.buildCountQuery(tableRef, whereToUse || undefined);
}
